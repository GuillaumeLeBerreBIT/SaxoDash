# Saxo OpenAPI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Coach-mode override:** per `AGENTS.md`, all `backend/` work in this plan is **coach mode** — the user writes every backend file themselves; Claude explains, reviews, and flags gotchas but does not edit files under `backend/` directly, including with subagents. Only Task 9 (frontend) follows the normal propose-then-choose execution flow. See "Execution model" at the end of this document before starting.

**Goal:** Connect SaxoDash to Saxo's SIM (simulation) OpenAPI environment via OAuth2, and keep `portfolio.Position` / `transactions.Transaction` continuously synced from real (simulated) Saxo account data via a Celery-scheduled background job, replacing the seeded demo data as the live source of truth.

**Architecture:** A new Django app `backend/saxo/` owns everything Saxo-specific: an encrypted `SaxoCredential` model, an OAuth connect/callback/status API, a thin `client.py` wrapper over Saxo's REST endpoints, pure `mapping.py` functions from Saxo JSON to our model fields, and Celery tasks that refresh the token and sync positions/transactions on a schedule. `portfolio` and `transactions` stay plain data apps — the transactions model only grows one field (`saxo_trade_id`) so syncs are idempotent.

**Tech Stack:** Django 6 + DRF (existing), Celery 5.6 + Redis (new broker/worker), `django-celery-beat` (DB-editable periodic schedule), `cryptography` (Fernet field-level encryption), `requests` (Saxo REST calls). SIM environment only.

## Global Constraints

- Backend files are written by the user (coach mode) — this plan describes exactly what to build; it is not executed by Claude editing `backend/` directly.
- SIM environment only — `https://sim.logonvalidation.net` (auth) and `https://gateway.saxobank.com/sim/openapi` (API). Live is a separate future step.
- Local dev only — no process-management/deployment concerns for Redis/Celery in this milestone.
- Single `SaxoCredential` row — no multi-user/tenancy scaffolding, consistent with the app's existing single-user, JWT-auth design.
- Token columns (`access_token`, `refresh_token`) must be encrypted at rest via a Fernet key in `SAXO_TOKEN_ENCRYPTION_KEY`.
- Real Saxo sync data replaces seeded `Position`/`Transaction` rows as source of truth; `seed_demo_data.py` is untouched and still usable offline.
- Sync intervals are configured via `django-celery-beat`'s DB-backed schedule (Django admin), not hardcoded `crontab()` calls in code, so they're easy to tune later.
- The user has already registered a SIM app at developer.saxo with redirect URI `http://localhost:8000/api/saxo/callback/`, and `SAXO_KEY` / `SAXO_SECRET` are already populated in `backend/.env` (gitignored).
- ⚠️ Saxo's exact JSON field names in this plan (`PositionBase`, `ClosedPosition`, etc.) are written from documented/recalled Saxo OpenAPI schema shapes, not a live-verified response. Task 4's Step 8 has the user capture a real response and compare it against `mapping.py`'s assumptions before trusting the sync — flagged explicitly rather than silently assumed correct.

---

### Task 1: Celery + Redis infrastructure

**Files:**
- Install: Redis (system-level, via Homebrew)
- Modify: `backend/requirements.txt`
- Create: `backend/backend/celery.py`
- Modify: `backend/backend/__init__.py`
- Modify: `backend/backend/settings.py`
- Modify: `backend/.env.example`
- Modify: `backend/.env` (add locally, not committed)

**Interfaces:**
- Produces: a working Celery app importable as `backend.celery.app`, with `CELERY_BROKER_URL` read from the environment. Later tasks (`saxo/tasks.py`) use `@shared_task` and are auto-discovered — no manual registration needed.

This task has no unit test — it's infrastructure wiring, verified by actually running a worker and a trivial task, matching the codebase's existing precedent of manual verification for non-logic changes.

- [ ] **Step 1: Install and start Redis**

```bash
brew install redis
brew services start redis
redis-cli ping
```
Expected: `PONG`.

- [ ] **Step 2: Add new dependencies to `requirements.txt`**

Replace the full contents of `backend/requirements.txt` with:

```
Django==6.0.7
PyJWT==2.13.0
asgiref==3.11.1
celery==5.6.3
cryptography==50.0.0
django-celery-beat==2.9.0
django-cors-headers==4.9.0
django-filter==26.1
djangorestframework==3.17.1
djangorestframework_simplejwt==5.5.1
python-dotenv==1.2.2
redis==8.1.0
requests==2.34.2
sqlparse==0.5.5
```

Run (with the venv active):
```bash
cd backend && pip install -r requirements.txt
```
Expected: all packages install cleanly.

- [ ] **Step 3: Create the Celery app**

Create `backend/backend/celery.py`:

```python
import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

app = Celery('backend')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')
```

- [ ] **Step 4: Wire the Celery app into Django's app registry**

Replace the full contents of `backend/backend/__init__.py` with:

```python
from .celery import app as celery_app

__all__ = ('celery_app',)
```

- [ ] **Step 5: Add `django_celery_beat` to `INSTALLED_APPS`**

In `backend/backend/settings.py`, change:

```python
    'rest_framework',
    'rest_framework.authtoken',
    'django_filters',
    'corsheaders',
    'core',
    'portfolio',
    'transactions',
    'accounts',
]
```

to:

```python
    'rest_framework',
    'rest_framework.authtoken',
    'django_filters',
    'corsheaders',
    'django_celery_beat',
    'core',
    'portfolio',
    'transactions',
    'accounts',
]
```

- [ ] **Step 6: Add Celery settings**

In `backend/backend/settings.py`, find the last line (`STATIC_URL = 'static/'`) and append after it:

```python

# Celery

CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
```

- [ ] **Step 7: Add `CELERY_BROKER_URL` to `.env.example` and `.env`**

Append to `backend/.env.example`:
```
CELERY_BROKER_URL=redis://localhost:6379/0
```

Append the same line to `backend/.env`.

- [ ] **Step 8: Migrate `django_celery_beat`'s own tables**

```bash
cd backend && python manage.py migrate
```
Expected: several `django_celery_beat` migrations apply cleanly.

- [ ] **Step 9: Verify the worker picks up a task**

In one terminal:
```bash
cd backend && celery -A backend worker -l info
```
In a second terminal:
```bash
cd backend && python manage.py shell -c "from backend.celery import debug_task; debug_task.delay()"
```
Expected: the worker terminal logs `Task backend.celery.debug_task[...] received` and `Request: ...`.

- [ ] **Step 10: Commit**

```bash
git add backend/requirements.txt backend/backend/celery.py backend/backend/__init__.py backend/backend/settings.py backend/.env.example
git commit -m "chore: add Celery + Redis infrastructure"
```
(`backend/.env` is gitignored and won't be staged.)

---

### Task 2: `SaxoCredential` model with encrypted token fields (TDD)

**Files:**
- Create (via `startapp`): `backend/saxo/` (app skeleton)
- Create: `backend/saxo/fields.py`
- Create: `backend/saxo/models.py`
- Create: `backend/saxo/migrations/0001_initial.py` (generated)
- Test: `backend/saxo/tests.py`
- Modify: `backend/backend/settings.py`
- Modify: `backend/.env.example`, `backend/.env`

**Interfaces:**
- Produces: `SaxoCredential` model (fields: `access_token`, `refresh_token` — both transparently encrypted at rest, `expires_at`, `environment` default `'sim'`, `needs_reauth` default `False`, `last_synced_at` nullable). Consumed by `saxo/views.py` (Task 6) and `saxo/tasks.py` (Task 7).
- Produces: `EncryptedTextField` (in `saxo/fields.py`), a reusable `models.TextField` subclass.

- [ ] **Step 1: Create the app**

```bash
cd backend && python manage.py startapp saxo
```

- [ ] **Step 2: Register the app**

In `backend/backend/settings.py`, change:
```python
    'django_celery_beat',
    'core',
    'portfolio',
    'transactions',
    'accounts',
]
```
to:
```python
    'django_celery_beat',
    'core',
    'portfolio',
    'transactions',
    'accounts',
    'saxo',
]
```

- [ ] **Step 3: Add the encryption key setting**

In `backend/backend/settings.py`, in the `# Celery` block added in Task 1, append below it:

```python

# Saxo OpenAPI integration

SAXO_KEY = os.environ.get('SAXO_KEY', '')
SAXO_SECRET = os.environ.get('SAXO_SECRET', '')
SAXO_REDIRECT_URI = os.environ.get('SAXO_REDIRECT_URI', 'http://localhost:8000/api/saxo/callback/')
SAXO_TOKEN_ENCRYPTION_KEY = os.environ.get('SAXO_TOKEN_ENCRYPTION_KEY', '')
```

- [ ] **Step 4: Generate a real encryption key and add all four Saxo env vars**

```bash
cd backend && python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
Copy the output. In `backend/.env`, add (the `SAXO_TOKEN_ENCRYPTION_KEY` value below is a placeholder — use your generated key):
```
SAXO_REDIRECT_URI=http://localhost:8000/api/saxo/callback/
SAXO_TOKEN_ENCRYPTION_KEY=<paste-your-generated-key-here>
```
(`SAXO_KEY` and `SAXO_SECRET` are already in `backend/.env` per the earlier developer.saxo registration step.)

Append to `backend/.env.example` (blank placeholders, this file *is* committed):
```
SAXO_KEY=
SAXO_SECRET=
SAXO_REDIRECT_URI=http://localhost:8000/api/saxo/callback/
SAXO_TOKEN_ENCRYPTION_KEY=
```

- [ ] **Step 5: Write the failing tests**

Replace the full contents of `backend/saxo/tests.py` with:

```python
from datetime import timedelta

from cryptography.fernet import Fernet
from django.db import connection
from django.test import TestCase, override_settings
from django.utils import timezone

from .models import SaxoCredential

TEST_KEY = Fernet.generate_key().decode()


@override_settings(SAXO_TOKEN_ENCRYPTION_KEY=TEST_KEY)
class SaxoCredentialModelTest(TestCase):
    def test_round_trips_tokens_through_the_orm(self):
        cred = SaxoCredential.objects.create(
            access_token='plain-access-token',
            refresh_token='plain-refresh-token',
            expires_at=timezone.now() + timedelta(minutes=20),
        )
        cred.refresh_from_db()
        self.assertEqual(cred.access_token, 'plain-access-token')
        self.assertEqual(cred.refresh_token, 'plain-refresh-token')

    def test_tokens_are_encrypted_at_rest(self):
        SaxoCredential.objects.create(
            access_token='plain-access-token',
            refresh_token='plain-refresh-token',
            expires_at=timezone.now() + timedelta(minutes=20),
        )
        with connection.cursor() as cursor:
            cursor.execute('SELECT access_token FROM saxo_saxocredential LIMIT 1')
            raw_value = cursor.fetchone()[0]
        self.assertNotEqual(raw_value, 'plain-access-token')

    def test_defaults(self):
        cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(minutes=20),
        )
        self.assertEqual(cred.environment, 'sim')
        self.assertFalse(cred.needs_reauth)
        self.assertIsNone(cred.last_synced_at)
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
cd backend && python manage.py test saxo
```
Expected: FAIL — `ModuleNotFoundError` or `ImportError: cannot import name 'SaxoCredential'` (model doesn't exist yet).

- [ ] **Step 7: Implement the encrypted field**

Create `backend/saxo/fields.py`:

```python
from cryptography.fernet import Fernet
from django.conf import settings
from django.db import models


def _fernet():
    return Fernet(settings.SAXO_TOKEN_ENCRYPTION_KEY.encode())


class EncryptedTextField(models.TextField):
    """Transparently encrypts/decrypts its value with Fernet at rest."""

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if value is None or value == '':
            return value
        return _fernet().encrypt(value.encode()).decode()

    def from_db_value(self, value, expression, connection):
        if value is None or value == '':
            return value
        return _fernet().decrypt(value.encode()).decode()
```

- [ ] **Step 8: Implement the model**

Replace the full contents of `backend/saxo/models.py` with:

```python
from django.db import models

from .fields import EncryptedTextField


class SaxoCredential(models.Model):
    ENVIRONMENT_CHOICES = [('sim', 'Simulation'), ('live', 'Live')]

    access_token = EncryptedTextField()
    refresh_token = EncryptedTextField()
    expires_at = models.DateTimeField()
    environment = models.CharField(max_length=10, choices=ENVIRONMENT_CHOICES, default='sim')
    needs_reauth = models.BooleanField(default=False)
    last_synced_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'SaxoCredential({self.environment}, needs_reauth={self.needs_reauth})'
```

- [ ] **Step 9: Generate and apply the migration**

```bash
cd backend && python manage.py makemigrations saxo && python manage.py migrate
```
Expected: `Migrations for 'saxo': ... 0001_initial.py ... - Create model SaxoCredential`, then `Applying saxo.0001_initial... OK`.

- [ ] **Step 10: Run tests to verify they pass**

```bash
cd backend && python manage.py test saxo
```
Expected: `Ran 3 tests ... OK`.

- [ ] **Step 11: Commit**

```bash
git add backend/saxo/__init__.py backend/saxo/apps.py backend/saxo/models.py backend/saxo/fields.py backend/saxo/migrations/ backend/saxo/tests.py backend/saxo/admin.py backend/saxo/views.py backend/backend/settings.py backend/.env.example
git commit -m "feat: add SaxoCredential model with encrypted token fields"
```

---

### Task 3: `saxo_trade_id` on `Transaction` (for idempotent sync)

**Files:**
- Modify: `backend/transactions/models.py`
- Modify: `backend/transactions/migrations/` (new migration, generated)
- Modify: `backend/transactions/tests.py`

**Interfaces:**
- Produces: `Transaction.saxo_trade_id` (nullable `CharField`, unique when set). Consumed by `saxo/tasks.py::sync_transactions` (Task 7) as the upsert key.

- [ ] **Step 1: Write the failing test**

In `backend/transactions/tests.py`, add this test class (append to the end of the file):

```python
class TransactionSaxoTradeIdTest(TestCase):
    def test_multiple_transactions_without_saxo_trade_id_are_allowed(self):
        Transaction.objects.create(
            date=date(2026, 1, 1), type='DEPOSIT', instrument='Cash Deposit',
            ticker='-', qty=Decimal('1'), price=Decimal('100.00'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 1, 2), type='DEPOSIT', instrument='Cash Deposit',
            ticker='-', qty=Decimal('1'), price=Decimal('200.00'), account='Saxo',
        )
        self.assertEqual(Transaction.objects.filter(saxo_trade_id__isnull=True).count(), 2)

    def test_saxo_trade_id_is_unique_when_set(self):
        Transaction.objects.create(
            date=date(2026, 1, 1), type='SELL', instrument='NVIDIA', ticker='NVDA',
            qty=Decimal('5'), price=Decimal('850.00'), account='Saxo',
            saxo_trade_id='abc123',
        )
        with self.assertRaises(IntegrityError):
            Transaction.objects.create(
                date=date(2026, 1, 2), type='SELL', instrument='NVIDIA', ticker='NVDA',
                qty=Decimal('5'), price=Decimal('860.00'), account='Saxo',
                saxo_trade_id='abc123',
            )
```

Confirm `from django.db.utils import IntegrityError` is imported at the top of `backend/transactions/tests.py` — add it if missing.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && python manage.py test transactions
```
Expected: FAIL — `TypeError: 'saxo_trade_id' is an invalid keyword argument for this function`.

- [ ] **Step 3: Add the field**

In `backend/transactions/models.py`, change:

```python
    account = models.CharField(max_length=50, default='Saxo')
    
    class Meta:
        ordering = ['-date', '-id']
```

to:

```python
    account = models.CharField(max_length=50, default='Saxo')
    saxo_trade_id = models.CharField(max_length=64, null=True, blank=True, default=None, unique=True)
    
    class Meta:
        ordering = ['-date', '-id']
```

- [ ] **Step 4: Generate and apply the migration**

```bash
cd backend && python manage.py makemigrations transactions && python manage.py migrate
```
Expected: a new migration adding `saxo_trade_id` applies cleanly.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && python manage.py test transactions
```
Expected: all transactions tests pass, including the 2 new ones.

- [ ] **Step 6: Commit**

```bash
git add backend/transactions/models.py backend/transactions/migrations/ backend/transactions/tests.py
git commit -m "feat: add saxo_trade_id to Transaction for idempotent sync"
```

---

### Task 4: Saxo API client (`saxo/client.py`)

**Files:**
- Create: `backend/saxo/client.py`
- Test: `backend/saxo/tests.py` (append)

**Interfaces:**
- Produces: `SaxoAuthError`, `SaxoAPIError` exceptions; `build_authorize_url(state) -> str`; `exchange_code_for_token(code) -> dict`; `refresh_access_token(refresh_token) -> dict`; `get_positions(access_token) -> list[dict]`; `get_account_balance(access_token) -> dict`; `get_closed_positions(access_token) -> list[dict]`. Consumed by `saxo/views.py` (Task 6) and `saxo/tasks.py` (Task 7).
- Consumes: `settings.SAXO_KEY`, `settings.SAXO_SECRET`, `settings.SAXO_REDIRECT_URI` (Task 2).

- [ ] **Step 1: Write the failing tests**

Append to `backend/saxo/tests.py`:

```python
from unittest.mock import Mock, patch

from . import client


class SaxoClientTest(TestCase):
    def test_build_authorize_url_includes_client_id_and_state(self):
        url = client.build_authorize_url('xyz-state')
        self.assertIn('sim.logonvalidation.net/authorize', url)
        self.assertIn('state=xyz-state', url)
        self.assertIn(f'client_id={settings.SAXO_KEY}', url) if settings.SAXO_KEY else None

    @patch('saxo.client.requests.post')
    def test_exchange_code_for_token_returns_json_on_success(self, mock_post):
        mock_post.return_value = Mock(ok=True, json=lambda: {'access_token': 'a', 'refresh_token': 'r', 'expires_in': 1200})
        result = client.exchange_code_for_token('some-code')
        self.assertEqual(result['access_token'], 'a')

    @patch('saxo.client.requests.post')
    def test_exchange_code_for_token_raises_on_failure(self, mock_post):
        mock_post.return_value = Mock(ok=False, status_code=400, text='bad request')
        with self.assertRaises(client.SaxoAuthError):
            client.exchange_code_for_token('bad-code')

    @patch('saxo.client.requests.post')
    def test_refresh_access_token_raises_on_failure(self, mock_post):
        mock_post.return_value = Mock(ok=False, status_code=401, text='expired')
        with self.assertRaises(client.SaxoAuthError):
            client.refresh_access_token('stale-refresh-token')

    @patch('saxo.client.requests.get')
    def test_get_positions_returns_data_list(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'Data': [{'PositionId': '1'}]})
        result = client.get_positions('token')
        self.assertEqual(result, [{'PositionId': '1'}])

    @patch('saxo.client.requests.get')
    def test_get_positions_raises_on_api_error(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=500, text='server error')
        with self.assertRaises(client.SaxoAPIError):
            client.get_positions('token')
```

Add `from django.conf import settings` to the top of `backend/saxo/tests.py` if not already present.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python manage.py test saxo
```
Expected: FAIL — `ModuleNotFoundError: No module named 'saxo.client'`.

- [ ] **Step 3: Implement the client**

Create `backend/saxo/client.py`:

```python
import requests
from django.conf import settings

AUTH_BASE_URL = 'https://sim.logonvalidation.net'
API_BASE_URL = 'https://gateway.saxobank.com/sim/openapi'


class SaxoAuthError(Exception):
    """Raised when the OAuth token exchange or refresh fails."""


class SaxoAPIError(Exception):
    """Raised when a Saxo OpenAPI request fails."""


def build_authorize_url(state):
    params = {
        'response_type': 'code',
        'client_id': settings.SAXO_KEY,
        'redirect_uri': settings.SAXO_REDIRECT_URI,
        'state': state,
    }
    query = '&'.join(f'{k}={v}' for k, v in params.items())
    return f'{AUTH_BASE_URL}/authorize?{query}'


def exchange_code_for_token(code):
    response = requests.post(
        f'{AUTH_BASE_URL}/token',
        data={
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': settings.SAXO_REDIRECT_URI,
            'client_id': settings.SAXO_KEY,
            'client_secret': settings.SAXO_SECRET,
        },
        timeout=10,
    )
    if not response.ok:
        raise SaxoAuthError(f'Token exchange failed: {response.status_code} {response.text}')
    return response.json()


def refresh_access_token(refresh_token):
    response = requests.post(
        f'{AUTH_BASE_URL}/token',
        data={
            'grant_type': 'refresh_token',
            'refresh_token': refresh_token,
            'redirect_uri': settings.SAXO_REDIRECT_URI,
            'client_id': settings.SAXO_KEY,
            'client_secret': settings.SAXO_SECRET,
        },
        timeout=10,
    )
    if not response.ok:
        raise SaxoAuthError(f'Token refresh failed: {response.status_code} {response.text}')
    return response.json()


def _get(access_token, path):
    response = requests.get(
        f'{API_BASE_URL}{path}',
        headers={'Authorization': f'Bearer {access_token}'},
        timeout=10,
    )
    if not response.ok:
        raise SaxoAPIError(f'GET {path} failed: {response.status_code} {response.text}')
    return response.json()


def get_positions(access_token):
    return _get(access_token, '/port/v1/positions/me').get('Data', [])


def get_account_balance(access_token):
    return _get(access_token, '/port/v1/balances/me')


def get_closed_positions(access_token):
    return _get(access_token, '/port/v1/closedpositions/me').get('Data', [])
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python manage.py test saxo
```
Expected: `Ran 9 tests ... OK`.

- [ ] **Step 5: Commit**

```bash
git add backend/saxo/client.py backend/saxo/tests.py
git commit -m "feat: add Saxo OpenAPI client wrapper"
```

- [ ] **Step 6: ⚠️ Capture a real response to verify the assumed schema (manual, blocking for Task 5)**

This step can't run until Task 6 (OAuth connect flow) exists and you've completed a real browser-based connect. **Skip ahead and come back to this step after Task 6 is done and you have a live `SaxoCredential` row.** Once you do:

```bash
cd backend && python manage.py shell
```
```python
from saxo.models import SaxoCredential
from saxo import client
cred = SaxoCredential.objects.first()
positions = client.get_positions(cred.access_token)
import json
print(json.dumps(positions[:1], indent=2))
```

Compare the printed shape against `mapping.py`'s assumptions in Task 5 (`PositionBase`, `PositionView`, `DisplayAndFormat` keys). If your SIM account has no open positions yet, place a simulated trade in the Saxo SIM trading platform first so there's data to inspect. Adjust `saxo/mapping.py` if any field name differs — this is expected, not a sign something is broken.

---

### Task 5: Saxo → model field mapping (`saxo/mapping.py`, TDD)

**Files:**
- Create: `backend/saxo/mapping.py`
- Test: `backend/saxo/tests.py` (append)

**Interfaces:**
- Produces: `to_position_fields(saxo_position: dict) -> dict` (keys: `ticker`, `name`, `qty`, `avg_cost`, `current_price`, `sector`, `type`, `color` — matches every non-auto field on `portfolio.Position`). `to_transaction_fields(saxo_closed_position: dict) -> dict` (keys: `saxo_trade_id`, `date`, `type`, `instrument`, `ticker`, `qty`, `price`, `account` — matches every field on `transactions.Transaction` except the auto `id`). Consumed by `saxo/tasks.py` (Task 7).
- Consumes: nothing — pure functions, no I/O, no settings.

⚠️ These field names (`PositionBase`, `PositionView`, `DisplayAndFormat`, `ClosedPosition`, `ClosedPositionUniqueId`) are best-effort from Saxo's documented OpenAPI schema, not a live-verified response. Re-check them against Task 4 Step 6's captured output before relying on a live sync.

- [ ] **Step 1: Write the failing tests**

Append to `backend/saxo/tests.py`:

```python
from datetime import date as date_cls
from decimal import Decimal

from . import mapping

SAMPLE_POSITION = {
    'PositionBase': {
        'Amount': 15,
        'OpenPrice': 412.30,
        'AssetType': 'Stock',
    },
    'PositionView': {
        'CurrentPrice': 875.40,
    },
    'DisplayAndFormat': {
        'Symbol': 'NVDA:xnas',
        'Description': 'NVIDIA Corporation',
    },
}

SAMPLE_CLOSED_POSITION = {
    'ClosedPositionUniqueId': 987654321,
    'ClosedPosition': {
        'ExecutionTimeClose': '2026-06-01T14:32:00Z',
        'Amount': -2,
        'ClosingPrice': 410.00,
    },
    'DisplayAndFormat': {
        'Symbol': 'MSFT:xnas',
        'Description': 'Microsoft Corporation',
    },
}


class ToPositionFieldsTest(TestCase):
    def test_maps_core_fields(self):
        fields = mapping.to_position_fields(SAMPLE_POSITION)
        self.assertEqual(fields['ticker'], 'NVDA')
        self.assertEqual(fields['name'], 'NVIDIA Corporation')
        self.assertEqual(fields['qty'], 15)
        self.assertEqual(fields['avg_cost'], Decimal('412.30'))
        self.assertEqual(fields['current_price'], Decimal('875.40'))
        self.assertEqual(fields['type'], 'STOCK')

    def test_sector_and_color_are_always_present(self):
        fields = mapping.to_position_fields(SAMPLE_POSITION)
        self.assertEqual(fields['sector'], 'Uncategorized')
        self.assertTrue(fields['color'].startswith('#'))
        self.assertEqual(len(fields['color']), 7)

    def test_color_is_deterministic_per_ticker(self):
        a = mapping.to_position_fields(SAMPLE_POSITION)
        b = mapping.to_position_fields(SAMPLE_POSITION)
        self.assertEqual(a['color'], b['color'])


class ToTransactionFieldsTest(TestCase):
    def test_maps_core_fields(self):
        fields = mapping.to_transaction_fields(SAMPLE_CLOSED_POSITION)
        self.assertEqual(fields['saxo_trade_id'], '987654321')
        self.assertEqual(fields['date'], date_cls(2026, 6, 1))
        self.assertEqual(fields['type'], 'SELL')
        self.assertEqual(fields['instrument'], 'Microsoft Corporation')
        self.assertEqual(fields['ticker'], 'MSFT')
        self.assertEqual(fields['qty'], Decimal('2'))
        self.assertEqual(fields['price'], Decimal('410.00'))
        self.assertEqual(fields['account'], 'Saxo')
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python manage.py test saxo
```
Expected: FAIL — `ModuleNotFoundError: No module named 'saxo.mapping'`.

- [ ] **Step 3: Implement the mapping functions**

Create `backend/saxo/mapping.py`:

```python
import hashlib
from datetime import date
from decimal import Decimal


def _color_for_ticker(ticker):
    digest = hashlib.md5(ticker.encode()).hexdigest()
    return f'#{digest[:6]}'


def to_position_fields(saxo_position):
    base = saxo_position['PositionBase']
    view = saxo_position.get('PositionView', {})
    display = saxo_position.get('DisplayAndFormat', {})

    ticker = display.get('Symbol', '').split(':')[0]

    return {
        'ticker': ticker,
        'name': display.get('Description', ''),
        'qty': int(base['Amount']),
        'avg_cost': Decimal(str(base['OpenPrice'])),
        'current_price': Decimal(str(view.get('CurrentPrice', base['OpenPrice']))),
        'sector': 'Uncategorized',
        'type': 'STOCK' if base.get('AssetType') == 'Stock' else 'ETF',
        'color': _color_for_ticker(ticker),
    }


def to_transaction_fields(saxo_closed_position):
    base = saxo_closed_position['ClosedPosition']
    display = saxo_closed_position.get('DisplayAndFormat', {})

    return {
        'saxo_trade_id': str(saxo_closed_position['ClosedPositionUniqueId']),
        'date': date.fromisoformat(base['ExecutionTimeClose'][:10]),
        'type': 'SELL',
        'instrument': display.get('Description', ''),
        'ticker': display.get('Symbol', '').split(':')[0],
        'qty': Decimal(str(abs(base['Amount']))),
        'price': Decimal(str(base['ClosingPrice'])),
        'account': 'Saxo',
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python manage.py test saxo
```
Expected: `Ran 13 tests ... OK`.

- [ ] **Step 5: Commit**

```bash
git add backend/saxo/mapping.py backend/saxo/tests.py
git commit -m "feat: add Saxo-to-model field mapping"
```

---

### Task 6: OAuth connect/callback/status views

**Files:**
- Create: `backend/saxo/views.py` (replace stub)
- Create: `backend/saxo/urls.py`
- Modify: `backend/backend/urls.py`
- Test: `backend/saxo/tests.py` (append)

**Interfaces:**
- Produces: `GET /api/saxo/connect/` (302 redirect to Saxo, `AllowAny`), `GET /api/saxo/callback/` (`AllowAny`), `GET /api/saxo/status/` (`IsAuthenticated`, the project default). Consumed by the frontend (Task 9).
- Consumes: `saxo.client` (Task 4), `saxo.models.SaxoCredential` (Task 2).

- [ ] **Step 1: Write the failing tests**

Append to `backend/saxo/tests.py`:

```python
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken


class SaxoConnectViewTest(APITestCase):
    def test_redirects_to_saxo_authorize_url_and_sets_session_state(self):
        response = self.client.get('/api/saxo/connect/')
        self.assertEqual(response.status_code, 302)
        self.assertIn('sim.logonvalidation.net/authorize', response.url)
        self.assertIn('saxo_oauth_state', self.client.session)


class SaxoCallbackViewTest(APITestCase):
    def test_rejects_mismatched_state(self):
        session = self.client.session
        session['saxo_oauth_state'] = 'expected-state'
        session.save()

        response = self.client.get('/api/saxo/callback/?code=abc&state=wrong-state')
        self.assertEqual(response.status_code, 400)

    @patch('saxo.views.client.exchange_code_for_token')
    def test_saves_credential_on_success(self, mock_exchange):
        mock_exchange.return_value = {
            'access_token': 'new-access', 'refresh_token': 'new-refresh', 'expires_in': 1200,
        }
        session = self.client.session
        session['saxo_oauth_state'] = 'matching-state'
        session.save()

        response = self.client.get('/api/saxo/callback/?code=abc&state=matching-state')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(SaxoCredential.objects.count(), 1)
        self.assertEqual(SaxoCredential.objects.first().access_token, 'new-access')


class SaxoStatusViewTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

    def test_reports_not_connected_when_no_credential(self):
        response = self.client.get('/api/saxo/status/')
        self.assertEqual(response.data, {'connected': False})

    def test_reports_connected_details_when_credential_exists(self):
        SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(minutes=20),
        )
        response = self.client.get('/api/saxo/status/')
        self.assertTrue(response.data['connected'])
        self.assertEqual(response.data['environment'], 'sim')
        self.assertFalse(response.data['needs_reauth'])
```

`SaxoCredential`, `timezone`, `timedelta`, and `patch` are already imported earlier in the file from prior tasks — confirm they're present at the top of `backend/saxo/tests.py`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python manage.py test saxo
```
Expected: FAIL — 404s (no URLs registered yet) / `ImportError`.

- [ ] **Step 3: Implement the views**

Replace the full contents of `backend/saxo/views.py` with:

```python
import secrets
from datetime import timedelta

from django.shortcuts import redirect
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView, Response

from . import client
from .models import SaxoCredential


class SaxoConnectView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        state = secrets.token_urlsafe(24)
        request.session['saxo_oauth_state'] = state
        return redirect(client.build_authorize_url(state))


class SaxoCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        code = request.query_params.get('code')
        state = request.query_params.get('state')
        expected_state = request.session.pop('saxo_oauth_state', None)

        if not code or not state or state != expected_state:
            return Response({'error': 'Invalid or missing OAuth state'}, status=400)

        token_data = client.exchange_code_for_token(code)

        SaxoCredential.objects.all().delete()
        SaxoCredential.objects.create(
            access_token=token_data['access_token'],
            refresh_token=token_data['refresh_token'],
            expires_at=timezone.now() + timedelta(seconds=token_data['expires_in']),
        )
        return Response({'connected': True})


class SaxoStatusView(APIView):

    def get(self, request):
        credential = SaxoCredential.objects.first()
        if not credential:
            return Response({'connected': False})
        return Response({
            'connected': True,
            'environment': credential.environment,
            'needs_reauth': credential.needs_reauth,
            'last_synced_at': credential.last_synced_at,
        })
```

- [ ] **Step 4: Add the URLs**

Create `backend/saxo/urls.py`:

```python
from django.urls import path

from .views import SaxoCallbackView, SaxoConnectView, SaxoStatusView

urlpatterns = [
    path('connect/', SaxoConnectView.as_view(), name='saxo-connect'),
    path('callback/', SaxoCallbackView.as_view(), name='saxo-callback'),
    path('status/', SaxoStatusView.as_view(), name='saxo-status'),
]
```

In `backend/backend/urls.py`, change:

```python
    path('api/accounts/', include('accounts.urls')),
]
```

to:

```python
    path('api/accounts/', include('accounts.urls')),
    path('api/saxo/', include('saxo.urls')),
]
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && python manage.py test saxo
```
Expected: `Ran 18 tests ... OK`.

- [ ] **Step 6: Commit**

```bash
git add backend/saxo/views.py backend/saxo/urls.py backend/backend/urls.py backend/saxo/tests.py
git commit -m "feat: add Saxo OAuth connect/callback/status endpoints"
```

- [ ] **Step 7: Manually verify the real OAuth flow (blocking prerequisite for Task 4 Step 6 and Task 7)**

```bash
cd backend && python manage.py runserver
```
In a browser, visit `http://localhost:8000/api/saxo/connect/`. Expected: redirected to a Saxo SIM login page. Log in with your SIM credentials, approve access. Expected: redirected back to `http://localhost:8000/api/saxo/callback/?code=...&state=...` and see `{"connected": true}`. Confirm via `python manage.py shell -c "from saxo.models import SaxoCredential; print(SaxoCredential.objects.first())"` that a row now exists.

---

### Task 7: Celery sync tasks

**Files:**
- Create: `backend/saxo/tasks.py`
- Test: `backend/saxo/tests.py` (append)

**Interfaces:**
- Produces: `refresh_saxo_token()`, `sync_positions()`, `sync_transactions()` — all `@shared_task`, auto-discovered by Celery (Task 1). Registered as periodic tasks in Task 8.
- Consumes: `saxo.client` (Task 4), `saxo.mapping` (Task 5), `saxo.models.SaxoCredential` (Task 2), `portfolio.models.Position`, `transactions.models.Transaction` (Task 3).

- [ ] **Step 1: Write the failing tests**

Append to `backend/saxo/tests.py`:

```python
from portfolio.models import Position
from transactions.models import Transaction
from . import tasks


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class RefreshSaxoTokenTaskTest(TestCase):
    def test_does_nothing_when_token_not_near_expiry(self):
        SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )
        with patch('saxo.tasks.client.refresh_access_token') as mock_refresh:
            tasks.refresh_saxo_token()
            mock_refresh.assert_not_called()

    @patch('saxo.tasks.client.refresh_access_token')
    def test_refreshes_when_near_expiry(self, mock_refresh):
        mock_refresh.return_value = {
            'access_token': 'new-a', 'refresh_token': 'new-b', 'expires_in': 1200,
        }
        cred = SaxoCredential.objects.create(
            access_token='old-a', refresh_token='old-b',
            expires_at=timezone.now() + timedelta(minutes=2),
        )
        tasks.refresh_saxo_token()
        cred.refresh_from_db()
        self.assertEqual(cred.access_token, 'new-a')
        self.assertFalse(cred.needs_reauth)

    @patch('saxo.tasks.client.refresh_access_token')
    def test_marks_needs_reauth_on_failure(self, mock_refresh):
        mock_refresh.side_effect = client.SaxoAuthError('expired')
        cred = SaxoCredential.objects.create(
            access_token='old-a', refresh_token='old-b',
            expires_at=timezone.now() + timedelta(minutes=2),
        )
        tasks.refresh_saxo_token()
        cred.refresh_from_db()
        self.assertTrue(cred.needs_reauth)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SyncPositionsTaskTest(TestCase):
    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )

    @patch('saxo.tasks.client.get_positions')
    def test_creates_positions_from_saxo_data(self, mock_get_positions):
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_positions()
        self.assertEqual(Position.objects.count(), 1)
        self.assertEqual(Position.objects.first().ticker, 'NVDA')
        self.cred.refresh_from_db()
        self.assertIsNotNone(self.cred.last_synced_at)

    @patch('saxo.tasks.client.get_positions')
    def test_removes_positions_no_longer_present(self, mock_get_positions):
        Position.objects.create(
            ticker='OLD', name='Old Corp', qty=1, avg_cost=Decimal('1'),
            current_price=Decimal('1'), sector='Uncategorized', type='STOCK', color='#000000',
        )
        mock_get_positions.return_value = [SAMPLE_POSITION]
        tasks.sync_positions()
        self.assertFalse(Position.objects.filter(ticker='OLD').exists())
        self.assertTrue(Position.objects.filter(ticker='NVDA').exists())

    @patch('saxo.tasks.client.get_positions')
    def test_skips_malformed_rows_without_aborting(self, mock_get_positions):
        mock_get_positions.return_value = [{'unexpected': 'shape'}, SAMPLE_POSITION]
        tasks.sync_positions()
        self.assertEqual(Position.objects.count(), 1)


@override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
class SyncTransactionsTaskTest(TestCase):
    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )

    @patch('saxo.tasks.client.get_closed_positions')
    def test_creates_transactions_from_saxo_data(self, mock_get_closed):
        mock_get_closed.return_value = [SAMPLE_CLOSED_POSITION]
        tasks.sync_transactions()
        self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(Transaction.objects.first().saxo_trade_id, '987654321')

    @patch('saxo.tasks.client.get_closed_positions')
    def test_upserts_on_repeated_sync(self, mock_get_closed):
        mock_get_closed.return_value = [SAMPLE_CLOSED_POSITION]
        tasks.sync_transactions()
        tasks.sync_transactions()
        self.assertEqual(Transaction.objects.count(), 1)
```

Add `from . import client` to the imports used by the new test classes if not already present at the top of `backend/saxo/tests.py` (it is, from Task 4).

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && python manage.py test saxo
```
Expected: FAIL — `ModuleNotFoundError: No module named 'saxo.tasks'`.

- [ ] **Step 3: Implement the tasks**

Create `backend/saxo/tasks.py`:

```python
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from portfolio.models import Position
from transactions.models import Transaction

from . import client, mapping
from .models import SaxoCredential

REFRESH_MARGIN = timedelta(minutes=5)


@shared_task
def refresh_saxo_token():
    credential = SaxoCredential.objects.first()
    if not credential or credential.needs_reauth:
        return

    if credential.expires_at - timezone.now() > REFRESH_MARGIN:
        return

    try:
        token_data = client.refresh_access_token(credential.refresh_token)
    except client.SaxoAuthError:
        credential.needs_reauth = True
        credential.save(update_fields=['needs_reauth'])
        return

    credential.access_token = token_data['access_token']
    credential.refresh_token = token_data['refresh_token']
    credential.expires_at = timezone.now() + timedelta(seconds=token_data['expires_in'])
    credential.save(update_fields=['access_token', 'refresh_token', 'expires_at'])


@shared_task(autoretry_for=(client.SaxoAPIError,), retry_backoff=True, max_retries=3)
def sync_positions():
    credential = SaxoCredential.objects.first()
    if not credential or credential.needs_reauth:
        return

    saxo_positions = client.get_positions(credential.access_token)
    seen_tickers = []

    for raw_position in saxo_positions:
        try:
            fields = mapping.to_position_fields(raw_position)
        except (KeyError, TypeError):
            continue
        Position.objects.update_or_create(ticker=fields['ticker'], defaults=fields)
        seen_tickers.append(fields['ticker'])

    Position.objects.exclude(ticker__in=seen_tickers).delete()
    credential.last_synced_at = timezone.now()
    credential.save(update_fields=['last_synced_at'])


@shared_task(autoretry_for=(client.SaxoAPIError,), retry_backoff=True, max_retries=3)
def sync_transactions():
    credential = SaxoCredential.objects.first()
    if not credential or credential.needs_reauth:
        return

    saxo_activity = client.get_closed_positions(credential.access_token)

    for raw_activity in saxo_activity:
        try:
            fields = mapping.to_transaction_fields(raw_activity)
        except (KeyError, TypeError):
            continue
        Transaction.objects.update_or_create(
            saxo_trade_id=fields['saxo_trade_id'], defaults=fields
        )

    credential.last_synced_at = timezone.now()
    credential.save(update_fields=['last_synced_at'])
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && python manage.py test saxo
```
Expected: `Ran 26 tests ... OK`.

- [ ] **Step 5: Commit**

```bash
git add backend/saxo/tasks.py backend/saxo/tests.py
git commit -m "feat: add Celery tasks for Saxo token refresh and data sync"
```

---

### Task 8: Register periodic schedules and verify end-to-end

**Files:** none (Django admin configuration only — `django-celery-beat` stores the schedule in the database, per the design's "configurable, not hardcoded" constraint).

**Interfaces:** none produced — this task wires Task 7's tasks into `django-celery-beat`'s scheduler and is the final regression/verification gate for the whole backend milestone.

- [ ] **Step 1: Create a superuser if you don't already have one**

```bash
cd backend && python manage.py createsuperuser
```
(Skip if you already log into `/admin/`.)

- [ ] **Step 2: Register the three periodic tasks via Django admin**

```bash
cd backend && python manage.py runserver
```
Visit `http://localhost:8000/admin/django_celery_beat/periodictask/add/`. Create three periodic tasks (add a matching **Interval Schedule** first for each cadence if one doesn't already exist, via `http://localhost:8000/admin/django_celery_beat/intervalschedule/add/`):

| Name | Task (registered task name) | Interval |
|---|---|---|
| Refresh Saxo token | `saxo.tasks.refresh_saxo_token` | every 10 minutes |
| Sync Saxo positions | `saxo.tasks.sync_positions` | every 30 minutes |
| Sync Saxo transactions | `saxo.tasks.sync_transactions` | every 60 minutes |

Leave each "Enabled" checkbox checked.

- [ ] **Step 3: Run the worker and beat scheduler**

In two separate terminals (with `runserver` still going in a third, and Redis running):
```bash
cd backend && celery -A backend worker -l info
```
```bash
cd backend && celery -A backend beat -l info
```

- [ ] **Step 4: Trigger an immediate sync manually rather than waiting for the schedule**

```bash
cd backend && python manage.py shell -c "from saxo.tasks import sync_positions, sync_transactions; sync_positions.delay(); sync_transactions.delay()"
```
Expected: the worker terminal logs both tasks received and succeeded. Confirm data landed:
```bash
cd backend && python manage.py shell -c "from portfolio.models import Position; from transactions.models import Transaction; print(Position.objects.count(), Transaction.objects.count())"
```
Expected: non-zero counts reflecting your SIM account's actual positions/closed trades (place a simulated trade first in Saxo's SIM platform if both are empty).

- [ ] **Step 5: Full regression gate**

```bash
cd backend && python manage.py test
```
Expected: every app's test suite passes, including all `saxo` tests from Tasks 2–7 and the existing `core`/`portfolio`/`transactions`/`accounts` suites (unaffected).

- [ ] **Step 6: Confirm the existing frontend still renders real data with zero frontend changes**

```bash
cd frontend && npm run dev
```
Open the app, log in, visit Portfolio and Transactions. Expected: the existing charts/tables (unchanged since the chart milestone) now render your real SIM positions/trades instead of the old seed data — no frontend code was touched to make this happen, confirming the backend/frontend seam holds.

---

### Task 9: Frontend "Connect Saxo" status (propose-then-choose, not coach mode)

**Files:**
- Modify: `frontend/src/api/client.js`
- Create: `frontend/src/components/SaxoConnectionStatus.jsx`
- Modify: `frontend/src/pages/Portfolio.jsx`

**Interfaces:**
- Consumes: `GET /api/saxo/status/` (Task 6, authenticated) and `GET /api/saxo/connect/` (Task 6, public browser redirect).
- Produces: `SaxoConnectionStatus` (default export, no props) — rendered in `Portfolio.jsx`'s `PageHeader`.

This task has no unit test — visually verified in-browser, per the codebase's existing chart-component precedent (no automated tests for presentational components).

- [ ] **Step 1: Add the API client functions**

In `frontend/src/api/client.js`, after the last line (`export const getCashFlow = () => apiFetch('/api/transactions/cash-flow/')`), add:

```js
export const getSaxoStatus = () => apiFetch('/api/saxo/status/')
export const connectSaxo = () => { window.location.href = `${BASE_URL}/api/saxo/connect/` }
```

- [ ] **Step 2: Create the status component**

Create `frontend/src/components/SaxoConnectionStatus.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { getSaxoStatus, connectSaxo } from '../api/client'
import { Badge } from './ui'

export default function SaxoConnectionStatus() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    getSaxoStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  if (!status) return null

  if (!status.connected) {
    return (
      <button
        onClick={connectSaxo}
        className="text-[12px] px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
      >
        Connect Saxo
      </button>
    )
  }

  if (status.needs_reauth) {
    return (
      <button
        onClick={connectSaxo}
        className="text-[12px] px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
      >
        Reconnect Saxo
      </button>
    )
  }

  return <Badge tone="emerald">Saxo connected</Badge>
}
```

- [ ] **Step 3: Wire it into Portfolio.jsx**

In `frontend/src/pages/Portfolio.jsx`, change:
```js
import { Card, CardHeader, PageHeader, Badge } from '../components/ui'
import PortfolioValueChart from '../components/PortfolioValueChart'
import GainersLosersChart from '../components/GainersLosersChart'
```
to:
```js
import { Card, CardHeader, PageHeader, Badge } from '../components/ui'
import PortfolioValueChart from '../components/PortfolioValueChart'
import GainersLosersChart from '../components/GainersLosersChart'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
```

And change:
```jsx
      <PageHeader title="Portfolio" subtitle="Holdings and allocation" />
```
to:
```jsx
      <PageHeader title="Portfolio" subtitle="Holdings and allocation" right={<SaxoConnectionStatus />} />
```

- [ ] **Step 4: Run lint and build**

```bash
cd frontend && npm run lint && npm run build
```
Expected: both clean.

- [ ] **Step 5: Manually verify in the browser**

With the backend running and a `SaxoCredential` already connected from Task 6 Step 7, open Portfolio. Expected: an emerald "Saxo connected" badge appears next to the page title. To check the disconnected state, temporarily delete the credential (`python manage.py shell -c "from saxo.models import SaxoCredential; SaxoCredential.objects.all().delete()"`) and reload — expected: a blue "Connect Saxo" button appears, and clicking it starts the real OAuth flow from Task 6 Step 7.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/client.js frontend/src/components/SaxoConnectionStatus.jsx frontend/src/pages/Portfolio.jsx
git commit -m "feat: add Saxo connection status to Portfolio page"
```

---

## Execution model

Tasks 1–8 are **coach mode**: the user works through each task in their own editor, running the exact commands and pasting in the exact code shown above. Claude's role for those tasks is to explain any step in more depth on request, review diffs/output when asked, and help debug — not to open `backend/` files with Edit/Write, and not to dispatch subagents that would do so on the user's behalf.

Task 9 is frontend, so it follows the normal **propose-then-choose** flow: at that point, ask whether the user wants to write `SaxoConnectionStatus.jsx` and the `Portfolio.jsx`/`client.js` edits themselves from the snippets above, or have Claude apply them directly.
