# Enable Banking Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect to Enable Banking's production API in restricted mode for KBC and Argenta, and keep `accounts.BankAccount` continuously synced with real balances from both banks via a scheduled Celery job.

**Architecture:** New Django app `backend/enablebanking/`, mirroring `saxo/`'s shape (models, client, mapping, views, tasks) but with two independent per-bank credentials instead of one, and a per-request-signed JWT instead of an OAuth2 access/refresh token pair. A small frontend connection-status component, mirroring `SaxoConnectionStatus.jsx`, added to the Accounts page.

**Tech Stack:** Django REST Framework, Celery + `django-celery-beat` (already installed), `PyJWT` (already a dependency, used here directly for the first time), React + TanStack Query.

**Spec:** `docs/superpowers/specs/2026-09-17-enable-banking-integration-design.md`

## Global Constraints

- Restricted-mode production application only — no sandbox, no commercial contract, no KYB. Verified against Enable Banking's live ToS/docs before this plan was written.
- Balance-only sync. `transactions.Transaction` is not touched.
- Two hardcoded banks only: `kbc` and `argenta`. No bank-picker UI.
- Local dev only — no deployment/process-management concerns.
- One `EnableBankingCredential` row per bank (two total), no multi-user scaffolding.
- The exact `aspsp.name` string Enable Banking uses for KBC and Argenta **must be verified** against a live `GET /aspsps?country=BE` call (Task 10) before the connect flow can work for real — the values used in code below are best-effort from public documentation, not yet live-verified, exactly like Saxo's original field names were flagged until a real response confirmed them.

---

### Task 1: `EnableBankingCredential` + `BankSyncRun` models

**Files:**
- Create: `backend/enablebanking/__init__.py` (empty)
- Create: `backend/enablebanking/apps.py`
- Create: `backend/enablebanking/checks.py` (stub — Task 7 fills in the real checks)
- Create: `backend/enablebanking/models.py`
- Create: `backend/enablebanking/admin.py`
- Create: `backend/enablebanking/migrations/__init__.py` (empty)
- Modify: `backend/backend/settings.py` — add `'enablebanking'` to `INSTALLED_APPS`
- Test: `backend/enablebanking/tests.py`

**Interfaces:**
- Produces: `EnableBankingCredential` (fields: `bank` choices `kbc`/`argenta`, unique; `session_id` encrypted; `valid_until` datetime; `linked_accounts` JSON list of `{"uid", "iban", "product", "currency"}` dicts; `needs_reauth` bool default `False`). `BankSyncRun` (fields: `bank`, `outcome` choices `ok`/`skipped`/`failed`, `detail`, `rows`, `ran_at` auto). Consumed by every later task in this plan.

- [x] **Step 1: Write the failing test**

```python
# backend/enablebanking/tests.py
from django.test import TestCase
from django.utils import timezone
from .models import EnableBankingCredential, BankSyncRun


class EnableBankingCredentialModelTest(TestCase):
    def test_defaults(self):
        cred = EnableBankingCredential.objects.create(
            bank='kbc', session_id='s1', valid_until=timezone.now(),
        )
        self.assertEqual(cred.linked_accounts, [])
        self.assertFalse(cred.needs_reauth)

    def test_bank_is_unique(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s1', valid_until=timezone.now(),
        )
        with self.assertRaises(Exception):
            EnableBankingCredential.objects.create(
                bank='kbc', session_id='s2', valid_until=timezone.now(),
            )


class BankSyncRunModelTest(TestCase):
    def test_defaults(self):
        run = BankSyncRun.objects.create(bank='argenta', outcome='ok')
        self.assertEqual(run.rows, 0)
        self.assertEqual(run.detail, '')
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: FAIL — `ModuleNotFoundError` / `No module named 'enablebanking'` (app doesn't exist yet).

- [x] **Step 3: Implement**

```python
# backend/enablebanking/apps.py
from django.apps import AppConfig


class EnablebankingConfig(AppConfig):
    name = 'enablebanking'

    def ready(self):
        from . import checks  # noqa: F401  (registers the system check, Task 7)
```

```python
# backend/enablebanking/checks.py
"""Stub for now - apps.py imports this at Django startup (every test run
loads every app), so it must exist before any test can run at all. Task 7
replaces this with the real @register()-decorated checks; nothing to
register yet means nothing runs yet, which is correct for this task."""
```

```python
# backend/enablebanking/models.py
from django.db import models

from saxo.fields import EncryptedTextField


class EnableBankingCredential(models.Model):
    """One row per connected bank. Unlike SaxoCredential there is no
    access/refresh token pair - Enable Banking authenticates every request
    with a fresh JWT signed by the app's own private key (see client.py),
    and the only per-user secret worth encrypting is the session_id."""

    BANK_CHOICES = [('kbc', 'KBC'), ('argenta', 'Argenta')]

    bank = models.CharField(max_length=20, choices=BANK_CHOICES, unique=True)
    session_id = EncryptedTextField()
    valid_until = models.DateTimeField()
    linked_accounts = models.JSONField(default=list)
    needs_reauth = models.BooleanField(default=False)

    def __str__(self):
        return f'EnableBankingCredential({self.bank}, needs_reauth={self.needs_reauth})'


class BankSyncRun(models.Model):
    """One execution of sync_enablebanking_balances for one bank.

    Separate table from saxo.SyncRun, deliberately: SaxoStatusView reads
    SyncRun.objects.all() unscoped, assuming only Saxo tasks write to it -
    writing here too would silently blend this integration's health into
    Saxo's status endpoint.
    """

    OUTCOME_CHOICES = [('ok', 'Completed'), ('skipped', 'Skipped'), ('failed', 'Failed')]

    bank = models.CharField(max_length=20, choices=EnableBankingCredential.BANK_CHOICES)
    outcome = models.CharField(max_length=10, choices=OUTCOME_CHOICES)
    detail = models.CharField(max_length=200, blank=True, default='')
    rows = models.PositiveIntegerField(default=0)
    ran_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-ran_at', '-id']
        indexes = [models.Index(fields=['bank', '-ran_at'], name='bsr_bank_ran_at_idx')]

    def __str__(self):
        return f'{self.bank} {self.outcome} at {self.ran_at}'
```

```python
# backend/enablebanking/admin.py
from django.contrib import admin

from .models import BankSyncRun, EnableBankingCredential


@admin.register(EnableBankingCredential)
class EnableBankingCredentialAdmin(admin.ModelAdmin):
    list_display = ('bank', 'needs_reauth', 'valid_until')
    list_filter = ('bank', 'needs_reauth')
    readonly_fields = ('valid_until', 'linked_accounts')

    # session_id is an EncryptedTextField - excluding it keeps a decrypted
    # bearer-equivalent secret off an HTML admin page, same reasoning as
    # SaxoCredentialAdmin excluding access_token/refresh_token.
    exclude = ('session_id',)

    def has_add_permission(self, request):
        # Credentials come from the OAuth-style callback, the only place
        # session_id exists. A hand-added row would fail on the excluded
        # NOT NULL session_id column anyway.
        return False


@admin.register(BankSyncRun)
class BankSyncRunAdmin(admin.ModelAdmin):
    list_display = ('ran_at', 'bank', 'outcome', 'rows', 'detail')
    list_filter = ('bank', 'outcome')
    readonly_fields = ('bank', 'outcome', 'detail', 'rows', 'ran_at')

    def has_add_permission(self, request):
        return False
```

In `backend/backend/settings.py`, add `'enablebanking',` to `INSTALLED_APPS` right after `'saxo',`.

- [x] **Step 4: Generate the migration and run the tests to verify they pass**

Run:
```bash
cd backend
.venv/bin/python manage.py makemigrations enablebanking
.venv/bin/python manage.py test enablebanking -v 2
```
Expected: a `0001_initial.py` migration is created, then both tests PASS.

- [x] **Step 5: Commit**

```bash
git add backend/enablebanking backend/backend/settings.py
git commit -m "feat: add EnableBankingCredential and BankSyncRun models"
```

---

### Task 2: `enablebanking/credentials.py`

**Files:**
- Create: `backend/enablebanking/credentials.py`
- Modify: `backend/enablebanking/tests.py`

**Interfaces:**
- Consumes: `EnableBankingCredential`, `BankSyncRun` (Task 1).
- Produces: `BANKS = ('kbc', 'argenta')`, `BANK_LABELS` dict, `EnableBankingNotConnected` exception, `ConnectionState` dataclass (`.credential`, `.reason`, `.needs_reauth`, `.connected` property, `.usable` property), `connection_state(bank) -> ConnectionState`, `active_credential(bank) -> EnableBankingCredential` (raises `EnableBankingNotConnected`), `last_successful_sync(bank) -> BankSyncRun | None`. Consumed by `tasks.py` (Task 5) and `views.py` (Task 6).

- [x] **Step 1: Write the failing tests**

```python
# append to backend/enablebanking/tests.py
from datetime import timedelta

from . import credentials


class ConnectionStateTest(TestCase):
    def test_not_connected_when_no_row_exists(self):
        state = credentials.connection_state('kbc')
        self.assertFalse(state.connected)
        self.assertFalse(state.needs_reauth)
        self.assertEqual(state.reason, 'KBC is not connected.')

    def test_needs_reauth_when_flagged(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            needs_reauth=True,
        )
        state = credentials.connection_state('kbc')
        self.assertTrue(state.connected)
        self.assertTrue(state.needs_reauth)
        self.assertFalse(state.usable)

    def test_needs_reauth_when_consent_expired(self):
        EnableBankingCredential.objects.create(
            bank='argenta', session_id='s', valid_until=timezone.now() - timedelta(days=1),
        )
        state = credentials.connection_state('argenta')
        self.assertTrue(state.needs_reauth)
        self.assertEqual(state.reason, 'Argenta consent has expired.')

    def test_usable_when_connected_and_fresh(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
        )
        state = credentials.connection_state('kbc')
        self.assertTrue(state.usable)
        self.assertIsNone(state.reason)

    def test_active_credential_raises_when_not_usable(self):
        with self.assertRaises(credentials.EnableBankingNotConnected):
            credentials.active_credential('kbc')

    def test_active_credential_returns_the_row_when_usable(self):
        cred = EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
        )
        self.assertEqual(credentials.active_credential('kbc'), cred)

    def test_last_successful_sync_is_scoped_to_its_own_bank(self):
        BankSyncRun.objects.create(bank='kbc', outcome='ok', rows=2)
        BankSyncRun.objects.create(bank='argenta', outcome='failed')
        self.assertEqual(credentials.last_successful_sync('kbc').rows, 2)
        self.assertIsNone(credentials.last_successful_sync('argenta'))
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.ConnectionStateTest -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'enablebanking.credentials'`.

- [x] **Step 3: Implement**

```python
# backend/enablebanking/credentials.py
from dataclasses import dataclass

from django.utils import timezone

from .models import BankSyncRun, EnableBankingCredential

BANKS = ('kbc', 'argenta')
BANK_LABELS = {'kbc': 'KBC', 'argenta': 'Argenta'}


class EnableBankingNotConnected(Exception):
    """No credential usable for this bank right now."""


@dataclass(frozen=True)
class ConnectionState:
    credential: EnableBankingCredential | None
    reason: str | None
    needs_reauth: bool

    @property
    def connected(self):
        return self.credential is not None

    @property
    def usable(self):
        return self.reason is None


def connection_state(bank):
    label = BANK_LABELS[bank]
    credential = EnableBankingCredential.objects.filter(bank=bank).first()
    if not credential:
        return ConnectionState(None, f'{label} is not connected.', False)
    if credential.needs_reauth:
        return ConnectionState(credential, f'{label} needs re-authentication.', True)
    if credential.valid_until <= timezone.now():
        return ConnectionState(credential, f'{label} consent has expired.', True)
    return ConnectionState(credential, None, False)


def active_credential(bank):
    state = connection_state(bank)
    if not state.usable:
        raise EnableBankingNotConnected(state.reason)
    return state.credential


def last_successful_sync(bank):
    return BankSyncRun.objects.filter(bank=bank, outcome='ok').first()
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests.

- [x] **Step 5: Commit**

```bash
git add backend/enablebanking/credentials.py backend/enablebanking/tests.py
git commit -m "feat: add per-bank connection-state tracking for Enable Banking"
```

---

### Task 3: `enablebanking/client.py` + settings config

**Files:**
- Create: `backend/enablebanking/client.py`
- Modify: `backend/backend/settings.py` — new config vars
- Modify: `backend/.env.example` — new entries
- Modify: `backend/enablebanking/tests.py`

**Interfaces:**
- Produces: `EnableBankingAuthError`, `EnableBankingAPIError` exceptions; `ASPSPS` dict (`bank -> {"name", "country"}`); `build_authorize_url(bank, state, redirect_url) -> str`; `exchange_code_for_session(code) -> dict` (`{"session_id", "accounts": [...]}`); `get_balances(session_id, account_uid) -> dict` (`{"balances": [...]}`). Consumed by `views.py` (Task 6) and `tasks.py` (Task 5).
- Consumes: `settings.ENABLE_BANKING_APPLICATION_ID`, `settings.ENABLE_BANKING_PRIVATE_KEY`.

- [x] **Step 1: Write the failing tests**

```python
# append to backend/enablebanking/tests.py
from unittest.mock import Mock, patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import override_settings

from . import client

# A throwaway 2048-bit keypair generated once for tests - never a real
# Enable Banking private key. Real RS256 signing needs a real RSA key, not
# an arbitrary string, so this is the smallest fixture that exercises it.
_TEST_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
TEST_PRIVATE_KEY_PEM = _TEST_KEY.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.TraditionalOpenSSL,
    encryption_algorithm=serialization.NoEncryption(),
).decode()


@override_settings(
    ENABLE_BANKING_APPLICATION_ID='11111111-1111-1111-1111-111111111111',
    ENABLE_BANKING_PRIVATE_KEY=TEST_PRIVATE_KEY_PEM,
)
class EnableBankingClientTest(TestCase):
    @patch('enablebanking.client.requests.post')
    def test_build_authorize_url_returns_the_redirect_url(self, mock_post):
        mock_post.return_value = Mock(
            ok=True, json=lambda: {'url': 'https://auth.enablebanking.com/ais/start?sessionid=abc'},
        )
        url = client.build_authorize_url('kbc', 'state123', 'http://localhost:8000/cb')
        self.assertEqual(url, 'https://auth.enablebanking.com/ais/start?sessionid=abc')

        sent_body = mock_post.call_args.kwargs['json']
        self.assertEqual(sent_body['aspsp'], client.ASPSPS['kbc'])
        self.assertEqual(sent_body['state'], 'state123')
        self.assertEqual(sent_body['psu_type'], 'personal')

    @patch('enablebanking.client.requests.post')
    def test_build_authorize_url_signs_a_valid_jwt(self, mock_post):
        mock_post.return_value = Mock(ok=True, json=lambda: {'url': 'https://example.com'})
        client.build_authorize_url('argenta', 'state123', 'http://localhost:8000/cb')

        auth_header = mock_post.call_args.kwargs['headers']['Authorization']
        self.assertTrue(auth_header.startswith('Bearer '))

    @patch('enablebanking.client.requests.post')
    def test_build_authorize_url_raises_on_failure(self, mock_post):
        mock_post.return_value = Mock(ok=False, status_code=400, text='bad request')
        with self.assertRaises(client.EnableBankingAPIError):
            client.build_authorize_url('kbc', 'state123', 'http://localhost:8000/cb')

    @patch('enablebanking.client.requests.post')
    def test_exchange_code_for_session_returns_session_and_accounts(self, mock_post):
        mock_post.return_value = Mock(ok=True, json=lambda: {
            'session_id': 'sess-1',
            'accounts': [{'uid': 'acc-1', 'account_id': {'iban': 'BE00'}}],
        })
        result = client.exchange_code_for_session('the-code')
        self.assertEqual(result['session_id'], 'sess-1')
        self.assertEqual(mock_post.call_args.kwargs['json'], {'code': 'the-code'})

    @patch('enablebanking.client.requests.get')
    def test_get_balances_returns_the_balances_list(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'balances': [{'balance_type': 'CLBD'}]})
        result = client.get_balances('sess-1', 'acc-1')
        self.assertEqual(result['balances'][0]['balance_type'], 'CLBD')
        self.assertIn('/accounts/acc-1/balances', mock_get.call_args.args[0])
        self.assertEqual(mock_get.call_args.kwargs['headers']['X-Session-Id'], 'sess-1')

    @patch('enablebanking.client.requests.get')
    def test_get_propagates_api_errors(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=500, text='server error')
        with self.assertRaises(client.EnableBankingAPIError):
            client.get_balances('sess-1', 'acc-1')
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.EnableBankingClientTest -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'enablebanking.client'`.

- [x] **Step 3: Implement**

In `backend/backend/settings.py`, near the existing Saxo/Finnhub config block:

```python
# Enable Banking (bank account aggregation) - restricted-mode production
# application, personal use only. See docs/superpowers/specs/
# 2026-09-17-enable-banking-integration-design.md.
ENABLE_BANKING_APPLICATION_ID = os.environ.get('ENABLE_BANKING_APPLICATION_ID', '')
ENABLE_BANKING_PRIVATE_KEY = os.environ.get('ENABLE_BANKING_PRIVATE_KEY', '')
ENABLE_BANKING_REDIRECT_URI = os.environ.get(
    'ENABLE_BANKING_REDIRECT_URI', 'http://localhost:8000/api/enablebanking/callback/'
)
```

Append to `backend/.env.example`:
```
ENABLE_BANKING_APPLICATION_ID=
ENABLE_BANKING_PRIVATE_KEY=
ENABLE_BANKING_REDIRECT_URI=http://localhost:8000/api/enablebanking/callback/
```

```python
# backend/enablebanking/client.py
import time
import uuid

import jwt as pyjwt
import requests
from django.conf import settings

API_BASE_URL = 'https://api.enablebanking.com'
REQUEST_TIMEOUT = 10
ERROR_BODY_LIMIT = 200

# Best-effort from Enable Banking's public ASPSP listings - NOT yet verified
# against a live GET /aspsps?country=BE call. Task 10 of this plan captures
# the real values once the user has a registered application to call it
# with; correct here if they differ.
ASPSPS = {
    'kbc': {'name': 'KBC Bank', 'country': 'BE'},
    'argenta': {'name': 'Argenta Spaarbank', 'country': 'BE'},
}


class EnableBankingAuthError(Exception):
    """Raised when JWT signing or authentication fails."""


class EnableBankingAPIError(Exception):
    """Raised when an Enable Banking API request fails."""


def _jwt():
    """A fresh RS256 JWT, signed per-request - Enable Banking has no OAuth2
    client-secret exchange; this JWT *is* the app-level authentication, valid
    for a short window rather than issued once and refreshed."""
    now = int(time.time())
    return pyjwt.encode(
        {'iss': 'enablebanking.com', 'aud': 'api.enablebanking.com', 'iat': now, 'exp': now + 300},
        settings.ENABLE_BANKING_PRIVATE_KEY,
        algorithm='RS256',
        headers={'kid': settings.ENABLE_BANKING_APPLICATION_ID},
    )


def _headers(extra=None):
    return {'Authorization': f'Bearer {_jwt()}', **(extra or {})}


def _raise_for_status(response, label):
    if not response.ok:
        body = response.text[:ERROR_BODY_LIMIT]
        raise EnableBankingAPIError(f'{label} failed: {response.status_code} {body}')


def build_authorize_url(bank, state, redirect_url):
    body = {
        'access': {'valid_until': _valid_until_180_days()},
        'aspsp': ASPSPS[bank],
        'state': state,
        'redirect_url': redirect_url,
        'psu_type': 'personal',
    }
    response = requests.post(
        f'{API_BASE_URL}/auth', json=body, headers=_headers(), timeout=REQUEST_TIMEOUT,
    )
    _raise_for_status(response, 'Start authorization')
    return response.json()['url']


def _valid_until_180_days():
    import datetime
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=180)).isoformat()


def exchange_code_for_session(code):
    response = requests.post(
        f'{API_BASE_URL}/sessions', json={'code': code}, headers=_headers(), timeout=REQUEST_TIMEOUT,
    )
    _raise_for_status(response, 'Session authorization')
    return response.json()


def get_balances(session_id, account_uid):
    response = requests.get(
        f'{API_BASE_URL}/accounts/{account_uid}/balances',
        headers=_headers({'X-Session-Id': session_id}),
        timeout=REQUEST_TIMEOUT,
    )
    _raise_for_status(response, 'Get balances')
    return response.json()
```

Note on `X-Session-Id`: the API reference's balance/detail examples only show the app-level `Authorization: Bearer <JWT>` header — Task 10's live verification must confirm exactly how a specific session's accounts are scoped on a per-request basis (a session-scoped header vs. the JWT itself encoding session context) and correct `get_balances` if it differs. Flagged rather than guessed silently, same as the ASPSP names above.

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests.

- [x] **Step 5: Commit**

```bash
git add backend/enablebanking/client.py backend/backend/settings.py backend/.env.example backend/enablebanking/tests.py
git commit -m "feat: add Enable Banking API client (JWT auth, authorize, sessions, balances)"
```

---

### Task 4: `enablebanking/mapping.py`

**Files:**
- Create: `backend/enablebanking/mapping.py`
- Modify: `backend/enablebanking/tests.py`

**Interfaces:**
- Produces: `to_account_fields(bank, account, balance_response) -> dict` (keys matching every non-auto `accounts.BankAccount` field except `external_id`, which the caller sets). Consumed by `tasks.py` (Task 5).

- [x] **Step 1: Write the failing tests**

```python
# append to backend/enablebanking/tests.py
from decimal import Decimal

from . import mapping

SAMPLE_ACCOUNT = {'uid': 'acc-1', 'account_id': {'iban': 'BE68539007547034'}, 'product': 'Current account'}
SAMPLE_BALANCES = {
    'balances': [
        {'balance_amount': {'currency': 'EUR', 'amount': '1234.56'}, 'balance_type': 'CLBD'},
        {'balance_amount': {'currency': 'EUR', 'amount': '1200.00'}, 'balance_type': 'ITAV'},
    ]
}


class ToAccountFieldsTest(TestCase):
    def test_maps_core_fields(self):
        fields = mapping.to_account_fields('kbc', SAMPLE_ACCOUNT, SAMPLE_BALANCES)
        self.assertEqual(fields['bank'], 'KBC')
        self.assertEqual(fields['type'], 'Current account')
        self.assertEqual(fields['currency'], 'EUR')

    def test_masks_the_iban(self):
        fields = mapping.to_account_fields('kbc', SAMPLE_ACCOUNT, SAMPLE_BALANCES)
        self.assertEqual(fields['iban_masked'], 'BE68 •••• •••• 7034')

    def test_prefers_booked_balance_over_available(self):
        fields = mapping.to_account_fields('kbc', SAMPLE_ACCOUNT, SAMPLE_BALANCES)
        self.assertEqual(fields['balance'], Decimal('1234.56'))
        self.assertEqual(fields['available'], Decimal('1200.00'))

    def test_falls_back_to_whatever_balance_type_exists(self):
        balances = {'balances': [{'balance_amount': {'currency': 'EUR', 'amount': '50.00'}, 'balance_type': 'XPCD'}]}
        fields = mapping.to_account_fields('argenta', SAMPLE_ACCOUNT, balances)
        self.assertEqual(fields['balance'], Decimal('50.00'))
        self.assertEqual(fields['available'], Decimal('50.00'))
        self.assertEqual(fields['bank'], 'Argenta')

    def test_zero_when_no_balances_sent(self):
        fields = mapping.to_account_fields('kbc', SAMPLE_ACCOUNT, {'balances': []})
        self.assertEqual(fields['balance'], Decimal('0'))
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.ToAccountFieldsTest -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'enablebanking.mapping'`.

- [x] **Step 3: Implement**

```python
# backend/enablebanking/mapping.py
from decimal import Decimal

from django.conf import settings

BANK_LABELS = {'kbc': 'KBC', 'argenta': 'Argenta'}
GRADIENTS = {'kbc': 'from-sky-500 to-sky-700', 'argenta': 'from-amber-500 to-amber-700'}
ACCENTS = {'kbc': '#0284c7', 'argenta': '#d97706'}


def _mask_iban(iban):
    if not iban or len(iban) <= 8:
        return iban or '-'
    return f'{iban[:4]} •••• •••• {iban[-4:]}'


def _amount_for_type(balances, wanted):
    return next(
        (b['balance_amount']['amount'] for b in balances if b.get('balance_type') == wanted),
        None,
    )


def to_account_fields(bank, account, balance_response):
    """Map one Enable Banking account + its balances to a BankAccount row.

    CLBD (closing booked) is preferred for `balance` - the ledger figure a
    person recognizes as "my balance" - over ITAV (interim available, which
    can differ due to holds); ITAV is preferred for `available` for the
    opposite reason. Not every ASPSP sends both types, so each falls back to
    whichever balance actually came back.
    """
    balances = balance_response.get('balances', [])
    booked = _amount_for_type(balances, 'CLBD')
    available = _amount_for_type(balances, 'ITAV')
    fallback = balances[0]['balance_amount']['amount'] if balances else '0'
    primary = booked if booked is not None else fallback
    currency = balances[0]['balance_amount']['currency'] if balances else settings.REPORTING_CURRENCY

    return {
        'bank': BANK_LABELS[bank],
        'type': account.get('product') or 'Account',
        'iban_masked': _mask_iban(account.get('account_id', {}).get('iban')),
        'balance': Decimal(str(primary)),
        'available': Decimal(str(available if available is not None else primary)),
        'currency': currency,
        'gradient': GRADIENTS[bank],
        'accent': ACCENTS[bank],
    }
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests.

- [x] **Step 5: Commit**

```bash
git add backend/enablebanking/mapping.py backend/enablebanking/tests.py
git commit -m "feat: map Enable Banking account/balance payloads to BankAccount fields"
```

---

### Task 5: `enablebanking/tasks.py`

**Files:**
- Create: `backend/enablebanking/tasks.py`
- Modify: `backend/enablebanking/tests.py`

**Interfaces:**
- Consumes: `credentials.BANKS`, `credentials.connection_state` (Task 2), `client.get_balances` (Task 3), `mapping.to_account_fields` (Task 4), `accounts.models.BankAccount`.
- Produces: `sync_enablebanking_balances()` — a `@shared_task`, auto-discovered by Celery, no arguments. Registered as a periodic task manually via Celery Beat admin (same as every other sync task in this app).

- [x] **Step 1: Write the failing tests**

```python
# append to backend/enablebanking/tests.py
from unittest.mock import patch

from accounts.models import BankAccount

from . import tasks

LINKED_ACCOUNT = {'uid': 'acc-1', 'account_id': {'iban': 'BE68539007547034'}, 'product': 'Current account'}
BALANCES = {'balances': [{'balance_amount': {'currency': 'EUR', 'amount': '100.00'}, 'balance_type': 'CLBD'}]}


class SyncEnableBankingBalancesTaskTest(TestCase):
    def test_skips_a_bank_with_no_credential(self):
        tasks.sync_enablebanking_balances()
        run = BankSyncRun.objects.get(bank='kbc')
        self.assertEqual(run.outcome, 'skipped')
        self.assertEqual(BankAccount.objects.count(), 0)

    @patch('enablebanking.tasks.client.get_balances')
    def test_syncs_a_connected_banks_linked_accounts(self, mock_get_balances):
        mock_get_balances.return_value = BALANCES
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT],
        )
        tasks.sync_enablebanking_balances()

        account = BankAccount.objects.get(external_id='enablebanking:kbc:acc-1')
        self.assertEqual(account.bank, 'KBC')
        self.assertEqual(account.balance, Decimal('100.00'))
        run = BankSyncRun.objects.get(bank='kbc')
        self.assertEqual(run.outcome, 'ok')
        self.assertEqual(run.rows, 1)

    @patch('enablebanking.tasks.client.get_balances')
    def test_upserts_on_repeated_sync(self, mock_get_balances):
        mock_get_balances.return_value = BALANCES
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT],
        )
        tasks.sync_enablebanking_balances()
        tasks.sync_enablebanking_balances()
        self.assertEqual(BankAccount.objects.filter(external_id='enablebanking:kbc:acc-1').count(), 1)

    def test_flags_needs_reauth_when_consent_has_expired(self):
        EnableBankingCredential.objects.create(
            bank='argenta', session_id='s', valid_until=timezone.now() - timedelta(days=1),
            linked_accounts=[LINKED_ACCOUNT],
        )
        tasks.sync_enablebanking_balances()

        cred = EnableBankingCredential.objects.get(bank='argenta')
        self.assertTrue(cred.needs_reauth)
        run = BankSyncRun.objects.get(bank='argenta')
        self.assertEqual(run.outcome, 'skipped')

    @patch('enablebanking.tasks.client.get_balances')
    def test_one_banks_api_error_does_not_abort_the_other(self, mock_get_balances):
        mock_get_balances.side_effect = tasks.client.EnableBankingAPIError('boom')
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT],
        )
        EnableBankingCredential.objects.create(
            bank='argenta', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[],
        )
        tasks.sync_enablebanking_balances()

        self.assertEqual(BankSyncRun.objects.get(bank='kbc').outcome, 'ok')
        self.assertEqual(BankSyncRun.objects.get(bank='kbc').rows, 0)
        self.assertEqual(BankSyncRun.objects.get(bank='argenta').outcome, 'ok')
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.SyncEnableBankingBalancesTaskTest -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'enablebanking.tasks'`.

- [x] **Step 3: Implement**

```python
# backend/enablebanking/tasks.py
import logging

from celery import shared_task

from accounts.models import BankAccount

from . import client, credentials, mapping
from .models import BankSyncRun

logger = logging.getLogger(__name__)


def _sync_one_bank(bank):
    state = credentials.connection_state(bank)

    if not state.connected:
        return 'skipped', state.reason, 0

    if state.needs_reauth:
        if not state.credential.needs_reauth:
            # First time this run notices the lapse - persist it so the
            # status endpoint (Task 6) can surface "Reconnect" without
            # waiting for a second sync tick.
            state.credential.needs_reauth = True
            state.credential.save(update_fields=['needs_reauth'])
        return 'skipped', state.reason, 0

    credential = state.credential
    rows = 0
    for account in credential.linked_accounts:
        try:
            balance_response = client.get_balances(credential.session_id, account['uid'])
        except client.EnableBankingAPIError as exc:
            logger.warning('Skipping %s account %s: %s', bank, account['uid'], exc)
            continue

        fields = mapping.to_account_fields(bank, account, balance_response)
        BankAccount.objects.update_or_create(
            external_id=f'enablebanking:{bank}:{account["uid"]}', defaults=fields,
        )
        rows += 1

    return 'ok', '', rows


@shared_task(autoretry_for=(client.EnableBankingAPIError,), retry_backoff=True, max_retries=3)
def sync_enablebanking_balances():
    total = 0
    for bank in credentials.BANKS:
        outcome, detail, rows = _sync_one_bank(bank)
        BankSyncRun.objects.create(bank=bank, outcome=outcome, detail=(detail or '')[:200], rows=rows)
        total += rows
    return total
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests.

- [x] **Step 5: Commit**

```bash
git add backend/enablebanking/tasks.py backend/enablebanking/tests.py
git commit -m "feat: add sync_enablebanking_balances Celery task"
```

---

### Task 6: `enablebanking/views.py` + `urls.py` + root URL wiring

**Files:**
- Create: `backend/enablebanking/views.py`
- Create: `backend/enablebanking/urls.py`
- Modify: `backend/backend/urls.py` — `path('api/enablebanking/', include('enablebanking.urls'))`
- Modify: `backend/enablebanking/tests.py`

**Interfaces:**
- Consumes: `client.build_authorize_url`, `client.exchange_code_for_session` (Task 3), `credentials.connection_state`, `credentials.BANKS`, `credentials.last_successful_sync` (Task 2), `EnableBankingCredential` (Task 1).
- Produces: `POST /api/enablebanking/connect-ticket/` (authenticated, mints a signed ticket), `GET /api/enablebanking/connect/<bank>/?ticket=...` (public, redirects to that bank's consent URL), `GET /api/enablebanking/callback/` (public, exchanges code for session), `GET /api/enablebanking/status/` (authenticated, `{"kbc": {...}, "argenta": {...}}`).

- [x] **Step 1: Write the failing tests**

```python
# append to backend/enablebanking/tests.py
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken


class EnableBankingConnectTicketViewTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='u', password='p')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_requires_authentication(self):
        self.client.credentials()
        response = self.client.post('/api/enablebanking/connect-ticket/')
        self.assertEqual(response.status_code, 401)

    def test_issues_a_ticket(self):
        response = self.client.post('/api/enablebanking/connect-ticket/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('ticket', response.data)


class EnableBankingConnectViewTest(APITestCase):
    def _ticket(self):
        user = User.objects.create_user(username='u2', password='p')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')
        return self.client.post('/api/enablebanking/connect-ticket/').data['ticket']

    def test_rejects_a_missing_ticket(self):
        response = self.client.get('/api/enablebanking/connect/kbc/')
        self.assertEqual(response.status_code, 403)

    def test_rejects_an_unknown_bank(self):
        ticket = self._ticket()
        response = self.client.get(f'/api/enablebanking/connect/notabank/?ticket={ticket}')
        self.assertEqual(response.status_code, 404)

    @patch('enablebanking.views.client.build_authorize_url')
    def test_redirects_to_the_authorize_url(self, mock_build_url):
        mock_build_url.return_value = 'https://auth.enablebanking.com/ais/start?x=1'
        ticket = self._ticket()
        response = self.client.get(f'/api/enablebanking/connect/kbc/?ticket={ticket}')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, 'https://auth.enablebanking.com/ais/start?x=1')


class EnableBankingCallbackViewTest(APITestCase):
    def test_missing_code_or_state_redirects_with_error(self):
        response = self.client.get('/api/enablebanking/callback/')
        self.assertEqual(response.status_code, 302)
        self.assertIn('enablebanking=error', response.url)

    @patch('enablebanking.views.client.exchange_code_for_session')
    def test_valid_callback_creates_the_credential(self, mock_exchange):
        mock_exchange.return_value = {
            'session_id': 'sess-1',
            'accounts': [{'uid': 'acc-1', 'account_id': {'iban': 'BE00'}}],
        }
        session = self.client.session
        session['enablebanking_oauth_state'] = 'state123:kbc'
        session.save()

        response = self.client.get('/api/enablebanking/callback/?code=abc&state=state123:kbc')

        self.assertEqual(response.status_code, 302)
        self.assertIn('enablebanking=connected', response.url)
        cred = EnableBankingCredential.objects.get(bank='kbc')
        self.assertEqual(cred.linked_accounts, [{'uid': 'acc-1', 'account_id': {'iban': 'BE00'}}])


class EnableBankingStatusViewTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='u3', password='p')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def test_reports_both_banks_independently(self):
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
        )
        response = self.client.get('/api/enablebanking/status/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['kbc']['connected'])
        self.assertFalse(response.data['argenta']['connected'])
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.EnableBankingConnectTicketViewTest -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'enablebanking.views'`.

- [x] **Step 3: Implement**

```python
# backend/enablebanking/views.py
import logging

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.http import Http404, HttpResponseForbidden
from django.shortcuts import redirect
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView, Response

from . import client, credentials
from .models import EnableBankingCredential

logger = logging.getLogger(__name__)


def _back_to_frontend(outcome):
    return redirect(f'{settings.FRONTEND_URL}/accounts?enablebanking={outcome}')


# Same reasoning as saxo.views: the connect redirect is a full-page
# navigation, so a signed ticket stands in for the JWT header an
# authenticated fetch would normally carry.
_connect_ticket_signer = TimestampSigner(salt='enablebanking-connect')
CONNECT_TICKET_MAX_AGE = 120


class EnableBankingConnectTicketView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({'ticket': _connect_ticket_signer.sign(str(request.user.pk))})


class EnableBankingConnectView(APIView):
    permission_classes = [AllowAny]  # the ticket is the credential

    def get(self, request, bank):
        if bank not in credentials.BANKS:
            raise Http404(f'Unknown bank: {bank}')

        try:
            _connect_ticket_signer.unsign(
                request.query_params.get('ticket', ''), max_age=CONNECT_TICKET_MAX_AGE
            )
        except (BadSignature, SignatureExpired):
            return HttpResponseForbidden('A fresh connect ticket is required.')

        import secrets
        state = f'{secrets.token_urlsafe(24)}:{bank}'
        request.session['enablebanking_oauth_state'] = state

        response = redirect(client.build_authorize_url(bank, state, settings.ENABLE_BANKING_REDIRECT_URI))
        response['Referrer-Policy'] = 'no-referrer'
        return response


class EnableBankingCallbackView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        code = request.query_params.get('code')
        state = request.query_params.get('state')
        expected_state = request.session.pop('enablebanking_oauth_state', None)

        if not code or not state or state != expected_state or ':' not in state:
            return _back_to_frontend('error')

        bank = state.rsplit(':', 1)[1]

        try:
            session_data = client.exchange_code_for_session(code)
        except client.EnableBankingAPIError:
            logger.exception('Enable Banking session exchange failed for %s', bank)
            return _back_to_frontend('error')

        EnableBankingCredential.objects.update_or_create(
            bank=bank,
            defaults={
                'session_id': session_data['session_id'],
                # The public example response for POST /sessions shows only
                # session_id and accounts, no echoed expiry - use the 180-day
                # window we requested in build_authorize_url as the stored
                # value. Task 10 confirms live whether the real response ever
                # includes its own expiry and switches to reading it directly
                # if so.
                'valid_until': _fallback_valid_until(),
                'linked_accounts': session_data['accounts'],
                'needs_reauth': False,
            },
        )

        return _back_to_frontend('connected')


def _fallback_valid_until():
    # Task 10 verifies whether GetSessionResponse (used here) or a fixed
    # 180-day request window (what build_authorize_url asked for) is the
    # right source of truth for valid_until - using the requested window as
    # a safe default until that live check happens.
    import datetime
    return datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=180)


class EnableBankingStatusView(APIView):

    def get(self, request):
        result = {}
        for bank in credentials.BANKS:
            state = credentials.connection_state(bank)
            last_sync = credentials.last_successful_sync(bank)
            result[bank] = {
                'connected': state.connected,
                'needs_reauth': state.needs_reauth,
                'usable': state.usable,
                'unusable_reason': state.reason,
                'last_synced_at': last_sync.ran_at if last_sync else None,
            }
        return Response(result)
```

```python
# backend/enablebanking/urls.py
from django.urls import path

from .views import (
    EnableBankingCallbackView,
    EnableBankingConnectTicketView,
    EnableBankingConnectView,
    EnableBankingStatusView,
)

urlpatterns = [
    path('connect-ticket/', EnableBankingConnectTicketView.as_view(), name='enablebanking-connect-ticket'),
    path('connect/<str:bank>/', EnableBankingConnectView.as_view(), name='enablebanking-connect'),
    path('callback/', EnableBankingCallbackView.as_view(), name='enablebanking-callback'),
    path('status/', EnableBankingStatusView.as_view(), name='enablebanking-status'),
]
```

In `backend/backend/urls.py`, add right after the Saxo include:
```python
path('api/enablebanking/', include('enablebanking.urls')),
```

**Note for the implementer:** `_fallback_valid_until()` in `EnableBankingCallbackView` is a real, working default (the 180-day window requested in `build_authorize_url`), not a placeholder — it exists because `POST /sessions`' example response in the public docs does not show `access.valid_until` echoed back. Task 10's live call confirms whether the real response includes its own expiry; if it does, change this line to read it from `session_data` directly instead.

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests.

- [x] **Step 5: Commit**

```bash
git add backend/enablebanking/views.py backend/enablebanking/urls.py backend/backend/urls.py backend/enablebanking/tests.py
git commit -m "feat: add Enable Banking connect/callback/status views"
```

---

### Task 7: `enablebanking/checks.py`

**Files:**
- Modify: `backend/enablebanking/checks.py` (stub created in Task 1)
- Modify: `backend/enablebanking/tests.py`

**Interfaces:**
- Consumes: `settings.ENABLE_BANKING_APPLICATION_ID`, `settings.ENABLE_BANKING_PRIVATE_KEY` (Task 3).
- Produces: two Django system checks, registered via `apps.py`'s `ready()` (already wired in Task 1).

- [x] **Step 1: Write the failing tests**

```python
# append to backend/enablebanking/tests.py
from . import checks as eb_checks


class EnableBankingChecksTest(TestCase):
    @override_settings(ENABLE_BANKING_APPLICATION_ID='', ENABLE_BANKING_PRIVATE_KEY='some-key')
    def test_errors_when_application_id_missing(self):
        errors = eb_checks.check_config(None)
        self.assertTrue(any(e.id == 'enablebanking.E001' for e in errors))

    @override_settings(ENABLE_BANKING_APPLICATION_ID='app-id', ENABLE_BANKING_PRIVATE_KEY='')
    def test_errors_when_private_key_missing(self):
        errors = eb_checks.check_config(None)
        self.assertTrue(any(e.id == 'enablebanking.E002' for e in errors))

    @override_settings(ENABLE_BANKING_APPLICATION_ID='app-id', ENABLE_BANKING_PRIVATE_KEY='some-key')
    def test_no_errors_when_both_are_set(self):
        self.assertEqual(eb_checks.check_config(None), [])
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.EnableBankingChecksTest -v 2`
Expected: FAIL — `AttributeError: module 'enablebanking.checks' has no attribute 'check_config'` (the module exists as an empty stub from Task 1; it just has nothing in it yet).

- [x] **Step 3: Implement**

```python
# backend/enablebanking/checks.py
from django.conf import settings
from django.core.checks import Error, register


@register()
def check_config(app_configs, **kwargs):
    """Fail at startup, not inside a Celery task at 3am, if the app-level
    Enable Banking credentials are missing."""
    errors = []

    if not settings.ENABLE_BANKING_APPLICATION_ID:
        errors.append(Error(
            'ENABLE_BANKING_APPLICATION_ID is unset.',
            hint='Register a production application at enablebanking.com/cp/applications '
                 'and set ENABLE_BANKING_APPLICATION_ID in backend/.env',
            id='enablebanking.E001',
        ))

    if not settings.ENABLE_BANKING_PRIVATE_KEY:
        errors.append(Error(
            'ENABLE_BANKING_PRIVATE_KEY is unset, so API requests cannot be signed.',
            hint='Set ENABLE_BANKING_PRIVATE_KEY in backend/.env to the contents of the '
                 '.pem file downloaded when registering the application.',
            id='enablebanking.E002',
        ))

    return errors
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests in the app.

- [x] **Step 5: Commit**

```bash
git add backend/enablebanking/checks.py backend/enablebanking/tests.py
git commit -m "feat: add startup checks for Enable Banking config"
```

---

### Task 8: Remove the fake BNP Paribas Fortis seed row

**Files:**
- Modify: `backend/core/management/commands/seed_demo_data.py`
- Modify: `backend/core/management/commands/purge_demo_data.py` (if it references the row by name)

**Interfaces:** none — this is a data-only change, no new functions.

- [x] **Step 1: Find and remove the fake row**

```bash
cd backend
grep -n "BNP Paribas Fortis" core/management/commands/seed_demo_data.py core/management/commands/purge_demo_data.py
```

Remove the `BNP Paribas Fortis` dict entry from the `BANK_ACCOUNTS` list in `seed_demo_data.py`. If `purge_demo_data.py` filters/deletes by that bank name specifically (rather than by `external_id__isnull=True` or similar), update it to match whatever the remaining seeded accounts are, or to not reference BNP Paribas Fortis at all.

- [x] **Step 2: Remove it from the live dev database too**

```bash
.venv/bin/python manage.py shell -c "
from accounts.models import BankAccount
BankAccount.objects.filter(bank='BNP Paribas Fortis').delete()
"
```

- [x] **Step 3: Run the full backend suite to verify nothing depended on it**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: same pass count as before this task (minus/plus nothing) — no test should have asserted on "BNP Paribas Fortis" specifically. If one does, update that test's expectation, it was asserting on demo-data trivia, not real behavior.

- [x] **Step 4: Commit**

```bash
git add backend/core/management/commands/seed_demo_data.py backend/core/management/commands/purge_demo_data.py
git commit -m "chore: remove fake BNP Paribas Fortis seed data ahead of real bank sync"
```

---

### Task 9: Frontend connection-status component

**Files:**
- Modify: `frontend/src/api/client.js`
- Modify: `frontend/src/api/queries.js`
- Create: `frontend/src/components/EnableBankingConnectionStatus.jsx`
- Modify: `frontend/src/pages/Accounts.jsx`

**Interfaces:**
- Produces: `getEnableBankingStatus() -> Promise<{kbc: {...}, argenta: {...}}>`, `connectEnableBanking(bank) -> Promise<void>` (navigates away) in `client.js`; `useEnableBankingStatus()` in `queries.js`; `<EnableBankingConnectionStatus />` component with no props.

- [x] **Step 1: Add the API client functions**

In `frontend/src/api/client.js`, right after the existing `connectSaxo` function:

```js
export const getEnableBankingStatus = () => apiFetch('/api/enablebanking/status/')

export async function connectEnableBanking(bank) {
  const { ticket } = await jsonRequest('/api/enablebanking/connect-ticket/', 'POST')
  window.location.href = `${BASE_URL}/api/enablebanking/connect/${bank}/?ticket=${encodeURIComponent(ticket)}`
}
```

- [x] **Step 2: Add the query hook**

In `frontend/src/api/queries.js`, add `getEnableBankingStatus` to the existing import from `../api/client` (wherever `getSaxoStatus` is imported from), add a query key next to `saxoStatus: ['saxo-status']`:

```js
enableBankingStatus: ['enablebanking-status'],
```

and add, right after `useSaxoStatus`:

```js
export function useEnableBankingStatus() {
  return useQuery({
    queryKey: queryKeys.enableBankingStatus,
    queryFn: getEnableBankingStatus,
  })
}
```

- [x] **Step 3: Write the component test**

```jsx
// frontend/src/components/EnableBankingConnectionStatus.test.jsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import EnableBankingConnectionStatus from './EnableBankingConnectionStatus'

vi.mock('../api/queries')
import * as queries from '../api/queries'

describe('EnableBankingConnectionStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing before status has loaded', () => {
    queries.useEnableBankingStatus.mockReturnValue({ data: undefined })
    const { container } = renderWithProviders(<EnableBankingConnectionStatus />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a Connect button for a bank that is not connected', () => {
    queries.useEnableBankingStatus.mockReturnValue({
      data: { kbc: { connected: false }, argenta: { connected: false } },
    })
    renderWithProviders(<EnableBankingConnectionStatus />)
    expect(screen.getByText('Connect KBC')).toBeInTheDocument()
    expect(screen.getByText('Connect Argenta')).toBeInTheDocument()
  })

  it('shows a connected badge for a bank that is connected and usable', () => {
    queries.useEnableBankingStatus.mockReturnValue({
      data: {
        kbc: { connected: true, needs_reauth: false, usable: true, last_synced_at: null },
        argenta: { connected: false },
      },
    })
    renderWithProviders(<EnableBankingConnectionStatus />)
    expect(screen.getByText('KBC connected')).toBeInTheDocument()
    expect(screen.getByText('Connect Argenta')).toBeInTheDocument()
  })

  it('shows a Reconnect button for a bank that needs re-authentication', () => {
    queries.useEnableBankingStatus.mockReturnValue({
      data: {
        kbc: { connected: true, needs_reauth: true, usable: false },
        argenta: { connected: false },
      },
    })
    renderWithProviders(<EnableBankingConnectionStatus />)
    expect(screen.getByText('Reconnect KBC')).toBeInTheDocument()
  })
})
```

- [x] **Step 4: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/EnableBankingConnectionStatus.test.jsx`
Expected: FAIL — module doesn't exist yet.

- [x] **Step 5: Implement the component**

Matches `SaxoConnectionStatus.jsx`'s existing visual language exactly (small pill buttons/badges, same blue/red/emerald tones, same `Badge` primitive) rather than introducing a new style for what is functionally the same kind of control, one per bank instead of one overall:

```jsx
// frontend/src/components/EnableBankingConnectionStatus.jsx
import { connectEnableBanking } from '../api/client'
import { useEnableBankingStatus } from '../api/queries'
import { Badge } from './ui'

const BANK_LABELS = { kbc: 'KBC', argenta: 'Argenta' }

function OneBank({ bank, state }) {
  const label = BANK_LABELS[bank]

  if (!state.connected) {
    return (
      <button
        onClick={() => connectEnableBanking(bank)}
        className="text-[var(--fig-xs)] px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
      >
        Connect {label}
      </button>
    )
  }

  if (state.needs_reauth) {
    return (
      <button
        onClick={() => connectEnableBanking(bank)}
        className="text-[var(--fig-xs)] px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
      >
        Reconnect {label}
      </button>
    )
  }

  if (!state.usable) {
    return (
      <Badge tone="amber">
        <span title={state.unusable_reason ?? undefined}>{label} reconnecting…</span>
      </Badge>
    )
  }

  return (
    <Badge tone="emerald">
      <span title={state.last_synced_at ? `Last synced ${state.last_synced_at}` : 'Never synced'}>
        {label} connected
      </span>
    </Badge>
  )
}

export default function EnableBankingConnectionStatus() {
  const { data: status } = useEnableBankingStatus()
  if (!status) return null

  return (
    <span className="flex items-center gap-2">
      {Object.entries(status).map(([bank, state]) => (
        <OneBank key={bank} bank={bank} state={state} />
      ))}
    </span>
  )
}
```

- [x] **Step 6: Wire it into the Accounts page**

In `frontend/src/pages/Accounts.jsx`, add the import and pass it as the `PageHeader`'s `right` slot, same position `SaxoConnectionStatus` occupies on Portfolio:

```jsx
import EnableBankingConnectionStatus from '../components/EnableBankingConnectionStatus'
```

```jsx
<PageHeader title="Accounts" subtitle="Your connected bank accounts" right={<EnableBankingConnectionStatus />} />
```

- [x] **Step 7: Run the frontend suite, lint, and build**

Run:
```bash
cd frontend
npm test
npm run lint
npm run build
```
Expected: all pass, no new failures, no lint errors.

- [x] **Step 8: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/queries.js frontend/src/components/EnableBankingConnectionStatus.jsx frontend/src/components/EnableBankingConnectionStatus.test.jsx frontend/src/pages/Accounts.jsx
git commit -m "feat: add Enable Banking connection status to the Accounts page"
```

---

### Task 10: Manual verification gate (user-side prerequisite, then live check)

**This task cannot be done by Claude — it requires creating an external account.**

- [x] **Step 1: Sign up and register a production application** (2026-09-17)

Registered a production application. **Redirect URL differs from the original plan**: Enable Banking rejected a plain `http://localhost:8000/...` redirect URL ("unsupported scheme" — HTTPS is required even for local dev). Worked around with an ngrok static domain (`policy-mystified-unhidden.ngrok-free.dev`) tunneling to local port 8000; `ENABLE_BANKING_REDIRECT_URI` in `backend/.env` and the registered redirect URL both use `https://policy-mystified-unhidden.ngrok-free.dev/api/enablebanking/callback/`. Real `ENABLE_BANKING_APPLICATION_ID`/`ENABLE_BANKING_PRIVATE_KEY` are in `backend/.env`, replacing the placeholder. `ngrok-banking` shell alias added for future reconnects.

- [x] **Step 2: Verify the exact ASPSP names for KBC and Argenta** (2026-09-17)

Verified live: the real names are plain `KBC` and `Argenta` (not the guessed `KBC Bank`/`Argenta Spaarbank`) — there's also a distinct `KBC Brussels` entity in the listing. `ASPSPS` in `backend/enablebanking/client.py` corrected accordingly.

Original verification snippet (superseded by running it as a real file, since a shell hook in this environment blocked an inline `-c` HTTP call — no change needed to the plan for a fresh implementer without that hook):

```bash
cd backend
.venv/bin/python manage.py shell -c "
from enablebanking import client
import requests
r = requests.get('https://api.enablebanking.com/aspsps', params={'country': 'BE'}, headers=client._headers())
import json
for a in r.json()['aspsps']:
    if 'kbc' in a['name'].lower() or 'argenta' in a['name'].lower():
        print(a['name'], a['country'])
"
```

Compare the printed names against `ASPSPS` in `backend/enablebanking/client.py` (Task 3). Update `ASPSPS['kbc']['name']` / `ASPSPS['argenta']['name']` if they differ — this is expected, not a sign something is broken, exactly as Saxo's field names needed a live-verified correction.

- [ ] **Step 3: Activate the application in restricted mode**

In the Control Panel, use "Activate by linking accounts" for the newly registered application, once for KBC and once for Argenta, authorizing each with real SCA at that bank. This is the real end-to-end exercise of the connect flow built in Task 6 — run the actual Django dev server and click through "Connect KBC" / "Connect Argenta" on the Accounts page rather than doing this purely through the Control Panel UI, so the whole flow (ticket → redirect → SCA → callback → credential saved) is proven, not just the Enable Banking side of it.

- [ ] **Step 4: Verify the callback's `valid_until` handling**

While doing Step 3, inspect the real response from `POST /sessions` (add a temporary `print(session_data)` in `EnableBankingCallbackView.get` if needed, remove after). Confirm whether `access.valid_until` is present in that response. Fix the `_parse_valid_until`/`hasattr` hedge left in `views.py` (Task 6) accordingly — either read the real field directly, or delete the dead branch and keep only the 180-day fallback, per that task's implementer note.

- [ ] **Step 5: Verify `get_balances`'s session scoping**

Confirm live whether `GET /accounts/{account_id}/balances` needs the `X-Session-Id` header `client.py` currently sends (Task 3), or whether Enable Banking scopes accounts to the JWT/application without it. Correct `client.get_balances` if the real API disagrees with what shipped.

- [ ] **Step 6: Run a real sync and confirm the Accounts page**

```bash
cd backend
.venv/bin/python manage.py shell -c "
from enablebanking import tasks
print(tasks.sync_enablebanking_balances())
"
```

Expected: real KBC and Argenta balances appear as `BankAccount` rows, and reloading the Accounts page in the browser shows them with no frontend code changes beyond Task 9's connection-status component.

- [ ] **Step 7: Register the periodic task**

Same manual Celery Beat admin step as every other sync task in this app — register `enablebanking.tasks.sync_enablebanking_balances` on a multi-hour interval (balances change far less often than Saxo positions).

- [ ] **Step 8: Run the full backend suite one more time**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: full pass, including anything adjusted in Steps 2/4/5 above.

- [ ] **Step 9: Commit any corrections made during this task**

```bash
git add backend/enablebanking
git commit -m "fix: correct Enable Banking client against live API responses"
```
