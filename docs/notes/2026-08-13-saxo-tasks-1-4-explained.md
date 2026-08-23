# Saxo Integration: Tasks 1–4 Explained

A plain-language recap of what's actually been built so far in the Saxo OpenAPI
integration, and *why* each piece exists — written because it's easy to forget
the reasoning once the tests are green and you've moved on to the next task.

Companion docs:
- Plan: [`2026-08-03-saxo-openapi-integration.md`](../superpowers/plans/2026-08-03-saxo-openapi-integration.md)
- Design spec: [`2026-08-03-saxo-openapi-integration-design.md`](../superpowers/specs/2026-08-03-saxo-openapi-integration-design.md)

Status when this was written: Tasks 1–4 done and committed. Task 5 (mapping),
6 (OAuth views), 7 (Celery sync tasks), 8 (scheduling), 9 (frontend) not
started yet.

---

## The big picture first

Right now SaxoDash shows **seeded demo data** — Positions and Transactions
that were typed into the database by hand or via a fixture. The whole point
of this integration is to replace that fake data with real data pulled from
your actual Saxo account, kept in sync automatically.

That means solving four separate problems, which map roughly onto Tasks 1–4:

1. **Something has to run on a timer, independent of the browser.** Django
   only does work when a request comes in — there's no built-in "run this
   every 15 minutes" mechanism. → **Task 1: Celery + Redis.**
2. **Saxo hands you an access token after login, and it has to be stored
   somewhere.** Storing it as plaintext in the database is a real risk
   (anyone with DB access, a backup leak, a SQL injection elsewhere in the
   app, etc. gets your brokerage account). → **Task 2: encrypted token
   storage.**
3. **The sync job will run over and over, forever.** If it just inserts
   every transaction it sees every time, you get duplicates every single
   run. Something has to uniquely identify "have I already saved this
   transaction?" → **Task 3: `saxo_trade_id` on `Transaction`.**
4. **Talking to Saxo's API is fiddly** — OAuth handshakes, bearer tokens,
   specific endpoint paths, error handling. That logic shouldn't be smeared
   across views and Celery tasks; it deserves one place. → **Task 4: the
   `saxo/client.py` wrapper.**

Nothing in Tasks 1–4 talks to Saxo automatically yet or touches the frontend.
This was all foundation — plumbing and scaffolding for the OAuth flow and
sync logic that come in Tasks 5–9.

---

## Task 1 — Celery + Redis (background job infrastructure)

**Files:** [`backend/backend/celery.py`](../../backend/backend/celery.py), `CELERY_*` settings, `django_celery_beat` in `INSTALLED_APPS`.
**Commit:** `ddca0fd`

### The problem
A Django view runs *synchronously*, inside a request/response cycle. There's
no such thing as "just have Django wake up every 15 minutes on its own" —
the process is asleep unless a browser is actively talking to it. Syncing
your Saxo portfolio needs to happen on a schedule, with nobody's browser
open.

### The three moving parts
- **Beat** — the alarm clock. It's a scheduler process that knows "run task
  X every N minutes" and, when the time comes, doesn't do the work itself —
  it just announces "time to run X."
- **Redis** — the message queue (the "broker"). Beat drops a message in
  Redis saying "run this task." Redis's only job is to hold that message
  until someone picks it up.
- **Worker** — the process that actually does the work. It watches Redis,
  picks up the message, and executes the task function.

They're three separate OS processes that don't talk to each other directly —
they only communicate through Redis. That's *why* Redis is in the stack at
all: it's the mailbox that lets a scheduler, a worker, and (later) Django
itself all queue up work without being wired together directly.

### What `.delay()` means
When code calls `some_task.delay(...)`, it does **not** run `some_task`
inline. It serializes the call into a message, drops it in Redis, and
returns immediately. The actual execution happens later, in a worker
process, whenever it gets around to picking that message up. This was
verified concretely with `debug_task`: calling `.delay()` returns right
away, and the printed output only shows up in the *worker's* terminal, not
wherever `.delay()` was called from.

### Why this matters for Saxo specifically
Task 7 (not built yet) will define a Celery task like `sync_saxo_positions`.
Task 8 will register it with `django_celery_beat` to run on a schedule
(e.g. every 15 minutes). None of that is possible without Beat/Redis/Worker
already wired up — which is exactly what Task 1 delivered.

---

## Task 2 — `SaxoCredential` model with encrypted tokens

**Files:** [`backend/saxo/models.py`](../../backend/saxo/models.py), [`backend/saxo/fields.py`](../../backend/saxo/fields.py)
**Commit:** `85e5835`

### The problem
After you log into Saxo via OAuth, Saxo gives back an `access_token` and a
`refresh_token`. Whoever holds those can act on your brokerage account. If
they're stored as plain `TextField`s, then:
- Anyone with read access to the database (a leaked backup, another bug
  that exposes DB contents, a misconfigured admin panel) gets your Saxo
  credentials directly, not just app data.
- "Just restrict file permissions on the DB file" isn't a real answer here
  — it protects the file at rest on disk, but does nothing once *any* code
  path in the app (or a bug in it) can read the DB, and it doesn't survive
  the DB being copied elsewhere (backups, replicas, a dev dump).

So the tokens need to be encrypted **before** they hit the database, and
decrypted only in memory when actually used.

### How it works: `EncryptedTextField`
```python
class EncryptedTextField(models.TextField):
    def get_prep_value(self, value):
        ...
        return _fernet().encrypt(value.encode()).decode()

    def from_db_value(self, value, expressions, connection):
        ...
        return _fernet().decrypt(value.encode()).decode()
```

These two methods are hooks Django's ORM calls automatically on the way
in/out of the database — you never call them yourself:

- **`get_prep_value`** runs right before a value is written to the DB (on
  `.save()`). Django hands it the Python value; whatever it returns is what
  actually gets stored in the column.
- **`from_db_value`** runs right after a row is read back out of the DB (on
  a query). Django hands it the raw column value; whatever it returns is
  what your Python code sees as `credential.access_token`.

So from the *caller's* point of view, nothing looks different —
`credential.access_token = "abc123"` and `credential.access_token` just
work — but on disk, the column holds ciphertext, not `"abc123"`. This was
verified directly: querying the raw DB row shows encrypted bytes that don't
match the plaintext token that was assigned in Python.

### Why Fernet specifically
`cryptography.fernet.Fernet` is a symmetric encryption scheme (one key
encrypts and decrypts — appropriate here since it's the same app doing
both, not a public/private-key scenario). It was chosen over hand-rolled
crypto because it bundles things that are easy to get wrong if done
manually:
- Authenticated encryption — tampering with the ciphertext is *detected*
  (decryption raises an error), not silently accepted.
- Built-in timestamping, so tokens can be checked for freshness if needed.
- No dealing with picking cipher modes, IVs, padding, etc. by hand.

The key itself (`SAXO_TOKEN_ENCRYPTION_KEY`) lives in `.env`, never
committed to git — losing that key means the encrypted tokens become
permanently unreadable, which is the intended trade-off (better than the
key being guessable or checked into source control).

---

## Task 3 — `saxo_trade_id` on `Transaction`

**File:** [`backend/transactions/models.py`](../../backend/transactions/models.py)
**Commit:** `6042cfb`

```python
saxo_trade_id = models.CharField(max_length=64, null=True,
                                  blank=True, default=None, unique=True)
```

### The problem
Once syncing is live, the same Celery task will run every 15 minutes and
ask Saxo "give me all my transactions." Most of those transactions were
already fetched and saved on the *previous* run. Naively re-inserting them
every time means the `Transaction` table balloons with duplicate rows for
the same real-world trade.

### The fix: a unique external identifier + `update_or_create`
Saxo's API returns a `TradeId` for every transaction — a stable ID that
identifies that specific trade on Saxo's side, distinct from SaxoDash's own
auto-incrementing `id` primary key. Storing it lets the future sync task
(Task 7) do:

```python
Transaction.objects.update_or_create(
    saxo_trade_id=saxo_trade_id,
    defaults={...}
)
```

`update_or_create` looks up a row by `saxo_trade_id` first: if a
`Transaction` with that `saxo_trade_id` already exists, it updates it in
place; if not, it creates a new one. That's what makes the sync
**idempotent** — running it 100 times with the same Saxo data produces the
same 100 rows, not 100× duplicates.

### Why `null=True, unique=True` — not `blank=True, default=''`
Two different requirements are being satisfied at once here:
- **`unique=True`** enforces at the database level that no two rows can
  share the same `saxo_trade_id` — this is what actually prevents
  duplicates, not just app-level discipline.
- **`null=True`** is needed because of a SQL quirk: `unique` constraints
  normally forbid two rows from having the same value in that column — but
  SQL treats `NULL` as "unknown," and two unknowns are never considered
  equal to each other. So multiple rows *can* all have `saxo_trade_id =
  NULL` without violating uniqueness. That matters because the seeded demo
  transactions (and any manually-entered ones) have no Saxo trade ID at
  all — they need to be *nullable*, not forced into some fake placeholder
  value.
- Using `default=''` instead would break this: empty string is not `NULL`
  to a `unique` constraint, so the *second* demo transaction with
  `saxo_trade_id=''` would collide with the first and fail to save.

`blank=True` (allowing the Django admin/forms to leave it empty) is also
set, but it's the `null=True` half that's load-bearing for the database
constraint — `blank` only affects form validation, not what SQL allows.

---

## Task 4 — `saxo/client.py` (the Saxo API wrapper)

**File:** [`backend/saxo/client.py`](../../backend/saxo/client.py)
**Commit:** `4ac4be1` — 9 passing tests (mocked `requests.post`/`requests.get`, no real network calls in the test suite)

This is a plain module of functions (no class, no state) that wraps every
HTTP interaction with Saxo behind a typed, named function. Nothing before
this task actually spoke to Saxo's servers — Tasks 1–3 were all local
infrastructure.

### OAuth: three functions, three stages of the login handshake

1. **`build_authorize_url(state)`** — builds the URL that (eventually, in
   Task 6) the user gets redirected to in their browser to log into Saxo
   and approve access. `state` is a CSRF-protection value: SaxoDash
   generates it, sends it to Saxo, and checks Saxo hands the *same* value
   back on the callback — proving the callback really originated from a
   login flow SaxoDash itself started, not an attacker replaying a stale
   redirect.

2. **`exchange_code_for_token(code)`** — after the user approves access,
   Saxo redirects back to SaxoDash with a short-lived `code`. This function
   trades that `code` for the real prize: an `access_token` +
   `refresh_token` pair, via a POST to Saxo's `/token` endpoint. This is
   the classic OAuth2 **authorization code flow**: the code itself is
   useless for calling the API — it only exists to be exchanged once for
   tokens.

3. **`refresh_access_token(refresh_token)`** — access tokens expire quickly
   (Saxo's SIM tokens are short-lived by design). Rather than making the
   user log in again every time, this exchanges the longer-lived
   `refresh_token` for a fresh `access_token` without any user interaction.
   This is what Task 7's periodic sync will call automatically when it
   notices the stored token in `SaxoCredential` (Task 2) is about to
   expire.

All three raise `SaxoAuthError` on failure (non-2xx from Saxo) rather than
letting a raw `requests` exception or a silent bad response propagate —
giving callers one specific exception type to catch.

### Data fetching: one private helper, three public wrappers

```python
def _get(access_token, path):
    response = requests.get(f'{API_BASE_URL}{path}',
                             headers={'Authorization': f'Bearer {access_token}'},
                             timeout=10)
    if not response.ok:
        raise SaxoAPIError(...)
    return response.json()
```

`_get` centralizes the repetitive part of every authenticated Saxo API
call: base URL, bearer-token header, timeout, and error handling. The
leading underscore is a convention meaning "internal to this module, not
part of its public interface" — callers outside `client.py` aren't meant
to call `_get` directly.

`get_positions`, `get_account_balance`, and `get_closed_positions` each
call `_get` with a specific endpoint path and unwrap the response shape
Saxo returns (`get_positions`/`get_closed_positions` pull out the `Data`
list; `get_account_balance` returns the whole payload as-is since it's a
single object, not a list). These are the three data shapes Task 5's
mapping functions will consume to build real `Position` and `Transaction`
rows.

### Why SIM URLs, and why `timeout=10`
`AUTH_BASE_URL`/`API_BASE_URL` point at Saxo's *simulation* environment
(`sim.logonvalidation.net`, `.../sim/openapi`) — per the earlier
brainstorming decision, Live is a deliberately separate, later step that
needs Saxo's app-review process. `timeout=10` exists so a hung Saxo
endpoint can't block a Celery worker (or a request thread) indefinitely —
without it, `requests` will wait forever by default.

### What's still unverified
The exact JSON field names this module's callers will eventually parse
(`PositionBase`, `ClosedPosition`, etc., in Task 5's mapping layer) are
**best-effort recollection from Saxo's docs, not yet confirmed against a
real response**. `client.py` itself doesn't care — it just returns
`response.json()` untouched — but Task 5 needs real captured JSON to trust
its field mapping, which is why Task 4's plan explicitly lists capturing a
real response as a manual, blocking step for Task 5. That capture can't
happen until Task 6 (OAuth connect/callback views) exists to actually log
in and get a real token in the first place.

---

## How the four pieces connect

```
 User clicks "Connect Saxo"  →  Task 6 (not built)
        │  build_authorize_url()  [Task 4]
        ▼
   Saxo login + consent
        │  redirect with ?code=...&state=...
        ▼
 Task 6 callback view (not built)
        │  exchange_code_for_token()  [Task 4]
        ▼
  SaxoCredential row saved, tokens encrypted going in  [Task 2]
        │
        ▼
 Celery Beat fires sync task on schedule  [Task 1]
        │  refresh_access_token() if needed  [Task 4]
        │  get_positions() / get_closed_positions()  [Task 4]
        │  raw JSON → mapping.py  [Task 5, not built]
        ▼
 Transaction.objects.update_or_create(saxo_trade_id=...)  [Task 3]
```

Tasks 1–4 built every piece *except* the two boxes marked "not built" —
which are exactly Tasks 5 and 6, the next things on the list.
