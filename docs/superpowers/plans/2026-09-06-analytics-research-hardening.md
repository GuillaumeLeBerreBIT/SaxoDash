# Analytics & Research Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Backend coach-mode note (AGENTS.md):** every backend task here is written for the *user* to type, with the assistant reviewing. The code blocks are the reference implementation, not a licence to edit `backend/` directly. Frontend tasks follow propose-then-choose.

**Goal:** Stop the recurring SQLite `database is locked` failures, then close the four "Strong" findings from the 2026-09-06 two-provider architecture review (throttling, the unauthenticated Saxo connect endpoint, the split provider→HTTP seam, and Analytics reaching into Saxo through Research).

**Architecture:** Five independent workstreams, each shippable on its own and sequenced so earlier ones de-risk later ones. WS0 is a settings + task-wrapper change. WS1–WS2 are additive (throttle config, a signed-ticket endpoint). WS3 introduces one `research/providers.py` seam that both data providers raise through. WS4 gives `analytics/benchmarks.py` a real interface so `analytics/` stops importing `saxo.*`.

**Tech Stack:** Django 6.0.7, DRF 3.17, SimpleJWT, Celery 5.6 + django-celery-beat (DatabaseScheduler), Redis (cache = `django.core.cache.backends.redis.RedisCache` on DB 1), SQLite (dev), Vite + React 19, TanStack Query, Vitest.

**Spec:** `/var/folders/j1/h72pz5qj49j1lth5mxfysbx00000gp/T/architecture-review-20260906-222509.html` (the review report) plus the conversation that produced it. This plan implements findings **S1, S3, A1 (incl. S2), A2 (incl. A3)** and the newly-reported `database is locked` bug.

## Global Constraints

- Django **6.0.7** — `OPTIONS['transaction_mode']` and `OPTIONS['init_command']` for the SQLite backend are both supported (added 5.1). Do not add a `connection_created` signal handler; use `OPTIONS`.
- Backend tests: one `rest_framework.test.APITestCase` (views) or `django.test.TestCase` (pure functions) per concern, matching the existing files `backend/research/tests.py` and `backend/analytics/tests.py`. Authenticate with `self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')` as those files already do.
- The test cache is the configured Redis cache (DB 1). Tests that touch throttling or the fundamentals negative-cache **must** call `cache.clear()` in `setUp`.
- Frontend: JavaScript (not TS), React 19, existing bespoke `components/ui.jsx` primitives. Add/adjust Vitest specs alongside any `frontend/` change.
- Keep inline comments short (AGENTS.md code style). Rationale goes in the commit message / PR, not the source.
- Commit after every green step. Conventional-commit prefixes (`fix:`, `feat:`, `refactor:`, `docs:`), matching git history.
- Every backend commit runs the full suite first: `cd backend && .venv/bin/python manage.py test` — 274 tests must stay green.

---

## File Structure

**WS0 — SQLite lock**
- Modify: `backend/backend/settings.py` — `DATABASES['default']['OPTIONS']`.
- Modify: `backend/saxo/tasks.py` — `synced()` wrapper gains a non-blocking cross-task lock.
- Modify: `backend/.gitignore` (or root `.gitignore`) — WAL sidecar files.
- Modify: `scripts/dev.sh` — worker `--concurrency=2`.
- Create: `scripts/repro_sqlite_lock.py` — a management-shell script that reproduces the failure before WS0 and passes after.
- Test: `backend/saxo/tests.py` — one test for the skip-on-contended-lock path.

**WS1 — throttling + fundamentals negative cache**
- Modify: `backend/backend/settings.py` — `REST_FRAMEWORK` throttle keys.
- Modify: `backend/research/views.py` — `throttle_scope` on the five proxy views.
- Modify: `backend/research/finnhub.py` — `fundamentals()` caches the "no data" outcome for a short TTL.
- Test: `backend/research/tests.py` — a throttle test and a negative-cache test.

**WS2 — authenticated Saxo connect**
- Modify: `backend/saxo/views.py` — `SaxoConnectTicketView` (new), `SaxoConnectView` validates a ticket.
- Modify: `backend/saxo/urls.py` — `connect-ticket/` route.
- Modify: `frontend/src/api/client.js` — `connectSaxo` becomes async (fetch ticket → redirect).
- Modify: `frontend/src/components/SaxoConnectionStatus.jsx` — `onClick={connectSaxo}` already works with an async fn; no change unless lint complains.
- Test: `backend/saxo/tests.py` — ticket required / expired / valid. `frontend/src/api/client.test.js` — `connectSaxo` posts then redirects.

**WS3 — one provider→HTTP seam (A1 + S2)**
- Create: `backend/research/providers.py` — `ProviderError` hierarchy + `provider_response(produce)`.
- Modify: `backend/research/finnhub.py` — exceptions subclass `ProviderError` with `http_status` / `body`.
- Modify: `backend/research/views.py` — delete `_market_response` and `FundamentalsView`'s bespoke try/except; both call `provider_response`.
- Test: `backend/research/tests.py` — adjust `MarketDataViewTest`; add fundamentals 502-hides-upstream-body and 200-with-`available:false` tests.

**WS4 — benchmarks seam (A2 + A3)**
- Modify: `backend/analytics/benchmarks.py` — `BenchmarkUnavailable`; `eur_closes` catches connect / empty / bad-FX internally.
- Create: `backend/analytics/report.py` — `risk_report(...)`, `performance_report(...)`.
- Modify: `backend/analytics/views.py` — thin views; drop `from saxo.credentials import SaxoNotConnected`.
- Test: `backend/analytics/tests.py` — `BenchmarkEurClosesTest` raises `BenchmarkUnavailable`; `RiskMetricsViewTest` no longer 500s on zero FX; one `report.py` test per function.

---

# WS0 — Fix `database is locked`

**Root cause (confirmed from `.dev/logs/worker.log`):** `DATABASES['default']` has no `OPTIONS`, so SQLite runs in rollback-journal mode with `DEFERRED` transactions. `sync_positions` and `sync_account_balance` fire on the same beat tick into an 8-process prefork pool; one holds `RESERVED` while the other, mid-`DEFERRED`-transaction, tries to upgrade `SHARED → RESERVED`. SQLite returns `SQLITE_BUSY` immediately without invoking the busy handler (deadlock avoidance), so the 5 s timeout never applies — hence the sub-500 ms failure.

### Task 0.1: SQLite `OPTIONS` — WAL + IMMEDIATE + 20 s timeout

**Files:**
- Modify: `backend/backend/settings.py:136-141`
- Modify: root `.gitignore`
- Create: `scripts/repro_sqlite_lock.py`

**Interfaces:**
- Consumes: nothing.
- Produces: a database that permits one writer + concurrent readers, and queues a second writer on a 20 s busy timeout instead of failing instantly.

- [ ] **Step 1: Write the reproduction script**

Create `scripts/repro_sqlite_lock.py`:

```python
"""Reproduce (pre-WS0) / disprove (post-WS0) the concurrent-writer lock.

Run:  cd backend && .venv/bin/python manage.py shell < ../scripts/repro_sqlite_lock.py
Pre-WS0  -> prints "LOCKED" within ~1s.
Post-WS0 -> prints "OK: both writers committed".
"""
import threading
import time

from django.db import connections, transaction

from portfolio.models import Position

RESULT = {}


def writer(name, ticker):
    try:
        with transaction.atomic():
            Position.objects.update_or_create(
                ticker=ticker,
                defaults={'name': name, 'qty': 1, 'avg_cost': 1, 'current_price': 1},
            )
            time.sleep(0.5)  # hold the write lock so the other writer collides
        RESULT[name] = 'committed'
    except Exception as exc:  # noqa: BLE001 - this is a probe
        RESULT[name] = f'{type(exc).__name__}: {exc}'
    finally:
        connections.close_all()


a = threading.Thread(target=writer, args=('probe-a', 'ZZZ-REPRO-A'))
b = threading.Thread(target=writer, args=('probe-b', 'ZZZ-REPRO-B'))
a.start(); b.start(); a.join(); b.join()

Position.objects.filter(ticker__startswith='ZZZ-REPRO-').delete()

if any('LOCKED' in v.upper() or 'OPERATIONALERROR' in v.upper() for v in RESULT.values()):
    print('LOCKED', RESULT)
else:
    print('OK: both writers committed', RESULT)
```

> Adjust the `defaults={...}` keys to whatever `Position` actually requires as NOT NULL — check `portfolio/models.py` first.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && .venv/bin/python manage.py shell < ../scripts/repro_sqlite_lock.py`
Expected: `LOCKED {...'OperationalError: database is locked'...}`

- [ ] **Step 3: Add `OPTIONS` to the SQLite config**

`backend/backend/settings.py`, replace the `DATABASES` block:

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
        'OPTIONS': {
            'timeout': 20,
            'transaction_mode': 'IMMEDIATE',
            'init_command': (
                'PRAGMA journal_mode=WAL;'
                'PRAGMA synchronous=NORMAL;'
                'PRAGMA foreign_keys=ON;'
            ),
        },
    }
}
```

- [ ] **Step 4: Ignore the WAL sidecar files**

Append to the root `.gitignore`:

```
db.sqlite3-wal
db.sqlite3-shm
```

- [ ] **Step 5: Run the reproduction script again**

Run: `cd backend && .venv/bin/python manage.py shell < ../scripts/repro_sqlite_lock.py`
Expected: `OK: both writers committed {'probe-a': 'committed', 'probe-b': 'committed'}`

- [ ] **Step 6: Confirm WAL is active on the real DB file**

Run: `cd backend && sqlite3 db.sqlite3 'PRAGMA journal_mode;'`
Expected: `wal`

- [ ] **Step 7: Full suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: 274 passed. (Test DB is `:memory:`; the point is nothing regressed.)

- [ ] **Step 8: Commit**

```bash
git add backend/backend/settings.py .gitignore scripts/repro_sqlite_lock.py
git commit -m "fix: run SQLite in WAL with IMMEDIATE transactions to end lock errors"
```

---

### Task 0.2: Serialise the sync tasks with a non-blocking lock

Rationale: Task 0.1 removes the *reported* failure. This removes the *scenario* — three sync tasks writing concurrently — so a future long-running task or a lower `timeout` can't bring it back. Non-blocking (skip, don't queue) keeps workers from piling up; a skipped tick is caught by the next one.

**Files:**
- Modify: `backend/saxo/tasks.py:33-67` (`synced`)
- Modify: `scripts/dev.sh:104`
- Test: `backend/saxo/tests.py`

**Interfaces:**
- Consumes: `django.core.cache.cache` (Redis; supports `.lock()`).
- Produces: `synced`-wrapped tasks (`sync_positions`, `sync_account_balance`) skip with `SyncRun(outcome='skipped', detail='another sync is running')` when they cannot immediately take the lock `SAXO_SYNC_LOCK`. `research.tasks.sync_watchlists` is **not** `@synced` and is unaffected — that's fine, it does one tiny write.

- [ ] **Step 1: Write the failing test**

`backend/saxo/tests.py` (new test, near the other task tests):

```python
from django.core.cache import cache
from saxo import tasks as saxo_tasks

class SyncLockTest(TestCase):
    def setUp(self):
        cache.clear()
        # a usable credential so synced() gets past its preamble
        SaxoCredential.objects.create(
            access_token='t', refresh_token='r',
            expires_at=timezone.now() + timedelta(hours=1), environment='sim',
        )

    def test_skips_when_lock_is_held(self):
        held = cache.lock(saxo_tasks.SAXO_SYNC_LOCK)
        self.assertTrue(held.acquire(blocking=False))
        try:
            result = saxo_tasks.sync_account_balance()
        finally:
            held.release()

        self.assertIsNone(result)
        run = SyncRun.objects.latest('id')
        self.assertEqual(run.outcome, 'skipped')
        self.assertIn('another sync', run.detail)
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd backend && .venv/bin/python manage.py test saxo.tests.SyncLockTest -v 2`
Expected: FAIL — `AttributeError: module 'saxo.tasks' has no attribute 'SAXO_SYNC_LOCK'`.

- [ ] **Step 3: Add the lock to `synced`**

`backend/saxo/tasks.py` — add the constant near the top and wrap the body:

```python
from django.core.cache import cache

SAXO_SYNC_LOCK = 'saxo-sync-lock'
SYNC_LOCK_TTL = 300  # a wedged holder self-releases well before the next beat cycle
```

Inside `run(*args, **kwargs)`, after the credential is resolved, wrap the `fn(...)` call:

```python
        lock = cache.lock(SAXO_SYNC_LOCK, timeout=SYNC_LOCK_TTL)
        if not lock.acquire(blocking=False):
            SyncRun.objects.create(
                task=fn.__name__, outcome='skipped',
                detail='another sync is running; next tick will catch up',
            )
            logger.info('Skipping %s: another sync holds the lock', fn.__name__)
            return

        try:
            rows = fn(credential, *args, **kwargs)
        except Exception as exc:
            SyncRun.objects.create(task=fn.__name__, outcome='failed', detail=str(exc)[:200])
            raise
        finally:
            lock.release()

        SyncRun.objects.create(task=fn.__name__, outcome='ok', rows=rows)
        return rows
```

- [ ] **Step 4: Run the test, watch it pass**

Run: `cd backend && .venv/bin/python manage.py test saxo.tests.SyncLockTest -v 2`
Expected: PASS.

- [ ] **Step 5: Drop worker concurrency to 2**

`scripts/dev.sh:104` — change the worker command:

```sh
  '"$VENV/bin/celery" -A backend worker -l info --concurrency=2'
```

- [ ] **Step 6: Full suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: 275 passed (274 + the new one).

- [ ] **Step 7: Commit**

```bash
git add backend/saxo/tasks.py backend/saxo/tests.py scripts/dev.sh
git commit -m "fix: serialise Saxo sync tasks behind one lock, cap worker concurrency"
```

---

# WS1 — Throttling + fundamentals negative cache (finding S1)

### Task 1.1: `ScopedRateThrottle` on the five Research proxy views

**Files:**
- Modify: `backend/backend/settings.py:84-93` (`REST_FRAMEWORK`)
- Modify: `backend/research/views.py` — `throttle_scope` on `ChartView`, `QuotesView`, `InstrumentSearchView`, `InstrumentDetailsView`, `FundamentalsView`
- Test: `backend/research/tests.py`

**Interfaces:**
- Consumes: nothing.
- Produces: each proxy view returns `429` once its per-minute scope is exceeded. Scopes: `research.search` 20/min, `research.market` 60/min, `research.fundamentals` 30/min.

- [ ] **Step 1: Write the failing test**

`backend/research/tests.py`, new class:

```python
from django.core.cache import cache
from django.test import override_settings

@override_settings(REST_FRAMEWORK={
    **settings.REST_FRAMEWORK,
    'DEFAULT_THROTTLE_CLASSES': ['rest_framework.throttling.ScopedRateThrottle'],
    'DEFAULT_THROTTLE_RATES': {'research.search': '3/min'},
})
class ThrottleTest(APITestCase):
    def setUp(self):
        cache.clear()
        user = User.objects.create_user('t', password='p')
        token = str(RefreshToken.for_user(user).access_token)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_search_is_throttled_after_its_rate(self):
        url = '/api/research/instruments/?q=nv'
        codes = [self.client.get(url).status_code for _ in range(4)]
        self.assertEqual(codes[-1], 429)
```

> Match the imports/`User`/`RefreshToken` usage already at the top of `research/tests.py`. `import` `settings` from `django.conf`.

- [ ] **Step 2: Run it, watch it fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.ThrottleTest -v 2`
Expected: FAIL — `codes[-1]` is `200`, not `429`.

- [ ] **Step 3: Add throttle config to settings**

`backend/backend/settings.py`, inside `REST_FRAMEWORK`:

```python
    'DEFAULT_THROTTLE_CLASSES': ['rest_framework.throttling.ScopedRateThrottle'],
    'DEFAULT_THROTTLE_RATES': {
        'research.search': '20/min',
        'research.market': '60/min',
        'research.fundamentals': '30/min',
    },
```

- [ ] **Step 4: Tag the views**

`backend/research/views.py` — one attribute per class:

```python
class ChartView(APIView):
    throttle_scope = 'research.market'

class InstrumentSearchView(APIView):
    throttle_scope = 'research.search'

class InstrumentDetailsView(APIView):
    throttle_scope = 'research.market'

class QuotesView(APIView):
    throttle_scope = 'research.market'

class FundamentalsView(APIView):
    throttle_scope = 'research.fundamentals'
```

- [ ] **Step 5: Run the test, watch it pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.ThrottleTest -v 2`
Expected: PASS.

- [ ] **Step 6: Full suite — check nothing else trips the limiter**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: 275 passed. If a pre-existing test loops one endpoint >20×, add `cache.clear()` to its `setUp` or bump that test's scope via `@override_settings`.

- [ ] **Step 7: Commit**

```bash
git add backend/backend/settings.py backend/research/views.py backend/research/tests.py
git commit -m "feat: rate-limit the Saxo/Finnhub proxy endpoints per scope"
```

---

### Task 1.2: Cache the "Finnhub has no data" outcome for a short TTL

Today `fundamentals()` uses `cache.get_or_set`, which never stores a raised `FinnhubNoData` — so every request for an unknown ticker re-hits Finnhub with 4 calls. Cache the negative outcome for 1 h; keep the positive at 24 h.

**Files:**
- Modify: `backend/research/finnhub.py:69-166`
- Test: `backend/research/tests.py` (the existing Finnhub shaping/`fundamentals` tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: `fundamentals(symbol)` unchanged for callers — returns the dict on success, raises `FinnhubNoData` for an unknown symbol — but a second call for the same unknown symbol within `NO_DATA_TTL` raises **without any Finnhub HTTP call**.

- [ ] **Step 1: Write the failing test**

```python
class FundamentalsNegativeCacheTest(TestCase):
    def setUp(self):
        cache.clear()

    @mock.patch('research.finnhub._get')
    def test_unknown_symbol_hits_finnhub_only_once(self, mock_get):
        mock_get.return_value = {}  # empty profile -> FinnhubNoData
        with self.assertRaises(finnhub.FinnhubNoData):
            finnhub.fundamentals('ZZZZ')
        with self.assertRaises(finnhub.FinnhubNoData):
            finnhub.fundamentals('ZZZZ')
        self.assertEqual(mock_get.call_count, 1)  # profile call only, second time served from cache
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FundamentalsNegativeCacheTest -v 2`
Expected: FAIL — `call_count` is `2`.

- [ ] **Step 3: Replace `get_or_set` with explicit positive/negative caching**

`backend/research/finnhub.py`:

```python
FUNDAMENTALS_TTL = 86400
NO_DATA_TTL = 3600
_NO_DATA = {'__no_data__': True}


def _produce(symbol):
    profile = get_profile(symbol)
    if not profile.get('name'):
        raise FinnhubNoData(symbol)
    return to_fundamentals(
        profile,
        get_basic_financials(symbol),
        get_recommendation_trends(symbol),
        get_earnings_history(symbol),
    )


def fundamentals(symbol):
    key = _cache_key(symbol)
    cached = cache.get(key)
    if cached == _NO_DATA:
        raise FinnhubNoData(symbol)
    if cached is not None:
        return cached

    try:
        data = _produce(symbol)
    except FinnhubNoData:
        cache.set(key, _NO_DATA, NO_DATA_TTL)
        raise

    cache.set(key, data, FUNDAMENTALS_TTL)
    return data
```

Delete the old `produce` closure and the `cache.get_or_set` line.

- [ ] **Step 4: Run the test, watch it pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FundamentalsNegativeCacheTest -v 2`
Expected: PASS.

- [ ] **Step 5: Full Finnhub + view suite**

Run: `cd backend && .venv/bin/python manage.py test research`
Expected: all green. Adjust any existing test that asserted on `get_or_set` internals.

- [ ] **Step 6: Commit**

```bash
git add backend/research/finnhub.py backend/research/tests.py
git commit -m "feat: negative-cache unknown Finnhub symbols for an hour"
```

---

# WS2 — Authenticated Saxo connect (finding S3)

`SaxoConnectView` is `AllowAny` and its callback overwrites the single global `SaxoCredential`. The browser reaches it by full-page navigation (no `Authorization` header, JWT isn't a cookie), so the gate is a short-lived signed ticket minted by an authenticated request.

### Task 2.1: Backend — mint and require a connect ticket

**Files:**
- Modify: `backend/saxo/views.py`
- Modify: `backend/saxo/urls.py`
- Test: `backend/saxo/tests.py`

**Interfaces:**
- Consumes: `django.core.signing.TimestampSigner`.
- Produces:
  - `POST /api/saxo/connect-ticket/` (auth required) → `{"ticket": "<signed>"}`.
  - `GET /api/saxo/connect/?ticket=<signed>` → 302 to Saxo authorize when the ticket verifies and is < 120 s old; **403** otherwise.
  - `GET /api/saxo/callback/` unchanged (still `AllowAny`, still guarded by the session `state` nonce).

- [ ] **Step 1: Write the failing tests**

`backend/saxo/tests.py`:

```python
from django.core.signing import TimestampSigner

class ConnectTicketTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user('t', password='p')
        self.token = str(RefreshToken.for_user(self.user).access_token)

    def test_ticket_endpoint_requires_auth(self):
        self.assertEqual(self.client.post('/api/saxo/connect-ticket/').status_code, 401)

    def test_connect_without_ticket_is_forbidden(self):
        self.assertEqual(self.client.get('/api/saxo/connect/').status_code, 403)

    def test_connect_with_stale_ticket_is_forbidden(self):
        stale = TimestampSigner(salt='saxo-connect').sign('1')
        with mock.patch('saxo.views._TICKET_MAX_AGE', -1):
            self.assertEqual(
                self.client.get(f'/api/saxo/connect/?ticket={stale}').status_code, 403
            )

    def test_valid_ticket_redirects_to_saxo(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token}')
        ticket = self.client.post('/api/saxo/connect-ticket/').json()['ticket']
        self.client.credentials()  # drop auth; the ticket is the credential now
        resp = self.client.get(f'/api/saxo/connect/?ticket={ticket}')
        self.assertEqual(resp.status_code, 302)
        self.assertIn('logonvalidation.net', resp['Location'])
```

- [ ] **Step 2: Run them, watch them fail**

Run: `cd backend && .venv/bin/python manage.py test saxo.tests.ConnectTicketTest -v 2`
Expected: FAIL — no `connect-ticket/` route (404), and `connect/` still 302s without a ticket.

- [ ] **Step 3: Implement**

`backend/saxo/views.py`:

```python
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.http import HttpResponseForbidden
from rest_framework.permissions import IsAuthenticated

_ticket_signer = TimestampSigner(salt='saxo-connect')
_TICKET_MAX_AGE = 120


class SaxoConnectTicketView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({'ticket': _ticket_signer.sign(str(request.user.pk))})


class SaxoConnectView(APIView):
    permission_classes = [AllowAny]  # the ticket is the credential

    def get(self, request):
        try:
            _ticket_signer.unsign(request.query_params.get('ticket', ''), max_age=_TICKET_MAX_AGE)
        except (BadSignature, SignatureExpired):
            return HttpResponseForbidden('A fresh connect ticket is required.')

        state = secrets.token_urlsafe(24)
        request.session['saxo_oauth_state'] = state
        return redirect(client.build_authorize_url(state))
```

`backend/saxo/urls.py`:

```python
from .views import SaxoCallbackView, SaxoConnectTicketView, SaxoConnectView, SaxoStatusView

urlpatterns = [
    path('connect-ticket/', SaxoConnectTicketView.as_view(), name='saxo-connect-ticket'),
    path('connect/', SaxoConnectView.as_view(), name='saxo-connect'),
    path('callback/', SaxoCallbackView.as_view(), name='saxo-callback'),
    path('status/', SaxoStatusView.as_view(), name='saxo-status'),
]
```

- [ ] **Step 4: Run the tests, watch them pass**

Run: `cd backend && .venv/bin/python manage.py test saxo.tests.ConnectTicketTest -v 2`
Expected: PASS (4).

- [ ] **Step 5: Full suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: green (+4).

- [ ] **Step 6: Commit**

```bash
git add backend/saxo/views.py backend/saxo/urls.py backend/saxo/tests.py
git commit -m "feat: require a signed ticket to start the Saxo OAuth flow"
```

---

### Task 2.2: Frontend — fetch a ticket, then redirect

**Files:**
- Modify: `frontend/src/api/client.js:154`
- Test: `frontend/src/api/client.test.js`

**Interfaces:**
- Consumes: `POST /api/saxo/connect-ticket/` via the existing `apiFetch` (adds the `Authorization` header).
- Produces: `connectSaxo()` — now `async` — POSTs for a ticket then sets `window.location.href = ${BASE_URL}/api/saxo/connect/?ticket=<ticket>`. `onClick={connectSaxo}` in `SaxoConnectionStatus.jsx` still works (the returned promise is ignored).

- [ ] **Step 1: Write the failing test**

`frontend/src/api/client.test.js`, matching the file's existing mock-fetch style:

```js
it('connectSaxo fetches a ticket then redirects with it', async () => {
  const setHref = vi.fn()
  vi.stubGlobal('location', { set href(v) { setHref(v) } })
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ ticket: 'signed-123' }),
  })
  localStorage.setItem('access', 'jwt')

  await connectSaxo()

  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining('/api/saxo/connect-ticket/'),
    expect.objectContaining({ method: 'POST' }),
  )
  expect(setHref).toHaveBeenCalledWith(expect.stringContaining('/api/saxo/connect/?ticket=signed-123'))
})
```

> Import `connectSaxo` in the test file's import block. Follow whatever `location` stub the rest of the file already uses (`refreshAccessToken` tests redirect too — reuse that pattern).

- [ ] **Step 2: Run it, watch it fail**

Run: `cd frontend && npx vitest run src/api/client.test.js`
Expected: FAIL — `connectSaxo` currently does a bare redirect, never calls `fetch`.

- [ ] **Step 3: Implement**

`frontend/src/api/client.js`, replace line 154:

```js
export async function connectSaxo() {
  const { ticket } = await jsonRequest('/api/saxo/connect-ticket/', 'POST')
  window.location.href = `${BASE_URL}/api/saxo/connect/?ticket=${encodeURIComponent(ticket)}`
}
```

> `jsonRequest` already exists in this file (line 137) and routes through `apiFetch`, so the JWT header + 401-refresh handling come for free. `jsonRequest` calls `JSON.stringify(undefined)` → `"undefined"` body; if the backend rejects that, pass `{}` as the third arg.

- [ ] **Step 4: Run the test, watch it pass**

Run: `cd frontend && npx vitest run src/api/client.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + build + full frontend suite**

Run: `cd frontend && npm run lint && npx vitest run && npm run build`
Expected: all green. If ESLint flags `onClick={connectSaxo}` returning a promise (`@typescript-eslint/no-misused-promises` or similar), wrap in `SaxoConnectionStatus.jsx`: `onClick={() => { connectSaxo() }}`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/client.test.js frontend/src/components/SaxoConnectionStatus.jsx
git commit -m "feat: request a connect ticket before redirecting to Saxo"
```

---

# WS3 — One provider→HTTP seam (findings A1 + S2)

`research/views.py` maps Saxo failures in `_market_response` and Finnhub failures in a bespoke `FundamentalsView` try/except with a bare `except Exception`. Same taxonomy, two policies; the Finnhub branch also forwards `response.text[:200]` to the client (S2).

### Task 3.1: `research/providers.py` — the shared seam

**Files:**
- Create: `backend/research/providers.py`
- Modify: `backend/research/finnhub.py:15-27` (exception classes)
- Test: `backend/research/tests.py`

**Interfaces:**
- Produces:
  - `class ProviderError(Exception)` with class attrs `http_status = 502` and `body = {'detail': 'The data provider could not serve this request.'}`.
  - `class ProviderNotConnected(ProviderError)` — `http_status = 409`.
  - `class ProviderUnavailable(ProviderError)` — `http_status = 200`; `__init__(self, reason)` sets `self.body = {'available': False, 'reason': reason}`.
  - `provider_response(produce) -> rest_framework.response.Response` — calls `produce()`; on `ProviderError` returns `Response(exc.body, status=exc.http_status)` and logs at `warning` with `exc_info=True` **only** when `http_status >= 500`.
- Consumes (in `provider_response`): also catches `saxo.credentials.SaxoNotConnected` → treat as `ProviderNotConnected`; `saxo.client.SaxoAPIError` → treat as `ProviderError`. Saxo's own exception types are not reworked in this pass — the adapter lives here.

- [ ] **Step 1: Write the failing tests**

`backend/research/tests.py`:

```python
from research import providers

class ProviderResponseTest(TestCase):
    def test_not_connected_maps_to_409(self):
        def produce():
            raise providers.ProviderNotConnected('Not connected to Saxo.')
        resp = providers.provider_response(produce)
        self.assertEqual(resp.status_code, 409)

    def test_unavailable_maps_to_200_with_available_false(self):
        def produce():
            raise providers.ProviderUnavailable('No data for FOO.')
        resp = providers.provider_response(produce)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data, {'available': False, 'reason': 'No data for FOO.'})

    def test_generic_provider_error_hides_upstream_detail(self):
        def produce():
            raise providers.ProviderError()
        resp = providers.provider_response(produce)
        self.assertEqual(resp.status_code, 502)
        self.assertNotIn('token', str(resp.data).lower())
```

- [ ] **Step 2: Run, watch fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.ProviderResponseTest -v 2`
Expected: FAIL — `No module named 'research.providers'`.

- [ ] **Step 3: Implement `providers.py`**

```python
"""One seam from a data-provider call to an HTTP response.

market.py (Saxo) and finnhub.py both raise ProviderError subclasses; the views
render them here so 'how does provider failure X surface' has one answer and
one test table. Finnhub's "always 200 with an available flag" is expressed as
ProviderUnavailable.http_status = 200, not as per-view branching.
"""
import logging

from rest_framework.response import Response

from saxo.client import SaxoAPIError
from saxo.credentials import SaxoNotConnected

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    http_status = 502
    body = {'detail': 'The data provider could not serve this request.'}


class ProviderNotConnected(ProviderError):
    http_status = 409

    def __init__(self, detail='The app is not connected to Saxo.'):
        super().__init__(detail)
        self.body = {'detail': detail}


class ProviderUnavailable(ProviderError):
    http_status = 200

    def __init__(self, reason):
        super().__init__(reason)
        self.body = {'available': False, 'reason': reason}


def provider_response(produce):
    try:
        return Response(produce())
    except SaxoNotConnected as exc:
        return Response({'detail': str(exc)}, status=ProviderNotConnected.http_status)
    except SaxoAPIError:
        logger.warning('Saxo request failed', exc_info=True)
        return Response(ProviderError.body, status=ProviderError.http_status)
    except ProviderError as exc:
        if exc.http_status >= 500:
            logger.warning('Provider request failed', exc_info=True)
        return Response(exc.body, status=exc.http_status)
```

- [ ] **Step 4: Make the Finnhub exceptions `ProviderError`s**

`backend/research/finnhub.py` — the three exception classes:

```python
from research.providers import ProviderError, ProviderUnavailable


class FinnhubNotConfigured(ProviderUnavailable):
    def __init__(self):
        super().__init__('Fundamentals are not configured.')


class FinnhubAPIError(ProviderError):
    """Upstream Finnhub call failed. Detail is logged, never returned."""


class FinnhubNoData(ProviderUnavailable):
    def __init__(self, symbol):
        super().__init__(f'Finnhub has no data for symbol {symbol!r}.')
```

> `_get` raises `FinnhubNotConfigured('...')` and `FinnhubAPIError(f'... {body}')` today — update those call sites: `FinnhubNotConfigured()` takes no arg now; `FinnhubAPIError` may still carry the detail string (it's for logs only, never rendered).

- [ ] **Step 5: Run, watch pass**

Run: `cd backend && .venv/bin/python manage.py test research.tests.ProviderResponseTest -v 2`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/research/providers.py backend/research/finnhub.py backend/research/tests.py
git commit -m "feat: add one provider-to-HTTP seam for Saxo and Finnhub"
```

---

### Task 3.2: Route both view families through `provider_response`

**Files:**
- Modify: `backend/research/views.py:63-79` (delete `_market_response`), `:108-148` (chart/search/details/quotes), `:151-163` (`FundamentalsView`)
- Test: `backend/research/tests.py` — `MarketDataViewTest` (adjust), new fundamentals tests

**Interfaces:**
- Consumes: `research.providers.provider_response`, `research.providers.ProviderUnavailable`.
- Produces: identical HTTP contract to today — chart/search/details/quotes still `409`/`502`; fundamentals still `200 {available: true|false}` — but one code path. `FundamentalsView` no longer has a bare `except Exception`.

- [ ] **Step 1: Write / adjust the failing tests**

Add to `backend/research/tests.py`:

```python
class FundamentalsViewSeamTest(APITestCase):
    def setUp(self):
        cache.clear()
        user = User.objects.create_user('t', password='p')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(RefreshToken.for_user(user).access_token)}')

    @mock.patch('research.views.finnhub.fundamentals')
    def test_upstream_failure_is_200_available_false_without_upstream_text(self, mock_f):
        mock_f.side_effect = finnhub.FinnhubAPIError('/stock/metric failed: 401 {"error":"bad token xyz"}')
        resp = self.client.get('/api/research/fundamentals/AAPL/')
        # FinnhubAPIError is a ProviderError (502), so the seam renders the generic 502 body:
        self.assertEqual(resp.status_code, 502)
        self.assertNotIn('xyz', str(resp.data))

    @mock.patch('research.views.finnhub.fundamentals')
    def test_no_data_symbol_is_200_available_false(self, mock_f):
        mock_f.side_effect = finnhub.FinnhubNoData('ZZZZ')
        resp = self.client.get('/api/research/fundamentals/ZZZZ/')
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['available'])
```

> Decision to confirm with the reviewer: should a *transient* Finnhub outage be `502` (as above — `FinnhubAPIError` is a `ProviderError`) or stay `200 {available:false}` as it is today? The plan assumes **502** because it's honest and the frontend's `FundamentalsGate` already renders any non-`available` payload the same way. If you want the old behaviour, make `FinnhubAPIError` subclass `ProviderUnavailable` instead and delete the 502 assertion.

- [ ] **Step 2: Run, watch fail**

Run: `cd backend && .venv/bin/python manage.py test research.tests.FundamentalsViewSeamTest -v 2`
Expected: FAIL — current `FundamentalsView` catches everything into `200 {available:false}`.

- [ ] **Step 3: Rewrite the views**

`backend/research/views.py` — delete `_market_response` entirely; import from the seam:

```python
from .providers import ProviderUnavailable, provider_response
```

```python
class ChartView(APIView):
    throttle_scope = 'research.market'

    def get(self, request):
        horizon = _int_param(request.query_params, 'horizon', 1440)
        if horizon not in ALLOWED_HORIZONS:
            raise ValidationError({'horizon': 'Not a Saxo chart horizon.'})
        uic = _int_param(request.query_params, 'uic')
        asset_type = _asset_type(request.query_params)
        count = _int_param(request.query_params, 'count', client.CHART_MAX_COUNT)
        return provider_response(lambda: market.chart(uic, asset_type, horizon, count))
```

Apply the same `provider_response(lambda: market.<call>(...))` swap to `InstrumentSearchView`, `InstrumentDetailsView`, `QuotesView` (keep their existing param parsing and the early `Response([])` guards).

```python
class FundamentalsView(APIView):
    throttle_scope = 'research.fundamentals'

    def get(self, request, symbol):
        symbol = _symbol(symbol)
        return provider_response(lambda: {'available': True, **finnhub.fundamentals(symbol)})
```

- [ ] **Step 4: Run the full research suite**

Run: `cd backend && .venv/bin/python manage.py test research -v 1`
Expected: green. `MarketDataViewTest` cases that asserted `409`/`502` still hold (same contract). Fix any that reached into `_market_response` by name.

- [ ] **Step 5: Full suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add backend/research/views.py backend/research/tests.py
git commit -m "refactor: route every Research proxy view through the provider seam"
```

---

# WS4 — Benchmarks seam (findings A2 + A3)

`analytics/benchmarks.eur_closes()` reaches through `research.market.chart()` into Saxo; `analytics/views.py` imports `SaxoNotConnected` and handles it two different ways, and `close / fx_by_date[date]` is an uncaught `ZeroDivisionError` → 500 in `RiskMetricsView`.

### Task 4.1: `BenchmarkUnavailable` — one failure type, caught inside `benchmarks`

**Files:**
- Modify: `backend/analytics/benchmarks.py`
- Test: `backend/analytics/tests.py::BenchmarkEurClosesTest`

**Interfaces:**
- Produces:
  - `class BenchmarkUnavailable(Exception)`.
  - `eur_closes(key) -> list[tuple[datetime.date, float]]` — **raises `BenchmarkUnavailable`** when Saxo is not connected, when either chart comes back empty, or when no dates survive FX conversion. Never raises `SaxoNotConnected`, `KeyError`, or `ZeroDivisionError`.

- [ ] **Step 1: Write the failing tests**

Extend `BenchmarkEurClosesTest` in `backend/analytics/tests.py`:

```python
def test_raises_benchmark_unavailable_when_saxo_not_connected(self):
    with mock.patch('analytics.benchmarks.market.chart', side_effect=SaxoNotConnected('nope')):
        with self.assertRaises(benchmarks.BenchmarkUnavailable):
            benchmarks.eur_closes('sp500')

def test_zero_fx_rate_does_not_raise_zerodivision(self):
    usd = [{'date': '2026-01-02', 'close': 100.0}]
    fx = [{'date': '2026-01-02', 'close': 0.0}]  # bad rate
    with mock.patch('analytics.benchmarks.market.chart', side_effect=[usd, fx]):
        # the single bad date is dropped; nothing survives -> BenchmarkUnavailable
        with self.assertRaises(benchmarks.BenchmarkUnavailable):
            benchmarks.eur_closes('sp500')
```

> Import `SaxoNotConnected` in the test from `saxo.credentials` (the test may already do so for `BenchmarkSummaryTest`).

- [ ] **Step 2: Run, watch fail**

Run: `cd backend && .venv/bin/python manage.py test analytics.tests.BenchmarkEurClosesTest -v 2`
Expected: FAIL — `SaxoNotConnected` / `ZeroDivisionError` propagate.

- [ ] **Step 3: Implement**

`backend/analytics/benchmarks.py`:

```python
from saxo.credentials import SaxoNotConnected


class BenchmarkUnavailable(Exception):
    """No benchmark series right now: not connected, empty, or unconvertible."""


def eur_closes(benchmark_key):
    """Daily closes for one benchmark, converted to EUR - (date, float) pairs."""
    info = BENCHMARKS[benchmark_key]
    try:
        candles = market.chart(info['uic'], info['asset_type'], 1440, CHART_COUNT)
        if info['currency'] != 'EUR':
            fx_candles = market.chart(EURUSD_UIC, 'FxSpot', 1440, CHART_COUNT)
    except SaxoNotConnected as exc:
        raise BenchmarkUnavailable(str(exc)) from exc

    if not candles:
        raise BenchmarkUnavailable(f'No chart data for benchmark {benchmark_key!r}.')

    if info['currency'] == 'EUR':
        pairs = [(date.fromisoformat(c['date']), c['close']) for c in candles]
    else:
        fx_by_date = {c['date']: c['close'] for c in fx_candles if c['close']}
        pairs = [
            (date.fromisoformat(c['date']), c['close'] / fx_by_date[c['date']])
            for c in candles if c['date'] in fx_by_date
        ]

    if not pairs:
        raise BenchmarkUnavailable(f'No convertible closes for benchmark {benchmark_key!r}.')
    return pairs
```

- [ ] **Step 4: Run, watch pass**

Run: `cd backend && .venv/bin/python manage.py test analytics.tests.BenchmarkEurClosesTest -v 2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/analytics/benchmarks.py backend/analytics/tests.py
git commit -m "refactor: benchmarks.eur_closes raises one BenchmarkUnavailable"
```

---

### Task 4.2: `analytics/report.py` — own the "metrics + optional benchmark" composition

**Files:**
- Create: `backend/analytics/report.py`
- Test: `backend/analytics/tests.py` (new `RiskReportTest`, `PerformanceReportTest`)

**Interfaces:**
- Consumes: `analytics.metrics`, `analytics.benchmarks` (incl. `BenchmarkUnavailable`), `django.conf.settings.RISK_FREE_RATE_ANNUAL`.
- Produces:
  - `risk_report(dated_values, benchmark_key) -> dict` — `metrics.risk_summary(...)` plus `available_benchmarks` and a `benchmark` sub-dict. `benchmark` carries `key`, `name`, `reason` (`None` on success, the `BenchmarkUnavailable` message otherwise) and the five `metrics.benchmark_summary` keys. **Never raises** for a missing benchmark.
  - `performance_report(dated_values, benchmark_key) -> dict` — `metrics.performance_summary(...)` plus `benchmark` (`{key, name}`) and `available_benchmarks`; benchmark series is best-effort (empty list on `BenchmarkUnavailable`).
  - `available_benchmarks() -> list[dict]` and `resolve_benchmark_key(raw) -> str` move here from the view.

- [ ] **Step 1: Write the failing tests**

```python
class RiskReportTest(TestCase):
    def test_missing_benchmark_gives_reason_not_exception(self):
        dv = [(date(2026, 1, d), 100 + d) for d in range(1, 12)]
        with mock.patch('analytics.report.benchmarks.eur_closes',
                        side_effect=benchmarks.BenchmarkUnavailable('not connected')):
            out = report.risk_report(dv, 'sp500')
        self.assertTrue(out['has_data'])
        self.assertEqual(out['benchmark']['reason'], 'not connected')
        self.assertIsNone(out['benchmark']['beta'])

class PerformanceReportTest(TestCase):
    def test_best_effort_benchmark(self):
        dv = [(date(2026, 1, d), 100 + d) for d in range(1, 12)]
        with mock.patch('analytics.report.benchmarks.eur_closes',
                        side_effect=benchmarks.BenchmarkUnavailable('x')):
            out = report.performance_report(dv, 'world')
        self.assertIn('periods', out)
        self.assertEqual(out['benchmark']['key'], 'world')
```

- [ ] **Step 2: Run, watch fail**

Run: `cd backend && .venv/bin/python manage.py test analytics.tests.RiskReportTest analytics.tests.PerformanceReportTest -v 2`
Expected: FAIL — `No module named 'analytics.report'`.

- [ ] **Step 3: Implement `report.py`** by lifting the composition out of `analytics/views.py` (the `_resolve_benchmark_key`, `_available_benchmarks`, `_benchmark_summary`, `_empty_benchmark` helpers and the two `get()` bodies):

```python
from django.conf import settings

from . import benchmarks, metrics

DEFAULT_BENCHMARK = 'world'


def resolve_benchmark_key(raw):
    return raw if raw in benchmarks.BENCHMARKS else DEFAULT_BENCHMARK


def available_benchmarks():
    return [{'key': k, 'name': v['name']} for k, v in benchmarks.BENCHMARKS.items()]


def _benchmark_block(key, dated_values):
    name = benchmarks.BENCHMARKS[key]['name']
    rfr = settings.RISK_FREE_RATE_ANNUAL
    try:
        bench_dv = benchmarks.eur_closes(key)
    except benchmarks.BenchmarkUnavailable as exc:
        empty = metrics.benchmark_summary([], [], rfr)
        return {'key': key, 'name': name, 'reason': str(exc), **empty}
    result = metrics.benchmark_summary(dated_values, bench_dv, rfr)
    return {'key': key, 'name': name, 'reason': None, **result}


def risk_report(dated_values, benchmark_key):
    key = resolve_benchmark_key(benchmark_key)
    summary = metrics.risk_summary(dated_values, settings.RISK_FREE_RATE_ANNUAL)
    summary['available_benchmarks'] = available_benchmarks()
    summary['benchmark'] = (
        _benchmark_block(key, dated_values) if summary['has_data']
        else _benchmark_block(key, [])
    )
    return summary


def performance_report(dated_values, benchmark_key):
    key = resolve_benchmark_key(benchmark_key)
    bench_dv = []
    if dated_values:
        try:
            bench_dv = benchmarks.eur_closes(key)
        except benchmarks.BenchmarkUnavailable:
            pass
    summary = metrics.performance_summary(dated_values, bench_dv)
    summary['benchmark'] = {'key': key, 'name': benchmarks.BENCHMARKS[key]['name']}
    summary['available_benchmarks'] = available_benchmarks()
    return summary
```

- [ ] **Step 4: Run, watch pass**

Run: `cd backend && .venv/bin/python manage.py test analytics.tests.RiskReportTest analytics.tests.PerformanceReportTest -v 2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/analytics/report.py backend/analytics/tests.py
git commit -m "feat: analytics.report owns the metrics + optional-benchmark composition"
```

---

### Task 4.3: Thin the views, drop the `saxo` import

**Files:**
- Modify: `backend/analytics/views.py` (whole file)
- Test: `backend/analytics/tests.py::PerformanceViewTest`, `::RiskMetricsViewTest`

**Interfaces:**
- Consumes: `analytics.report`.
- Produces: `/api/analytics/risk/` and `/api/analytics/performance/` — byte-identical responses to today, minus the `ZeroDivisionError` 500. `analytics/views.py` has **no** `import` from `saxo`.

- [ ] **Step 1: Add the regression test**

```python
class RiskMetricsViewZeroFxTest(APITestCase):
    def setUp(self):
        cache.clear()
        user = User.objects.create_user('t', password='p')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(RefreshToken.for_user(user).access_token)}')
        for d in range(1, 12):
            NetWorthSnapshot.objects.create(date=date(2026, 1, d), portfolio_value=100 + d, ...)

    def test_zero_fx_rate_is_not_a_500(self):
        usd = [{'date': f'2026-01-0{d}', 'close': 100.0 + d} for d in range(1, 10)]
        fx = [{'date': f'2026-01-0{d}', 'close': 0.0} for d in range(1, 10)]
        with mock.patch('analytics.benchmarks.market.chart', side_effect=[usd, fx]):
            resp = self.client.get('/api/analytics/risk/?benchmark=sp500')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNone(resp.data['benchmark']['beta'])
        self.assertIsNotNone(resp.data['benchmark']['reason'])
```

> Fill the `NetWorthSnapshot.objects.create(...)` kwargs from the model — reuse the setup the existing `RiskMetricsViewTest` already uses.

- [ ] **Step 2: Run, watch fail**

Run: `cd backend && .venv/bin/python manage.py test analytics.tests.RiskMetricsViewZeroFxTest -v 2`
Expected: FAIL — 500 (`ZeroDivisionError`) pre-WS4.1, or `AttributeError` if 4.1 landed but the view still calls the old helper.

- [ ] **Step 3: Rewrite `analytics/views.py`**

```python
from rest_framework.response import Response
from rest_framework.views import APIView

from core.models import NetWorthSnapshot

from . import report


def _portfolio_dated_values():
    return list(
        NetWorthSnapshot.objects.order_by('date').values_list('date', 'portfolio_value')
    )


class RiskMetricsView(APIView):
    def get(self, request):
        return Response(report.risk_report(
            _portfolio_dated_values(), request.query_params.get('benchmark', ''),
        ))


class PerformanceView(APIView):
    def get(self, request):
        return Response(report.performance_report(
            _portfolio_dated_values(), request.query_params.get('benchmark', ''),
        ))
```

- [ ] **Step 4: Run the analytics suite**

Run: `cd backend && .venv/bin/python manage.py test analytics -v 1`
Expected: green. `PerformanceViewTest` / `RiskMetricsViewTest` response shapes are unchanged; fix any test that patched `analytics.views._benchmark_summary` by name → patch `analytics.report.benchmarks.eur_closes` instead.

- [ ] **Step 5: Grep to confirm the leak is gone**

Run: `grep -rn "saxo" backend/analytics/`
Expected: no matches in `views.py`; `benchmarks.py` still imports `SaxoNotConnected` (correct — that's the seam boundary now).

- [ ] **Step 6: Full suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add backend/analytics/views.py backend/analytics/tests.py
git commit -m "refactor: analytics views call report.py; drop the saxo import"
```

---

# WS5 — Docs

### Task 5.1: Record the decisions in AGENTS.md

**Files:**
- Modify: `AGENTS.md` "Decided" section

- [ ] **Step 1: Add four short entries** (match the existing terse house style):

```markdown
**SQLite runs in WAL with `transaction_mode=IMMEDIATE`.** The default
rollback-journal + DEFERRED combo made concurrent Celery sync tasks hit
`SQLITE_BUSY` on a mid-transaction lock upgrade — which skips the busy
handler, so the 5s timeout never applied. `synced` also takes one
`SAXO_SYNC_LOCK` (non-blocking; a skipped tick is caught by the next).

**The proxy endpoints are rate-limited per scope**, not just by cache TTL:
`research.search` 20/min, `research.market` 60/min, `research.fundamentals`
30/min. Distinct params bypass the cache, and a Finnhub miss is 4 upstream
calls against a 60/min free tier. Unknown symbols are negative-cached 1h.

**Starting the Saxo OAuth flow needs a signed ticket.** `/api/saxo/connect/`
was `AllowAny`; it now requires a 120s `TimestampSigner` ticket minted by
the authenticated `POST /api/saxo/connect-ticket/`. The callback stays
`AllowAny`, guarded by the session `state` nonce.

**One seam maps a provider call to HTTP.** `research/providers.py`:
`market` (Saxo) and `finnhub` both raise `ProviderError` subclasses;
`provider_response` renders them. Finnhub's "always 200 + `available`
flag" is `ProviderUnavailable.http_status = 200`. Analytics no longer
imports `saxo.*` — `benchmarks.eur_closes` raises one `BenchmarkUnavailable`
and `analytics/report.py` owns the metrics + optional-benchmark compose.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record the hardening decisions in AGENTS.md"
```

### Task 5.2: Learning record

- [ ] Append `learning/learning-records/NNNN-sqlite-busy-upgrade.md` (cheap markdown, no design pass): the surprise was a sub-500 ms `database is locked` **despite** a 5 s busy timeout — because SQLite deliberately does not invoke the busy handler when a transaction holding `SHARED` tries to upgrade to `RESERVED` while another connection holds `RESERVED` (deadlock avoidance). `BEGIN IMMEDIATE` sidesteps it by taking the write lock up front. WAL is the orthogonal half (readers stop blocking the writer).

---

## Self-Review

**Spec coverage:**
- S1 (throttling) → WS1.1; the negative-cache half of the S1 discussion → WS1.2. ✓
- S2 (Finnhub error text leaks) → WS3.1 (`FinnhubAPIError` detail is log-only) + WS3.2 test `test_generic_provider_error_hides_upstream_detail` / `test_upstream_failure_...without_upstream_text`. ✓
- S3 (`AllowAny` connect) → WS2.1 + WS2.2. ✓
- A1 (split provider→HTTP seam) → WS3.1 + WS3.2. ✓
- A2 (Analytics imports `saxo` through Research; `ZeroDivisionError` 500) → WS4.1 + WS4.3 (grep gate + regression test). ✓
- A3 (twice-written benchmark dance) → WS4.2 (`analytics/report.py`). ✓
- `database is locked` bug → WS0.1 (PRAGMAs) + WS0.2 (task lock + concurrency). ✓
- Parked by the user (A4, A5-as-model, S4): A5's useful half (negative cache) is folded into WS1.2; A4 and S4 are intentionally out of scope.

**Placeholder scan:** `RiskMetricsViewZeroFxTest.setUp` and `repro_sqlite_lock.py` both carry an explicit `...` where model NOT-NULL fields must be filled from `portfolio/models.py` / `core/models.py` — each is flagged inline with the instruction to read the model first. No "TODO / handle edge cases / add validation" placeholders. All code steps carry runnable code.

**Type consistency:**
- `ProviderError.http_status` / `.body` used identically in `providers.py`, `finnhub.py`, and the WS3.2 tests. ✓
- `BenchmarkUnavailable` raised in `benchmarks.py` (WS4.1), caught in `report.py` (WS4.2) — same name. ✓
- `SAXO_SYNC_LOCK` defined in `saxo/tasks.py` (WS0.2 Step 3), referenced in the test (WS0.2 Step 1) — same name. ✓
- `provider_response` (snake_case) everywhere; the old private `_market_response` is deleted in WS3.2, not renamed. ✓
- `connectSaxo` is `async` after WS2.2; `SaxoConnectionStatus.jsx` `onClick` handled in WS2.2 Step 5. ✓

---

## Execution Handoff

Backend is coach-mode (AGENTS.md), so this does **not** go to implementation subagents. Suggested rhythm:

1. **WS0 first, today** — smallest diff, stops the active failure. Run `scripts/repro_sqlite_lock.py` before/after; then leave `scripts/dev.sh` running through several beat cycles and confirm `worker.log` is clean.
2. **WS1, WS2 in either order** — additive, independent, low-risk.
3. **WS3 then WS4** — WS4.2/4.3 assume WS4.1; WS3 is standalone but shares the "seam" mental model, so do it first.
4. **WS5** after each of WS0–WS4 lands (fold the relevant AGENTS.md paragraph into that workstream's final commit rather than a big doc commit at the end, if you prefer).

Open question for the reviewer before WS3.2: **transient Finnhub outage → `502` or stay `200 {available:false}`?** The plan assumes `502`; flip `FinnhubAPIError`'s base class to `ProviderUnavailable` if you want today's behaviour.
