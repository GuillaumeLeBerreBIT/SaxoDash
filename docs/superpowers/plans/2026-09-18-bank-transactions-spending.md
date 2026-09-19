# Bank Transactions & Spending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest real bank transactions from KBC and Argenta via Enable Banking, categorize them by a rule-based engine, detect recurring subscriptions and internal transfers, and surface all of it through a new Spending page plus small touch points on Accounts and Dashboard.

**Architecture:** Extends the existing `backend/enablebanking/` app (not a new app) with three new models (`BankTransaction`, `Subscription`, `ManualIbanLabel`), pure-function modules for categorization/transfer-detection/subscription-detection, two new Celery tasks, and a handful of new read/write DRF views. Frontend adds one new page (`Spending.jsx`), one new drill-down page (`AccountTransactions.jsx`), and small edits to `Accounts.jsx`/`Dashboard.jsx`/`Sidebar.jsx`.

**Tech Stack:** Django REST Framework, `django-filter`, Celery, React + TanStack Query, Recharts.

**Spec:** `docs/superpowers/specs/2026-09-18-bank-transactions-spending-design.md`

## Global Constraints

- Local dev only — no deployment/process-management concerns for the new Celery tasks.
- Two hardcoded banks only: `kbc` and `argenta`. No bank-picker UI.
- No multi-user/tenancy scaffolding.
- EUR-only — confirmed live against the current dev database, not assumed. No currency-conversion logic.
- Categories are a fixed set in code, not a user-editable list.
- Only `status=BOOK` (settled) transactions are ever synced.
- Both KBC and Argenta **must be reconnected** through the existing connect flow once Task 4 ships (the new consent requests `transactions: true`, which the original consent never did) — this is a manual, user-side step covered in Task 16.

---

### Task 1: `BankTransaction`, `Subscription`, `ManualIbanLabel` models

**Files:**
- Modify: `backend/enablebanking/models.py`
- Modify: `backend/enablebanking/admin.py`
- Test: `backend/enablebanking/test_transaction_models.py` (new)

**Interfaces:**
- Consumes: `accounts.models.BankAccount`, `EnableBankingCredential.BANK_CHOICES` (existing).
- Produces: `CATEGORY_CHOICES` (module-level constant), `BankTransaction` (fields: `bank`, `bank_account` FK, `external_id` unique, `amount`, `currency`, `booking_date`, `counterparty_name`, `counterparty_iban`, `description`, `category`, `category_override`, `effective_category` property), `Subscription` (fields: `merchant_key` unique, `display_name`, `category`, `expected_amount`, `cadence`, `last_charged`, `dismissed`), `ManualIbanLabel` (fields: `iban` unique, `label`, `category`), `BankSyncRun.kind` field (choices `balances`/`transactions`, default `balances`). Consumed by every later task in this plan.

- [ ] **Step 1: Write the failing tests**

```python
# backend/enablebanking/test_transaction_models.py
from django.test import TestCase

from accounts.models import BankAccount

from .models import BankSyncRun, BankTransaction, ManualIbanLabel, Subscription


class BankTransactionModelTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 7392',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def test_effective_category_falls_back_to_category(self):
        tx = BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='e1',
            amount=-10, currency='EUR', booking_date='2026-01-01',
            counterparty_name='COLRUYT', category='GROCERIES',
        )
        self.assertEqual(tx.effective_category, 'GROCERIES')

    def test_effective_category_prefers_override(self):
        tx = BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='e2',
            amount=-10, currency='EUR', booking_date='2026-01-01',
            counterparty_name='COLRUYT', category='GROCERIES', category_override='DINING',
        )
        self.assertEqual(tx.effective_category, 'DINING')

    def test_external_id_is_unique(self):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='dup',
            amount=-10, currency='EUR', booking_date='2026-01-01',
        )
        with self.assertRaises(Exception):
            BankTransaction.objects.create(
                bank='kbc', bank_account=self.account, external_id='dup',
                amount=-20, currency='EUR', booking_date='2026-01-02',
            )


class SubscriptionModelTest(TestCase):
    def test_defaults(self):
        sub = Subscription.objects.create(
            merchant_key='NETFLIX', display_name='NETFLIX.COM', category='SUBSCRIPTIONS',
            expected_amount=12.99, cadence='monthly', last_charged='2026-01-01',
        )
        self.assertFalse(sub.dismissed)

    def test_merchant_key_is_unique(self):
        Subscription.objects.create(
            merchant_key='NETFLIX', display_name='NETFLIX.COM', category='SUBSCRIPTIONS',
            expected_amount=12.99, cadence='monthly', last_charged='2026-01-01',
        )
        with self.assertRaises(Exception):
            Subscription.objects.create(
                merchant_key='NETFLIX', display_name='NETFLIX.COM', category='SUBSCRIPTIONS',
                expected_amount=9.99, cadence='monthly', last_charged='2026-02-01',
            )


class ManualIbanLabelModelTest(TestCase):
    def test_defaults(self):
        label = ManualIbanLabel.objects.create(iban='BE00', label='Argenta Savings')
        self.assertEqual(label.category, 'SAVINGS')


class BankSyncRunKindTest(TestCase):
    def test_kind_defaults_to_balances(self):
        run = BankSyncRun.objects.create(bank='kbc', outcome='ok')
        self.assertEqual(run.kind, 'balances')

    def test_kind_can_be_transactions(self):
        run = BankSyncRun.objects.create(bank='kbc', kind='transactions', outcome='ok')
        self.assertEqual(run.kind, 'transactions')
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_transaction_models -v 2`
Expected: FAIL — `ImportError: cannot import name 'BankTransaction'` (models don't exist yet).

- [ ] **Step 3: Implement**

In `backend/enablebanking/models.py`, add after the existing `EnableBankingCredential`/`BankSyncRun` classes:

```python
from accounts.models import BankAccount

CATEGORY_CHOICES = [
    ('GROCERIES', 'Groceries'),
    ('DINING', 'Dining'),
    ('TRANSPORT', 'Transport'),
    ('UTILITIES', 'Utilities'),
    ('SUBSCRIPTIONS', 'Subscriptions'),
    ('SHOPPING', 'Shopping'),
    ('HEALTH', 'Health'),
    ('TRAVEL', 'Travel'),
    ('ENTERTAINMENT', 'Entertainment'),
    ('INCOME', 'Income'),
    ('TRANSFER', 'Transfer'),
    ('SAVINGS', 'Savings'),
    ('REFUND_CREDIT', 'Refund/Credit'),
    ('OTHER', 'Other'),
]


class BankTransaction(models.Model):
    """One settled (status=BOOK) transaction on a KBC/Argenta account. `category`
    is rule-assigned and recomputed every sync; `category_override` is
    user-set and never touched by sync - `effective_category` prefers it."""

    bank = models.CharField(max_length=20, choices=EnableBankingCredential.BANK_CHOICES)
    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name='bank_transactions')
    external_id = models.CharField(max_length=128, unique=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3)
    booking_date = models.DateField()
    counterparty_name = models.CharField(max_length=200, blank=True, default='')
    counterparty_iban = models.CharField(max_length=34, null=True, blank=True, default=None)
    description = models.CharField(max_length=500, blank=True, default='')
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='OTHER')
    category_override = models.CharField(max_length=20, choices=CATEGORY_CHOICES, null=True, blank=True, default=None)

    class Meta:
        ordering = ['-booking_date', '-id']
        indexes = [
            models.Index(fields=['-booking_date', '-id'], name='bktx_date_id_desc_idx'),
            models.Index(fields=['bank_account', '-booking_date'], name='bktx_account_date_idx'),
        ]

    def __str__(self):
        return f'{self.booking_date} {self.counterparty_name} {self.amount}'

    @property
    def effective_category(self):
        return self.category_override or self.category


class Subscription(models.Model):
    """A detected recurring-merchant pattern. Member transactions are found on
    demand by filtering BankTransaction on merchant_key, not stored via FK/M2M,
    so membership never drifts as new transactions arrive."""

    CADENCE_CHOICES = [('weekly', 'Weekly'), ('monthly', 'Monthly'), ('yearly', 'Yearly')]

    merchant_key = models.CharField(max_length=200, unique=True)
    display_name = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='SUBSCRIPTIONS')
    expected_amount = models.DecimalField(max_digits=12, decimal_places=2)
    cadence = models.CharField(max_length=10, choices=CADENCE_CHOICES)
    last_charged = models.DateField()
    dismissed = models.BooleanField(default=False)

    class Meta:
        ordering = ['-last_charged']

    def __str__(self):
        return f'{self.display_name} ({self.cadence}, {"dismissed" if self.dismissed else "active"})'


class ManualIbanLabel(models.Model):
    """Fallback for an account Enable Banking won't expose for consent (Plan B,
    see the design spec) - a pure lookup table, no balance/transaction sync."""

    iban = models.CharField(max_length=34, unique=True)
    label = models.CharField(max_length=100)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='SAVINGS')

    def __str__(self):
        return f'{self.label} ({self.iban})'
```

In the existing `BankSyncRun` class, replace:

```python
    OUTCOME_CHOICES = [('ok', 'Completed'), ('skipped', 'Skipped'), ('failed', 'Failed')]

    bank = models.CharField(max_length=20, choices=EnableBankingCredential.BANK_CHOICES)
    outcome = models.CharField(max_length=10, choices=OUTCOME_CHOICES)
    detail = models.CharField(max_length=200, blank=True, default='')
    rows = models.PositiveIntegerField(default=0)
    ran_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-ran_at', '-id']
        indexes = [models.Index(fields=['bank', '-ran_at'], name='bsr_bank_ran_at_idx')]
```

with:

```python
    KIND_CHOICES = [('balances', 'Balances'), ('transactions', 'Transactions')]
    OUTCOME_CHOICES = [('ok', 'Completed'), ('skipped', 'Skipped'), ('failed', 'Failed')]

    bank = models.CharField(max_length=20, choices=EnableBankingCredential.BANK_CHOICES)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='balances')
    outcome = models.CharField(max_length=10, choices=OUTCOME_CHOICES)
    detail = models.CharField(max_length=200, blank=True, default='')
    rows = models.PositiveIntegerField(default=0)
    ran_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-ran_at', '-id']
        indexes = [models.Index(fields=['bank', 'kind', '-ran_at'], name='bsr_bank_kind_ran_idx')]
```

In `backend/enablebanking/admin.py`, add:

```python
from .models import BankTransaction, ManualIbanLabel, Subscription


@admin.register(BankTransaction)
class BankTransactionAdmin(admin.ModelAdmin):
    list_display = ('booking_date', 'bank', 'counterparty_name', 'amount', 'category', 'category_override')
    list_filter = ('bank', 'category')
    search_fields = ('counterparty_name', 'description')


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('display_name', 'cadence', 'expected_amount', 'last_charged', 'dismissed')
    list_filter = ('cadence', 'dismissed')


@admin.register(ManualIbanLabel)
class ManualIbanLabelAdmin(admin.ModelAdmin):
    list_display = ('label', 'iban', 'category')
```

- [ ] **Step 4: Generate the migration and run the tests to verify they pass**

Run:
```bash
cd backend
.venv/bin/python manage.py makemigrations enablebanking
.venv/bin/python manage.py test enablebanking.test_transaction_models -v 2
```
Expected: one new migration generated, all tests PASS.

- [ ] **Step 5: Run the full enablebanking suite to confirm nothing broke**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests (existing `BankSyncRun` tests still pass since `kind` has a default).

- [ ] **Step 6: Commit**

```bash
git add backend/enablebanking/models.py backend/enablebanking/admin.py backend/enablebanking/test_transaction_models.py backend/enablebanking/migrations/
git commit -m "feat: add BankTransaction, Subscription, ManualIbanLabel models"
```

---

### Task 2: `enablebanking/categorization.py`

**Files:**
- Create: `backend/enablebanking/categorization.py`
- Test: `backend/enablebanking/test_categorization.py` (new)

**Interfaces:**
- Consumes: `CATEGORY_CHOICES` (Task 1).
- Produces: `categorize(counterparty_name, description, amount) -> category_code`. Consumed by `tasks.py` (Task 7).

- [ ] **Step 1: Write the failing tests**

```python
# backend/enablebanking/test_categorization.py
from decimal import Decimal

from django.test import TestCase

from .categorization import categorize


class CategorizeTest(TestCase):
    def test_matches_groceries_merchant(self):
        self.assertEqual(categorize('COLRUYT ANTWERPEN', '', Decimal('-42.10')), 'GROCERIES')

    def test_matches_subscriptions_merchant(self):
        self.assertEqual(categorize('NETFLIX.COM', 'Netflix monthly', Decimal('-12.99')), 'SUBSCRIPTIONS')

    def test_matches_on_description_when_name_is_generic(self):
        self.assertEqual(categorize('PAYMENT', 'SPOTIFY AB', Decimal('-10.99')), 'SUBSCRIPTIONS')

    def test_matching_is_case_insensitive(self):
        self.assertEqual(categorize('colruyt group', '', Decimal('-5')), 'GROCERIES')

    def test_unmatched_debit_falls_back_to_other(self):
        self.assertEqual(categorize('SOME RANDOM SHOP', '', Decimal('-5')), 'OTHER')

    def test_unmatched_credit_falls_back_to_refund_credit(self):
        self.assertEqual(categorize('UNKNOWN SENDER', '', Decimal('50')), 'REFUND_CREDIT')

    def test_refund_from_known_merchant_matches_its_spending_category(self):
        self.assertEqual(categorize('COLRUYT ANTWERPEN', 'Refund', Decimal('12.34')), 'GROCERIES')
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_categorization -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'enablebanking.categorization'`.

- [ ] **Step 3: Implement**

```python
# backend/enablebanking/categorization.py
"""Rule-based categorizer: a hardcoded {category: [keywords]} table, same
pattern as the existing ASPSPS/GRADIENTS hardcoded dicts elsewhere in this
app. Matching is symmetric for credits and debits - a refund from a known
merchant lands in that merchant's normal category, so it nets against prior
outflows there purely through signed SUM aggregation (see services.py),
no separate refund-matching logic needed."""

_RULES = {
    'GROCERIES': ['COLRUYT', 'DELHAIZE', 'CARREFOUR', 'ALDI', 'LIDL', 'OKAY', 'SPAR', 'INTERMARCHE', 'JUMBO'],
    'DINING': ['UBER EATS', 'DELIVEROO', 'TAKEAWAY', "MCDONALD", 'QUICK', 'STARBUCKS', 'RESTAURANT'],
    'TRANSPORT': ['NMBS', 'SNCB', 'DE LIJN', 'STIB', 'MIVB', 'TEC', 'UBER', 'SHELL', 'TOTALENERGIES', 'Q8', 'ESSO'],
    'UTILITIES': ['ENGIE', 'LUMINUS', 'PROXIMUS', 'TELENET', 'ORANGE BELGIUM', 'VOO', 'FLUVIUS'],
    'SUBSCRIPTIONS': ['NETFLIX', 'SPOTIFY', 'DISNEY', 'AMAZON PRIME', 'YOUTUBE PREMIUM', 'ICLOUD', 'APPLE.COM/BILL', 'PLAYSTATION'],
    'SHOPPING': ['AMAZON', 'BOL.COM', 'ZALANDO', 'MEDIAMARKT', 'COOLBLUE', 'IKEA'],
    'HEALTH': ['PHARMACIE', 'APOTHEEK', 'MUTUALITE', 'MUTUALITEIT'],
    'TRAVEL': ['BOOKING.COM', 'AIRBNB', 'RYANAIR', 'BRUSSELS AIRLINES', 'EUROSTAR'],
    'ENTERTAINMENT': ['KINEPOLIS', 'PATHE', 'STUBHUB', 'TICKETMASTER', 'FNAC'],
    # No default employer keywords - extend this list as real income sources
    # show up uncategorized; until then unmatched credits fall to REFUND_CREDIT.
    'INCOME': [],
}


def categorize(counterparty_name, description, amount):
    haystack = f'{counterparty_name or ""} {description or ""}'.upper()

    for category, keywords in _RULES.items():
        if any(keyword in haystack for keyword in keywords):
            return category

    return 'REFUND_CREDIT' if amount > 0 else 'OTHER'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_categorization -v 2`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/categorization.py backend/enablebanking/test_categorization.py
git commit -m "feat: add rule-based bank transaction categorizer"
```

---

### Task 3: `enablebanking/mapping.py` — `to_bank_transaction_fields`

**Files:**
- Modify: `backend/enablebanking/mapping.py`
- Test: `backend/enablebanking/test_transaction_mapping.py` (new)

**Interfaces:**
- Produces: `to_bank_transaction_fields(bank, account_uid, raw_transaction) -> dict` (keys: `bank`, `external_id`, `amount`, `currency`, `booking_date`, `counterparty_name`, `counterparty_iban`, `description`). Consumed by `tasks.py` (Task 7).

- [ ] **Step 1: Write the failing tests**

```python
# backend/enablebanking/test_transaction_mapping.py
from decimal import Decimal

from django.test import TestCase

from .mapping import to_bank_transaction_fields

DEBIT_RAW = {
    'entry_reference': 'e-1',
    'transaction_amount': {'currency': 'EUR', 'amount': '42.10'},
    'credit_debit_indicator': 'DBIT',
    'status': 'BOOK',
    'booking_date': '2026-01-05',
    'creditor': {'name': 'COLRUYT ANTWERPEN'},
    'creditor_account': {'iban': 'BE00111122223333'},
    'remittance_information': ['Card payment'],
}

CREDIT_RAW = {
    'entry_reference': 'e-2',
    'transaction_amount': {'currency': 'EUR', 'amount': '500.00'},
    'credit_debit_indicator': 'CRDT',
    'status': 'BOOK',
    'booking_date': '2026-01-06',
    'debtor': {'name': 'ACME CORP'},
    'debtor_account': {'iban': 'BE99999988887777'},
    'remittance_information': ['RF12345', 'Salary'],
}


class ToBankTransactionFieldsTest(TestCase):
    def test_debit_is_negative_and_uses_creditor_as_counterparty(self):
        fields = to_bank_transaction_fields('kbc', 'acc-1', DEBIT_RAW)
        self.assertEqual(fields['amount'], Decimal('-42.10'))
        self.assertEqual(fields['counterparty_name'], 'COLRUYT ANTWERPEN')
        self.assertEqual(fields['counterparty_iban'], 'BE00111122223333')

    def test_credit_is_positive_and_uses_debtor_as_counterparty(self):
        fields = to_bank_transaction_fields('kbc', 'acc-1', CREDIT_RAW)
        self.assertEqual(fields['amount'], Decimal('500.00'))
        self.assertEqual(fields['counterparty_name'], 'ACME CORP')

    def test_external_id_includes_bank_account_and_entry_reference(self):
        fields = to_bank_transaction_fields('kbc', 'acc-1', DEBIT_RAW)
        self.assertEqual(fields['external_id'], 'enablebanking:kbc:acc-1:e-1')

    def test_remittance_information_is_joined(self):
        fields = to_bank_transaction_fields('kbc', 'acc-1', CREDIT_RAW)
        self.assertEqual(fields['description'], 'RF12345 Salary')

    def test_missing_counterparty_account_gives_none_iban(self):
        raw = {**DEBIT_RAW, 'creditor_account': None}
        fields = to_bank_transaction_fields('kbc', 'acc-1', raw)
        self.assertIsNone(fields['counterparty_iban'])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_transaction_mapping -v 2`
Expected: FAIL — `ImportError: cannot import name 'to_bank_transaction_fields'`.

- [ ] **Step 3: Implement**

Append to `backend/enablebanking/mapping.py`:

```python
def to_bank_transaction_fields(bank, account_uid, raw):
    """Map one Enable Banking transaction to BankTransaction fields.
    remittance_information is a plain list of strings - joined here into one
    description. The counterparty is the *other* party: creditor for an
    outflow (DBIT), debtor for an inflow (CRDT) - never the account holder."""
    is_credit = raw['credit_debit_indicator'] == 'CRDT'
    amount = Decimal(raw['transaction_amount']['amount'])
    counterparty = (raw.get('debtor') if is_credit else raw.get('creditor')) or {}
    counterparty_account = (raw.get('debtor_account') if is_credit else raw.get('creditor_account')) or {}

    return {
        'bank': bank,
        'external_id': f'enablebanking:{bank}:{account_uid}:{raw["entry_reference"]}',
        'amount': amount if is_credit else -amount,
        'currency': raw['transaction_amount']['currency'],
        'booking_date': raw['booking_date'],
        'counterparty_name': counterparty.get('name', ''),
        'counterparty_iban': counterparty_account.get('iban'),
        'description': ' '.join(raw.get('remittance_information') or []),
    }
```

Add `from decimal import Decimal` to the top of `backend/enablebanking/mapping.py` if not already present (it is — `to_account_fields` already imports it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_transaction_mapping -v 2`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/mapping.py backend/enablebanking/test_transaction_mapping.py
git commit -m "feat: map Enable Banking transaction payloads to BankTransaction fields"
```

---

### Task 4: `enablebanking/client.py` — transactions access, `get_transactions`, `iter_transactions`

**Files:**
- Modify: `backend/enablebanking/client.py`
- Test: `backend/enablebanking/test_transaction_client.py` (new)

**Interfaces:**
- Produces: `build_authorize_url(bank, state, redirect_url, iban=None)` (modified signature — now requests `balances`/`transactions` access, and an optional account-scoped `iban`), `get_transactions(session_id, account_uid, date_from=None, strategy=None, continuation_key=None) -> dict`, `iter_transactions(session_id, account_uid, date_from=None, strategy=None)` (generator, follows `continuation_key`). Consumed by `views.py` (Task 11) and `tasks.py` (Task 7).

- [ ] **Step 1: Write the failing tests**

```python
# backend/enablebanking/test_transaction_client.py
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings

from .tests import TEST_PRIVATE_KEY_PEM  # the throwaway test keypair defined in the existing client tests
from . import client


@override_settings(
    ENABLE_BANKING_APPLICATION_ID='11111111-1111-1111-1111-111111111111',
    ENABLE_BANKING_PRIVATE_KEY=TEST_PRIVATE_KEY_PEM,
)
class BuildAuthorizeUrlAccessTest(TestCase):
    @patch('enablebanking.client.requests.post')
    def test_requests_balances_and_transactions_access(self, mock_post):
        mock_post.return_value = Mock(ok=True, json=lambda: {'url': 'https://example.com'})
        client.build_authorize_url('kbc', 'state123', 'http://localhost:8000/cb')

        access = mock_post.call_args.kwargs['json']['access']
        self.assertTrue(access['balances'])
        self.assertTrue(access['transactions'])
        self.assertNotIn('accounts', access)

    @patch('enablebanking.client.requests.post')
    def test_iban_adds_a_scoped_accounts_request(self, mock_post):
        mock_post.return_value = Mock(ok=True, json=lambda: {'url': 'https://example.com'})
        client.build_authorize_url('kbc', 'state123', 'http://localhost:8000/cb', iban='BE0012345678')

        access = mock_post.call_args.kwargs['json']['access']
        self.assertEqual(access['accounts'], [{'iban': 'BE0012345678'}])


@override_settings(
    ENABLE_BANKING_APPLICATION_ID='11111111-1111-1111-1111-111111111111',
    ENABLE_BANKING_PRIVATE_KEY=TEST_PRIVATE_KEY_PEM,
)
class GetTransactionsTest(TestCase):
    @patch('enablebanking.client.requests.get')
    def test_sends_date_from_and_strategy(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'transactions': [], 'continuation_key': None})
        client.get_transactions('sess-1', 'acc-1', date_from='2026-01-01', strategy='longest')

        self.assertEqual(mock_get.call_args.kwargs['params'], {'date_from': '2026-01-01', 'strategy': 'longest'})
        self.assertIn('/accounts/acc-1/transactions', mock_get.call_args.args[0])
        self.assertEqual(mock_get.call_args.kwargs['headers']['X-Session-Id'], 'sess-1')

    @patch('enablebanking.client.requests.get')
    def test_propagates_api_errors(self, mock_get):
        mock_get.return_value = Mock(ok=False, status_code=500, text='server error')
        with self.assertRaises(client.EnableBankingAPIError):
            client.get_transactions('sess-1', 'acc-1')


@override_settings(
    ENABLE_BANKING_APPLICATION_ID='11111111-1111-1111-1111-111111111111',
    ENABLE_BANKING_PRIVATE_KEY=TEST_PRIVATE_KEY_PEM,
)
class IterTransactionsTest(TestCase):
    @patch('enablebanking.client.requests.get')
    def test_follows_continuation_key_across_pages(self, mock_get):
        mock_get.side_effect = [
            Mock(ok=True, json=lambda: {'transactions': [{'entry_reference': '1'}], 'continuation_key': 'ck-1'}),
            Mock(ok=True, json=lambda: {'transactions': [{'entry_reference': '2'}], 'continuation_key': None}),
        ]
        results = list(client.iter_transactions('sess-1', 'acc-1', strategy='longest'))

        self.assertEqual([r['entry_reference'] for r in results], ['1', '2'])
        self.assertEqual(mock_get.call_count, 2)
        second_call_params = mock_get.call_args_list[1].kwargs['params']
        self.assertEqual(second_call_params, {'continuation_key': 'ck-1'})

    @patch('enablebanking.client.requests.get')
    def test_single_page_stops_immediately(self, mock_get):
        mock_get.return_value = Mock(ok=True, json=lambda: {'transactions': [{'entry_reference': '1'}], 'continuation_key': None})
        results = list(client.iter_transactions('sess-1', 'acc-1'))
        self.assertEqual(len(results), 1)
        self.assertEqual(mock_get.call_count, 1)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_transaction_client -v 2`
Expected: FAIL — `AttributeError: module 'enablebanking.client' has no attribute 'get_transactions'` (and the `build_authorize_url` access-flags tests fail their assertions, since it currently sends neither `balances` nor `transactions`).

- [ ] **Step 3: Implement**

In `backend/enablebanking/client.py`, replace the existing `build_authorize_url`:

```python
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
```

with:

```python
def build_authorize_url(bank, state, redirect_url, iban=None):
    access = {
        'valid_until': _valid_until_180_days(),
        'balances': True,
        'transactions': True,
    }
    if iban:
        access['accounts'] = [{'iban': iban}]

    body = {
        'access': access,
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
```

Then append:

```python
def get_transactions(session_id, account_uid, date_from=None, strategy=None, continuation_key=None):
    params = {}
    if date_from:
        params['date_from'] = date_from
    if strategy:
        params['strategy'] = strategy
    if continuation_key:
        params['continuation_key'] = continuation_key

    response = requests.get(
        f'{API_BASE_URL}/accounts/{account_uid}/transactions',
        params=params,
        headers=_headers({'X-Session-Id': session_id}),
        timeout=REQUEST_TIMEOUT,
    )
    _raise_for_status(response, 'Get transactions')
    return response.json()


def iter_transactions(session_id, account_uid, date_from=None, strategy=None):
    """Yields every transaction for one account, following continuation_key
    until Enable Banking reports no more pages. date_from/strategy are only
    sent on the first request - continuation_key alone carries the rest."""
    continuation_key = None
    while True:
        if continuation_key:
            page = get_transactions(session_id, account_uid, continuation_key=continuation_key)
        else:
            page = get_transactions(session_id, account_uid, date_from=date_from, strategy=strategy)
        yield from page['transactions']
        continuation_key = page.get('continuation_key')
        if not continuation_key:
            break
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests (including the existing `EnableBankingClientTest.test_build_authorize_url_returns_the_redirect_url`, which doesn't assert on `access` contents so it's unaffected by the signature change).

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/client.py backend/enablebanking/test_transaction_client.py
git commit -m "feat: request transactions access and add paginated transaction fetching"
```

---

### Task 5: `enablebanking/transfers.py`

**Files:**
- Create: `backend/enablebanking/transfers.py`
- Test: `backend/enablebanking/test_transfers.py` (new)

**Interfaces:**
- Consumes: `BankTransaction`, `ManualIbanLabel` (Task 1).
- Produces: `mark_transfers(bank_transactions)` — mutates `.category` in place on a list/iterable of unsaved `BankTransaction` instances (each must already have `.bank_account` set to a real fetched `BankAccount` instance, not just an id). Consumed by `tasks.py` (Task 7).

- [ ] **Step 1: Write the failing tests**

```python
# backend/enablebanking/test_transfers.py
from datetime import date

from django.test import TestCase

from accounts.models import BankAccount

from .models import BankTransaction, ManualIbanLabel
from .transfers import mark_transfers


class MarkTransfersTest(TestCase):
    def setUp(self):
        self.kbc = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        self.argenta = BankAccount.objects.create(
            bank='Argenta', type='Current account', iban_masked='BE12 •••• •••• 0002',
            balance=100, available=100, external_id='enablebanking:argenta:acc-2',
        )
        self.savings = BankAccount.objects.create(
            bank='Argenta', type='Savings account', iban_masked='BE12 •••• •••• 0003',
            balance=100, available=100, external_id='enablebanking:argenta:acc-3',
        )

    def test_matches_opposite_leg_within_batch_and_tags_transfer(self):
        outflow = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='o1', amount=-500,
            currency='EUR', booking_date=date(2026, 1, 5), category='OTHER',
        )
        inflow = BankTransaction(
            bank='argenta', bank_account=self.argenta, external_id='i1', amount=500,
            currency='EUR', booking_date=date(2026, 1, 6), category='REFUND_CREDIT',
        )
        mark_transfers([outflow, inflow])
        self.assertEqual(outflow.category, 'TRANSFER')
        self.assertEqual(inflow.category, 'TRANSFER')

    def test_matches_against_already_persisted_transactions(self):
        BankTransaction.objects.create(
            bank='argenta', bank_account=self.argenta, external_id='saved-inflow', amount=200,
            currency='EUR', booking_date=date(2026, 1, 10), category='REFUND_CREDIT',
        )
        outflow = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='o2', amount=-200,
            currency='EUR', booking_date=date(2026, 1, 11), category='OTHER',
        )
        mark_transfers([outflow])
        self.assertEqual(outflow.category, 'TRANSFER')

    def test_destination_savings_account_tags_savings_not_transfer(self):
        outflow = BankTransaction(
            bank='argenta', bank_account=self.argenta, external_id='o3', amount=-300,
            currency='EUR', booking_date=date(2026, 1, 12), category='OTHER',
        )
        inflow = BankTransaction(
            bank='argenta', bank_account=self.savings, external_id='i3', amount=300,
            currency='EUR', booking_date=date(2026, 1, 12), category='REFUND_CREDIT',
        )
        mark_transfers([outflow, inflow])
        self.assertEqual(outflow.category, 'SAVINGS')

    def test_no_match_leaves_category_untouched(self):
        tx = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='o4', amount=-45,
            currency='EUR', booking_date=date(2026, 1, 13), category='GROCERIES',
        )
        mark_transfers([tx])
        self.assertEqual(tx.category, 'GROCERIES')

    def test_manual_iban_label_match_uses_its_category(self):
        ManualIbanLabel.objects.create(iban='BE99000000000000', label='External Savings', category='SAVINGS')
        tx = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='o5', amount=-100,
            currency='EUR', booking_date=date(2026, 1, 14), category='OTHER',
            counterparty_iban='BE99000000000000',
        )
        mark_transfers([tx])
        self.assertEqual(tx.category, 'SAVINGS')

    def test_same_account_outflow_and_inflow_do_not_match_each_other(self):
        outflow = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='o6', amount=-80,
            currency='EUR', booking_date=date(2026, 1, 15), category='OTHER',
        )
        inflow = BankTransaction(
            bank='kbc', bank_account=self.kbc, external_id='i6', amount=80,
            currency='EUR', booking_date=date(2026, 1, 15), category='REFUND_CREDIT',
        )
        mark_transfers([outflow, inflow])
        self.assertEqual(outflow.category, 'OTHER')
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_transfers -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'enablebanking.transfers'`.

- [ ] **Step 3: Implement**

```python
# backend/enablebanking/transfers.py
"""Tags same-amount/opposite-sign/nearby-date transactions across different
own accounts as TRANSFER or SAVINGS, overriding whatever categorization.py
assigned. See docs/superpowers/specs/2026-09-18-bank-transactions-spending-design.md."""
from datetime import timedelta

from .models import BankTransaction, ManualIbanLabel

DATE_TOLERANCE = timedelta(days=2)


def mark_transfers(bank_transactions):
    manual_labels = {label.iban: label for label in ManualIbanLabel.objects.all()}
    batch = list(bank_transactions)

    for tx in batch:
        if tx.counterparty_iban and tx.counterparty_iban in manual_labels:
            tx.category = manual_labels[tx.counterparty_iban].category
            continue

        match = _find_own_account_match(tx, batch)
        if match is None:
            continue

        tx.category = 'SAVINGS' if 'savings' in match.bank_account.type.lower() else 'TRANSFER'


def _find_own_account_match(tx, batch):
    window_start = tx.booking_date - DATE_TOLERANCE
    window_end = tx.booking_date + DATE_TOLERANCE

    for other in batch:
        if (
            other is not tx
            and other.bank_account_id != tx.bank_account_id
            and other.amount == -tx.amount
            and window_start <= other.booking_date <= window_end
        ):
            return other

    return (
        BankTransaction.objects
        .filter(amount=-tx.amount, booking_date__range=(window_start, window_end))
        .exclude(bank_account=tx.bank_account)
        .first()
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_transfers -v 2`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/transfers.py backend/enablebanking/test_transfers.py
git commit -m "feat: detect transfers between own bank accounts"
```

---

### Task 6: `enablebanking/subscriptions.py`

**Files:**
- Create: `backend/enablebanking/subscriptions.py`
- Test: `backend/enablebanking/test_subscriptions.py` (new)

**Interfaces:**
- Consumes: `BankTransaction`, `Subscription` (Task 1).
- Produces: `detect_subscriptions() -> int` (count of subscriptions upserted). Consumed by `tasks.py` (Task 8).

- [ ] **Step 1: Write the failing tests**

```python
# backend/enablebanking/test_subscriptions.py
from datetime import date

from django.test import TestCase

from accounts.models import BankAccount

from .models import BankTransaction, Subscription
from .subscriptions import detect_subscriptions


class DetectSubscriptionsTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def _charge(self, merchant, amount, booking_date, external_id, category='SUBSCRIPTIONS'):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id=external_id,
            amount=amount, currency='EUR', booking_date=booking_date,
            counterparty_name=merchant, category=category,
        )

    def test_detects_a_monthly_pattern(self):
        self._charge('NETFLIX.COM', -12.99, date(2026, 1, 3), 'n1')
        self._charge('NETFLIX.COM', -12.99, date(2026, 2, 3), 'n2')
        self._charge('NETFLIX.COM', -12.99, date(2026, 3, 4), 'n3')

        count = detect_subscriptions()

        self.assertEqual(count, 1)
        sub = Subscription.objects.get(merchant_key='NETFLIX.COM')
        self.assertEqual(sub.cadence, 'monthly')
        self.assertEqual(sub.last_charged, date(2026, 3, 4))

    def test_single_occurrence_is_not_a_subscription(self):
        self._charge('ONE OFF SHOP', -50, date(2026, 1, 3), 'o1')
        self.assertEqual(detect_subscriptions(), 0)

    def test_irregular_cadence_is_not_a_subscription(self):
        self._charge('IRREGULAR', -20, date(2026, 1, 3), 'r1')
        self._charge('IRREGULAR', -20, date(2026, 1, 10), 'r2')
        self.assertEqual(detect_subscriptions(), 0)

    def test_unstable_amount_is_not_a_subscription(self):
        self._charge('VARIABLE', -10, date(2026, 1, 1), 'v1')
        self._charge('VARIABLE', -40, date(2026, 2, 1), 'v2')
        self.assertEqual(detect_subscriptions(), 0)

    def test_transfers_are_excluded_from_detection(self):
        self._charge('OWN OTHER ACCOUNT', -500, date(2026, 1, 1), 't1', category='TRANSFER')
        self._charge('OWN OTHER ACCOUNT', -500, date(2026, 2, 1), 't2', category='TRANSFER')
        self.assertEqual(detect_subscriptions(), 0)

    def test_rerun_preserves_dismissed_flag(self):
        self._charge('NETFLIX.COM', -12.99, date(2026, 1, 3), 'n1')
        self._charge('NETFLIX.COM', -12.99, date(2026, 2, 3), 'n2')
        detect_subscriptions()
        sub = Subscription.objects.get(merchant_key='NETFLIX.COM')
        sub.dismissed = True
        sub.save()

        self._charge('NETFLIX.COM', -12.99, date(2026, 3, 4), 'n3')
        detect_subscriptions()

        sub.refresh_from_db()
        self.assertTrue(sub.dismissed)
        self.assertEqual(sub.last_charged, date(2026, 3, 4))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_subscriptions -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'enablebanking.subscriptions'`.

- [ ] **Step 3: Implement**

```python
# backend/enablebanking/subscriptions.py
"""Detects recurring-merchant patterns across all synced BankTransactions and
upserts Subscription rows. See docs/superpowers/specs/
2026-09-18-bank-transactions-spending-design.md for the detection rules."""
from collections import defaultdict
from decimal import Decimal

from .models import BankTransaction, Subscription

AMOUNT_TOLERANCE = Decimal('0.10')

# (min_days, max_days) average gap between charges for each cadence.
CADENCE_WINDOWS = {
    'weekly': (5, 9),
    'monthly': (23, 36),
    'yearly': (351, 379),
}


def _normalize_merchant(name):
    return (name or '').strip().upper()


def _cadence_for(gaps_days):
    avg_gap = sum(gaps_days) / len(gaps_days)
    for cadence, (low, high) in CADENCE_WINDOWS.items():
        if low <= avg_gap <= high:
            return cadence
    return None


def detect_subscriptions():
    groups = defaultdict(list)
    qs = (
        BankTransaction.objects
        .exclude(category__in=['TRANSFER', 'SAVINGS'])
        .filter(amount__lt=0)
        .order_by('booking_date')
    )
    for tx in qs:
        groups[_normalize_merchant(tx.counterparty_name)].append(tx)

    detected = 0
    for merchant_key, txs in groups.items():
        if not merchant_key or len(txs) < 2:
            continue

        dates = [tx.booking_date for tx in txs]
        gaps = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        cadence = _cadence_for(gaps)
        if cadence is None:
            continue

        amounts = [abs(tx.amount) for tx in txs]
        avg_amount = sum(amounts) / len(amounts)
        if any(abs(a - avg_amount) > avg_amount * AMOUNT_TOLERANCE for a in amounts):
            continue

        Subscription.objects.update_or_create(
            merchant_key=merchant_key,
            defaults={
                'display_name': txs[-1].counterparty_name,
                'category': txs[-1].category,
                'expected_amount': avg_amount,
                'cadence': cadence,
                'last_charged': dates[-1],
            },
        )
        detected += 1

    return detected
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_subscriptions -v 2`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/subscriptions.py backend/enablebanking/test_subscriptions.py
git commit -m "feat: detect recurring subscriptions from bank transactions"
```

---

### Task 7: `enablebanking/tasks.py` — `sync_enablebanking_transactions`

**Files:**
- Modify: `backend/enablebanking/tasks.py`
- Test: `backend/enablebanking/test_transaction_sync_task.py` (new)

**Interfaces:**
- Consumes: `client.iter_transactions` (Task 4), `mapping.to_bank_transaction_fields` (Task 3), `categorization.categorize` (Task 2), `transfers.mark_transfers` (Task 5), `credentials.connection_state`/`BANKS` (existing), `BankTransaction`, `BankSyncRun` (Task 1).
- Produces: `sync_enablebanking_transactions()` — `@shared_task`, no arguments. Registered manually via Celery Beat admin (Task 16).

- [ ] **Step 1: Write the failing tests**

```python
# backend/enablebanking/test_transaction_sync_task.py
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from accounts.models import BankAccount

from .models import BankSyncRun, BankTransaction, EnableBankingCredential
from .tasks import sync_enablebanking_transactions

LINKED_ACCOUNT = {'uid': 'acc-1', 'account_id': {'iban': 'BE00'}, 'product': 'Current account'}

RAW_TX = {
    'entry_reference': 'e-1',
    'transaction_amount': {'currency': 'EUR', 'amount': '10.00'},
    'credit_debit_indicator': 'DBIT',
    'status': 'BOOK',
    'booking_date': '2026-01-05',
    'creditor': {'name': 'COLRUYT'},
    'remittance_information': [],
}

RAW_PENDING = {**RAW_TX, 'entry_reference': 'e-2', 'status': 'PDNG'}


class SyncEnablebankingTransactionsTaskTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        self.credential = EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[LINKED_ACCOUNT],
        )

    def test_skips_a_bank_with_no_credential(self):
        EnableBankingCredential.objects.filter(bank='kbc').delete()
        sync_enablebanking_transactions()
        run = BankSyncRun.objects.get(bank='kbc', kind='transactions')
        self.assertEqual(run.outcome, 'skipped')

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_first_sync_uses_longest_strategy_and_creates_rows(self, mock_iter):
        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()

        self.assertEqual(mock_iter.call_args.kwargs.get('strategy'), 'longest')
        tx = BankTransaction.objects.get(external_id='enablebanking:kbc:acc-1:e-1')
        self.assertEqual(tx.category, 'GROCERIES')
        run = BankSyncRun.objects.get(bank='kbc', kind='transactions')
        self.assertEqual(run.outcome, 'ok')
        self.assertEqual(run.rows, 1)

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_pending_transactions_are_skipped(self, mock_iter):
        mock_iter.return_value = iter([RAW_PENDING])
        sync_enablebanking_transactions()
        self.assertEqual(BankTransaction.objects.count(), 0)

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_second_sync_uses_incremental_date_from(self, mock_iter):
        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()

        mock_iter.reset_mock()
        mock_iter.return_value = iter([])
        sync_enablebanking_transactions()

        self.assertEqual(mock_iter.call_args.kwargs.get('date_from'), '2026-01-05')
        self.assertIsNone(mock_iter.call_args.kwargs.get('strategy'))

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_rerun_upserts_rather_than_duplicating(self, mock_iter):
        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()
        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()
        self.assertEqual(BankTransaction.objects.filter(external_id='enablebanking:kbc:acc-1:e-1').count(), 1)

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_category_override_survives_resync(self, mock_iter):
        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()
        tx = BankTransaction.objects.get(external_id='enablebanking:kbc:acc-1:e-1')
        tx.category_override = 'DINING'
        tx.save()

        mock_iter.return_value = iter([RAW_TX])
        sync_enablebanking_transactions()

        tx.refresh_from_db()
        self.assertEqual(tx.category_override, 'DINING')

    @patch('enablebanking.tasks.client.iter_transactions')
    def test_cross_bank_transfer_pair_synced_in_the_same_run_matches_both_ways(self, mock_iter):
        """Regression test: both legs of a same-run transfer must end up
        TRANSFER, regardless of which bank credentials.BANKS processes first -
        catches the bug where per-account mark_transfers calls could never
        see the other bank's leg in the same batch."""
        argenta_account = BankAccount.objects.create(
            bank='Argenta', type='Current account', iban_masked='BE12 •••• •••• 0002',
            balance=100, available=100, external_id='enablebanking:argenta:acc-2',
        )
        EnableBankingCredential.objects.create(
            bank='argenta', session_id='s', valid_until=timezone.now() + timedelta(days=90),
            linked_accounts=[{'uid': 'acc-2', 'account_id': {'iban': 'BE00'}, 'product': 'Current account'}],
        )

        kbc_outflow = {
            'entry_reference': 'kbc-out', 'transaction_amount': {'currency': 'EUR', 'amount': '500.00'},
            'credit_debit_indicator': 'DBIT', 'status': 'BOOK', 'booking_date': '2026-01-05',
            'creditor': {'name': 'OWN TRANSFER'}, 'remittance_information': [],
        }
        argenta_inflow = {
            'entry_reference': 'argenta-in', 'transaction_amount': {'currency': 'EUR', 'amount': '500.00'},
            'credit_debit_indicator': 'CRDT', 'status': 'BOOK', 'booking_date': '2026-01-05',
            'debtor': {'name': 'OWN TRANSFER'}, 'remittance_information': [],
        }

        def fake_iter(session_id, account_uid, **kwargs):
            return iter([kbc_outflow]) if account_uid == 'acc-1' else iter([argenta_inflow])

        mock_iter.side_effect = fake_iter
        sync_enablebanking_transactions()

        self.assertEqual(BankTransaction.objects.get(external_id='enablebanking:kbc:acc-1:kbc-out').category, 'TRANSFER')
        self.assertEqual(BankTransaction.objects.get(external_id='enablebanking:argenta:acc-2:argenta-in').category, 'TRANSFER')
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_transaction_sync_task -v 2`
Expected: FAIL — `ImportError: cannot import name 'sync_enablebanking_transactions'`.

- [ ] **Step 3: Implement**

Append to `backend/enablebanking/tasks.py`:

```python
from accounts.models import BankAccount

from . import categorization, mapping, transfers
from .models import BankTransaction


def _fetch_transactions_for_account(bank, credential, account):
    """Fetches and maps new transactions for one linked account into unsaved
    BankTransaction instances - categorized, but not yet transfer-checked or
    persisted. Kept separate from persistence so the caller can combine every
    account's new transactions into one list before running mark_transfers:
    doing it per-account would mean a same-run KBC<->Argenta transfer pair
    could never see each other in the same batch (see transfers.py)."""
    account_uid = account['uid']
    bank_account = BankAccount.objects.filter(
        external_id=f'enablebanking:{bank}:{account_uid}'
    ).first()
    if bank_account is None:
        return []

    latest = (
        BankTransaction.objects.filter(bank_account=bank_account)
        .order_by('-booking_date').first()
    )
    fetch_kwargs = {'strategy': 'longest'} if latest is None else {'date_from': str(latest.booking_date)}

    batch = []
    for raw in client.iter_transactions(credential.session_id, account_uid, **fetch_kwargs):
        if raw.get('status') != 'BOOK':
            continue
        fields = mapping.to_bank_transaction_fields(bank, account_uid, raw)
        tx = BankTransaction(bank_account=bank_account, **fields)
        tx.category = categorization.categorize(tx.counterparty_name, tx.description, tx.amount)
        batch.append(tx)

    return batch


def _persist(batch):
    for tx in batch:
        BankTransaction.objects.update_or_create(
            external_id=tx.external_id,
            defaults={
                'bank': tx.bank, 'bank_account': tx.bank_account, 'amount': tx.amount,
                'currency': tx.currency, 'booking_date': tx.booking_date,
                'counterparty_name': tx.counterparty_name, 'counterparty_iban': tx.counterparty_iban,
                'description': tx.description, 'category': tx.category,
            },
        )


@shared_task(autoretry_for=(client.EnableBankingAPIError,), retry_backoff=True, max_retries=3)
def sync_enablebanking_transactions():
    all_new = []
    run_info = []  # (bank, outcome, detail, rows), recorded after persisting

    for bank in credentials.BANKS:
        state = credentials.connection_state(bank)

        if not state.usable:
            run_info.append((bank, 'skipped', state.reason or '', 0))
            continue

        bank_batch = []
        for account in state.credential.linked_accounts:
            try:
                bank_batch += _fetch_transactions_for_account(bank, state.credential, account)
            except client.EnableBankingAPIError as exc:
                logger.warning('Skipping %s account %s transactions: %s', bank, account['uid'], exc)

        run_info.append((bank, 'ok', '', len(bank_batch)))
        all_new += bank_batch

    # Every bank's new transactions are combined before transfer detection
    # runs once, so a KBC<->Argenta transfer pair synced in the same run can
    # match each other regardless of which bank was processed first.
    transfers.mark_transfers(all_new)
    _persist(all_new)

    for bank, outcome, detail, rows in run_info:
        BankSyncRun.objects.create(bank=bank, kind='transactions', outcome=outcome, detail=detail[:200], rows=rows)

    return len(all_new)
```

`_sync_one_bank`/`sync_enablebanking_balances` already import `client`, `credentials`, `BankSyncRun`, `logger`, `shared_task` at the top of this file — no new top-level imports needed for those.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/tasks.py backend/enablebanking/test_transaction_sync_task.py
git commit -m "feat: add sync_enablebanking_transactions Celery task"
```

---

### Task 8: `enablebanking/tasks.py` — `detect_enablebanking_subscriptions`

**Files:**
- Modify: `backend/enablebanking/tasks.py`
- Test: `backend/enablebanking/test_transaction_sync_task.py` (append)

**Interfaces:**
- Consumes: `subscriptions.detect_subscriptions` (Task 6).
- Produces: `detect_enablebanking_subscriptions()` — `@shared_task`, no arguments. Registered manually via Celery Beat admin (Task 16), daily interval.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/enablebanking/test_transaction_sync_task.py
from datetime import date
from unittest.mock import patch

from .tasks import detect_enablebanking_subscriptions


class DetectEnablebankingSubscriptionsTaskTest(TestCase):
    @patch('enablebanking.tasks.subscriptions.detect_subscriptions')
    def test_delegates_to_the_service_function(self, mock_detect):
        mock_detect.return_value = 3
        result = detect_enablebanking_subscriptions()
        self.assertEqual(result, 3)
        mock_detect.assert_called_once()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_transaction_sync_task.DetectEnablebankingSubscriptionsTaskTest -v 2`
Expected: FAIL — `ImportError: cannot import name 'detect_enablebanking_subscriptions'`.

- [ ] **Step 3: Implement**

In `backend/enablebanking/tasks.py`, change the import line added in Task 7:

```python
from . import categorization, mapping, transfers
```

to:

```python
from . import categorization, mapping, subscriptions, transfers
```

Append:

```python
@shared_task
def detect_enablebanking_subscriptions():
    return subscriptions.detect_subscriptions()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/tasks.py backend/enablebanking/test_transaction_sync_task.py
git commit -m "feat: add detect_enablebanking_subscriptions Celery task"
```

---

### Task 9: `enablebanking/services.py` — `spending_summary`

**Files:**
- Create: `backend/enablebanking/services.py`
- Test: `backend/enablebanking/test_spending_service.py` (new)

**Interfaces:**
- Consumes: `BankTransaction` (Task 1).
- Produces: `spending_summary(date_from=None, date_to=None) -> dict` (`{"categories": [{"category", "amount"}, ...], "total": Decimal, "transfers": Decimal}`). Consumed by `views.py` (Task 10).

- [ ] **Step 1: Write the failing tests**

```python
# backend/enablebanking/test_spending_service.py
from datetime import date
from decimal import Decimal

from django.test import TestCase

from accounts.models import BankAccount

from .models import BankTransaction
from .services import spending_summary


class SpendingSummaryTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def _tx(self, amount, category, booking_date, external_id, category_override=None):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id=external_id,
            amount=amount, currency='EUR', booking_date=booking_date,
            category=category, category_override=category_override,
        )

    def test_sums_outflows_by_category(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('-10'), 'GROCERIES', date(2026, 1, 10), 't2')
        self._tx(Decimal('-15'), 'DINING', date(2026, 1, 12), 't3')

        summary = spending_summary()

        by_category = {row['category']: row['amount'] for row in summary['categories']}
        self.assertEqual(by_category['GROCERIES'], Decimal('50'))
        self.assertEqual(by_category['DINING'], Decimal('15'))
        self.assertEqual(summary['total'], Decimal('65'))

    def test_inflows_are_excluded(self):
        self._tx(Decimal('500'), 'REFUND_CREDIT', date(2026, 1, 1), 't1')
        summary = spending_summary()
        self.assertEqual(summary['categories'], [])
        self.assertEqual(summary['total'], Decimal('0'))

    def test_transfers_are_reported_separately_and_excluded_from_total(self):
        self._tx(Decimal('-500'), 'TRANSFER', date(2026, 1, 1), 't1')
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 2), 't2')

        summary = spending_summary()

        self.assertEqual(summary['transfers'], Decimal('500'))
        self.assertEqual(summary['total'], Decimal('40'))
        self.assertNotIn('TRANSFER', [row['category'] for row in summary['categories']])

    def test_respects_category_override(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 5), 't1', category_override='DINING')
        summary = spending_summary()
        by_category = {row['category']: row['amount'] for row in summary['categories']}
        self.assertEqual(by_category, {'DINING': Decimal('40')})

    def test_date_range_filters(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 2, 5), 't2')

        summary = spending_summary(date_from='2026-02-01', date_to='2026-02-28')

        self.assertEqual(summary['total'], Decimal('40'))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_spending_service -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'enablebanking.services'`.

- [ ] **Step 3: Implement**

```python
# backend/enablebanking/services.py
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import Coalesce

from .models import BankTransaction

TRANSFER_CATEGORIES = ('TRANSFER', 'SAVINGS')


def spending_summary(date_from=None, date_to=None):
    qs = BankTransaction.objects.filter(amount__lt=0)
    if date_from:
        qs = qs.filter(booking_date__gte=date_from)
    if date_to:
        qs = qs.filter(booking_date__lte=date_to)

    rows = (
        qs.annotate(effective_category=Coalesce('category_override', 'category'))
        .values('effective_category')
        .annotate(total=Sum('amount'))
        .order_by('effective_category')
    )

    by_category = {row['effective_category']: -row['total'] for row in rows}
    transfers_total = sum(
        (by_category.pop(cat, Decimal('0')) for cat in TRANSFER_CATEGORIES), Decimal('0'),
    )

    return {
        'categories': [{'category': k, 'amount': v} for k, v in by_category.items()],
        'total': sum(by_category.values(), Decimal('0')),
        'transfers': transfers_total,
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_spending_service -v 2`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/services.py backend/enablebanking/test_spending_service.py
git commit -m "feat: add spending-by-category aggregation service"
```

---

### Task 10: Read/write views — transactions, spending summary, subscriptions

**Files:**
- Create: `backend/enablebanking/filters.py`
- Create: `backend/enablebanking/serializers.py`
- Modify: `backend/enablebanking/views.py`
- Modify: `backend/enablebanking/urls.py`
- Test: `backend/enablebanking/test_transaction_views.py` (new)

**Interfaces:**
- Consumes: `BankTransaction`, `Subscription` (Task 1), `spending_summary` (Task 9).
- Produces: `GET /api/enablebanking/transactions/` (filterable by `category`, `date_from`, `date_to`, `account`), `PATCH /api/enablebanking/transactions/<id>/category/` (body `{"category_override": "<code>"|null}`), `GET /api/enablebanking/spending/summary/` (query params `date_from`/`date_to`), `GET /api/enablebanking/subscriptions/` (query param `include_dismissed`), `PATCH /api/enablebanking/subscriptions/<id>/` (body `{"dismissed": bool}`).

- [ ] **Step 1: Write the failing tests**

```python
# backend/enablebanking/test_transaction_views.py
from datetime import date

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import BankAccount

from .models import BankTransaction, Subscription


def _auth_client(test_case, username):
    user = User.objects.create_user(username=username, password='p')
    token = RefreshToken.for_user(user).access_token
    test_case.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')


class BankTransactionListViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u1')
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='t1', amount=-40,
            currency='EUR', booking_date=date(2026, 1, 5), category='GROCERIES',
        )
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='t2', amount=-15,
            currency='EUR', booking_date=date(2026, 1, 10), category='DINING',
        )

    def test_lists_all_transactions(self):
        response = self.client.get('/api/enablebanking/transactions/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['results']), 2)

    def test_filters_by_category(self):
        response = self.client.get('/api/enablebanking/transactions/?category=DINING')
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['category'], 'DINING')

    def test_filters_by_account(self):
        response = self.client.get(f'/api/enablebanking/transactions/?account={self.account.id}')
        self.assertEqual(len(response.data['results']), 2)


class BankTransactionCategoryViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u2')
        account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        self.tx = BankTransaction.objects.create(
            bank='kbc', bank_account=account, external_id='t1', amount=-40,
            currency='EUR', booking_date=date(2026, 1, 5), category='GROCERIES',
        )

    def test_sets_category_override(self):
        response = self.client.patch(
            f'/api/enablebanking/transactions/{self.tx.id}/category/',
            {'category_override': 'DINING'}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.tx.refresh_from_db()
        self.assertEqual(self.tx.category_override, 'DINING')

    def test_clears_category_override(self):
        self.tx.category_override = 'DINING'
        self.tx.save()
        response = self.client.patch(
            f'/api/enablebanking/transactions/{self.tx.id}/category/',
            {'category_override': None}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.tx.refresh_from_db()
        self.assertIsNone(self.tx.category_override)

    def test_rejects_an_unknown_category(self):
        response = self.client.patch(
            f'/api/enablebanking/transactions/{self.tx.id}/category/',
            {'category_override': 'NOT_REAL'}, format='json',
        )
        self.assertEqual(response.status_code, 400)


class SpendingSummaryViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u3')
        account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        BankTransaction.objects.create(
            bank='kbc', bank_account=account, external_id='t1', amount=-40,
            currency='EUR', booking_date=date(2026, 1, 5), category='GROCERIES',
        )

    def test_returns_the_summary_shape(self):
        response = self.client.get('/api/enablebanking/spending/summary/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total'], '40.00')


class SubscriptionViewsTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u4')
        self.sub = Subscription.objects.create(
            merchant_key='NETFLIX.COM', display_name='NETFLIX.COM', category='SUBSCRIPTIONS',
            expected_amount=12.99, cadence='monthly', last_charged=date(2026, 3, 4),
        )

    def test_lists_non_dismissed_by_default(self):
        response = self.client.get('/api/enablebanking/subscriptions/')
        self.assertEqual(len(response.data), 1)

    def test_dismissing_hides_it_from_the_default_list(self):
        response = self.client.patch(
            f'/api/enablebanking/subscriptions/{self.sub.id}/', {'dismissed': True}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        response = self.client.get('/api/enablebanking/subscriptions/')
        self.assertEqual(len(response.data), 0)

    def test_include_dismissed_shows_it_again(self):
        self.sub.dismissed = True
        self.sub.save()
        response = self.client.get('/api/enablebanking/subscriptions/?include_dismissed=true')
        self.assertEqual(len(response.data), 1)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_transaction_views -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'enablebanking.filters'` / 404s for the new URLs.

- [ ] **Step 3: Implement**

```python
# backend/enablebanking/filters.py
import django_filters

from .models import BankTransaction


class BankTransactionFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name='booking_date', lookup_expr='gte')
    date_to = django_filters.DateFilter(field_name='booking_date', lookup_expr='lte')
    account = django_filters.NumberFilter(field_name='bank_account_id')

    class Meta:
        model = BankTransaction
        fields = ['category', 'date_from', 'date_to', 'account']
```

```python
# backend/enablebanking/serializers.py
from rest_framework import serializers

from .models import BankTransaction, Subscription


class BankTransactionSerializer(serializers.ModelSerializer):
    effective_category = serializers.ReadOnlyField()

    class Meta:
        model = BankTransaction
        fields = [
            'id', 'bank', 'bank_account', 'booking_date', 'counterparty_name',
            'description', 'amount', 'currency', 'category', 'category_override',
            'effective_category',
        ]


class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = [
            'id', 'merchant_key', 'display_name', 'category',
            'expected_amount', 'cadence', 'last_charged', 'dismissed',
        ]
```

Append to `backend/enablebanking/views.py`:

```python
from django.shortcuts import get_object_or_404
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.generics import ListAPIView

from .filters import BankTransactionFilter
from .models import CATEGORY_CHOICES, BankTransaction, Subscription
from .serializers import BankTransactionSerializer, SubscriptionSerializer
from .services import spending_summary


class BankTransactionListView(ListAPIView):
    queryset = BankTransaction.objects.select_related('bank_account').all()
    serializer_class = BankTransactionSerializer
    filterset_class = BankTransactionFilter
    filter_backends = [DjangoFilterBackend]


class BankTransactionCategoryView(APIView):

    def patch(self, request, pk):
        tx = get_object_or_404(BankTransaction, pk=pk)
        category = request.data.get('category_override')
        if category is not None and category not in dict(CATEGORY_CHOICES):
            return Response({'detail': 'Unknown category'}, status=400)
        tx.category_override = category
        tx.save(update_fields=['category_override'])
        return Response(BankTransactionSerializer(tx).data)


class SpendingSummaryView(APIView):

    def get(self, request):
        return Response(spending_summary(
            date_from=request.query_params.get('date_from'),
            date_to=request.query_params.get('date_to'),
        ))


class SubscriptionListView(ListAPIView):
    serializer_class = SubscriptionSerializer
    pagination_class = None

    def get_queryset(self):
        qs = Subscription.objects.all()
        if self.request.query_params.get('include_dismissed') != 'true':
            qs = qs.exclude(dismissed=True)
        return qs


class SubscriptionDetailView(APIView):

    def patch(self, request, pk):
        sub = get_object_or_404(Subscription, pk=pk)
        if 'dismissed' in request.data:
            sub.dismissed = bool(request.data['dismissed'])
            sub.save(update_fields=['dismissed'])
        return Response(SubscriptionSerializer(sub).data)
```

In `backend/enablebanking/urls.py`, add to `urlpatterns`:

```python
    path('transactions/', BankTransactionListView.as_view(), name='enablebanking-transactions'),
    path('transactions/<int:pk>/category/', BankTransactionCategoryView.as_view(), name='enablebanking-transaction-category'),
    path('spending/summary/', SpendingSummaryView.as_view(), name='enablebanking-spending-summary'),
    path('subscriptions/', SubscriptionListView.as_view(), name='enablebanking-subscriptions'),
    path('subscriptions/<int:pk>/', SubscriptionDetailView.as_view(), name='enablebanking-subscription-detail'),
```

and add the five new view classes (`BankTransactionListView`, `BankTransactionCategoryView`, `SpendingSummaryView`, `SubscriptionListView`, `SubscriptionDetailView`) to the `from .views import (...)` block at the top of the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/filters.py backend/enablebanking/serializers.py backend/enablebanking/views.py backend/enablebanking/urls.py backend/enablebanking/test_transaction_views.py
git commit -m "feat: add bank transaction, spending summary, and subscription views"
```

---

### Task 11: Savings-account IBAN on reconnect (Plan A)

**Files:**
- Modify: `backend/enablebanking/views.py`
- Modify: `backend/enablebanking/tests.py`

**Interfaces:**
- Modifies: `EnableBankingConnectView.get` — now reads an optional `iban` query param and threads it to `client.build_authorize_url`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/enablebanking/tests.py, inside EnableBankingConnectViewTest
    @patch('enablebanking.views.client.build_authorize_url')
    def test_passes_an_optional_iban_through_to_the_client(self, mock_build_url):
        mock_build_url.return_value = 'https://auth.enablebanking.com/ais/start?x=1'
        ticket = self._ticket()
        self.client.get(f'/api/enablebanking/connect/kbc/?ticket={ticket}&iban=BE0012345678')

        self.assertEqual(mock_build_url.call_args.kwargs.get('iban'), 'BE0012345678')

    @patch('enablebanking.views.client.build_authorize_url')
    def test_iban_is_optional(self, mock_build_url):
        mock_build_url.return_value = 'https://auth.enablebanking.com/ais/start?x=1'
        ticket = self._ticket()
        self.client.get(f'/api/enablebanking/connect/kbc/?ticket={ticket}')

        self.assertIsNone(mock_build_url.call_args.kwargs.get('iban'))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.EnableBankingConnectViewTest -v 2`
Expected: FAIL — `build_authorize_url` is currently called with only `(bank, state, settings.ENABLE_BANKING_REDIRECT_URI)`, so `kwargs.get('iban')` is never set (both new assertions fail: the first because `iban` is never passed at all, not just `None`).

- [ ] **Step 3: Implement**

In `backend/enablebanking/views.py`, in `EnableBankingConnectView.get`, replace:

```python
        response = redirect(client.build_authorize_url(bank, state, settings.ENABLE_BANKING_REDIRECT_URI))
```

with:

```python
        iban = request.query_params.get('iban') or None
        response = redirect(
            client.build_authorize_url(bank, state, settings.ENABLE_BANKING_REDIRECT_URI, iban=iban)
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/views.py backend/enablebanking/tests.py
git commit -m "feat: accept an optional IBAN on reconnect to request a specific account"
```

---

### Task 12: Frontend API client and query hooks

**Files:**
- Modify: `frontend/src/api/client.js`
- Modify: `frontend/src/api/queries.js`

**Interfaces:**
- Produces: `getBankTransactions(query)`, `updateBankTransactionCategory(id, categoryOverride)`, `getSpendingSummary(query)`, `getSubscriptions()`, `updateSubscription(id, patch)` in `client.js`; `connectEnableBanking(bank, iban)` (modified signature); `useBankTransactions(query)`, `useSpendingSummary(query)`, `useSubscriptions()`, `useUpdateBankTransactionCategory()`, `useDismissSubscription()` in `queries.js`.

- [ ] **Step 1: Add the API client functions**

In `frontend/src/api/client.js`, replace:

```js
export async function connectEnableBanking(bank) {
  const { ticket } = await jsonRequest('/api/enablebanking/connect-ticket/', 'POST')
  window.location.href = `${ENABLE_BANKING_CONNECT_BASE_URL}/api/enablebanking/connect/${bank}/?ticket=${encodeURIComponent(ticket)}`
}
```

with:

```js
export async function connectEnableBanking(bank, iban) {
  const { ticket } = await jsonRequest('/api/enablebanking/connect-ticket/', 'POST')
  const ibanParam = iban ? `&iban=${encodeURIComponent(iban)}` : ''
  window.location.href = `${ENABLE_BANKING_CONNECT_BASE_URL}/api/enablebanking/connect/${bank}/?ticket=${encodeURIComponent(ticket)}${ibanParam}`
}

export const getBankTransactions = (query = '') => apiFetch(`/api/enablebanking/transactions/${query}`)

export const updateBankTransactionCategory = (id, categoryOverride) =>
  jsonRequest(`/api/enablebanking/transactions/${id}/category/`, 'PATCH', { category_override: categoryOverride })

export const getSpendingSummary = (query = '') => apiFetch(`/api/enablebanking/spending/summary/${query}`)

export const getSubscriptions = () => apiFetch('/api/enablebanking/subscriptions/')

export const updateSubscription = (id, patch) =>
  jsonRequest(`/api/enablebanking/subscriptions/${id}/`, 'PATCH', patch)
```

- [ ] **Step 2: Add the query hooks**

In `frontend/src/api/queries.js`, add the new client functions to the existing `from './client'` import block, add query keys next to `enableBankingStatus`:

```js
  bankTransactions: (query = '') => ['bank-transactions', query],
  spendingSummary: (query = '') => ['spending-summary', query],
  subscriptions: ['subscriptions'],
```

and add, after `useBankAccounts`:

```js
export function useBankTransactions(query = '') {
  return useQuery({
    queryKey: queryKeys.bankTransactions(query),
    queryFn: () => getBankTransactions(query),
    select: unwrap,
  })
}

export function useSpendingSummary(query = '') {
  return useQuery({
    queryKey: queryKeys.spendingSummary(query),
    queryFn: () => getSpendingSummary(query),
  })
}

export function useSubscriptions() {
  return useQuery({ queryKey: queryKeys.subscriptions, queryFn: getSubscriptions })
}

export function useUpdateBankTransactionCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, category }) => updateBankTransactionCategory(id, category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['spending-summary'] })
    },
  })
}

export function useDismissSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dismissed }) => updateSubscription(id, { dismissed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions }),
  })
}
```

- [ ] **Step 3: Run lint to catch unused-import or ordering issues**

Run: `cd frontend && npm run lint`
Expected: PASS, no errors (the import block in `queries.js` is alphabetically ordered — matching the existing convention — add the new names in their alphabetical slots).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/queries.js
git commit -m "feat: add frontend API client and query hooks for bank transactions/spending"
```

---

### Task 13: `Spending.jsx` page

**Files:**
- Create: `frontend/src/components/SpendingCategoryChart.jsx`
- Create: `frontend/src/components/SubscriptionsList.jsx`
- Create: `frontend/src/pages/Spending.jsx`
- Create: `frontend/src/pages/Spending.test.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `useSpendingSummary`, `useSubscriptions`, `useDismissSubscription` (Task 12).
- Produces: `<Spending />` page at route `/spending`, `<SpendingCategoryChart data={categories} />`, `<SubscriptionsList subscriptions={...} onDismiss={...} />`.

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/pages/Spending.test.jsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import Spending from './Spending'

vi.mock('../api/queries')
import * as queries from '../api/queries'

describe('Spending', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the spending total', () => {
    queries.useSpendingSummary.mockReturnValue({
      data: {
        categories: [{ category: 'GROCERIES', amount: '50.00' }],
        total: '50.00',
        transfers: '0.00',
      },
      isLoading: false,
      error: null,
    })
    queries.useSubscriptions.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useDismissSubscription.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<Spending />)

    // Asserting on the StatRow total, not chart-internal SVG content -
    // Recharts axis/bar labels aren't reliably queryable under jsdom, which
    // is why this codebase's existing chart tests (e.g.
    // CashFlowTrendChart.test.jsx) only assert on plain-DOM text like card
    // titles, never on data rendered inside the chart itself.
    expect(screen.getByText('€50.00')).toBeInTheDocument()
  })

  it('shows a visible Transfers line separate from the spending total', () => {
    queries.useSpendingSummary.mockReturnValue({
      data: {
        categories: [{ category: 'GROCERIES', amount: '50.00' }],
        total: '50.00',
        transfers: '500.00',
      },
      isLoading: false,
      error: null,
    })
    queries.useSubscriptions.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useDismissSubscription.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<Spending />)

    expect(screen.getByText(/Transfers/)).toBeInTheDocument()
  })

  it('lets you dismiss a subscription', async () => {
    const mutate = vi.fn()
    queries.useSpendingSummary.mockReturnValue({
      data: { categories: [], total: '0.00', transfers: '0.00' }, isLoading: false, error: null,
    })
    queries.useSubscriptions.mockReturnValue({
      data: [{ id: 1, display_name: 'NETFLIX.COM', expected_amount: '12.99', cadence: 'monthly', dismissed: false }],
      isLoading: false, error: null,
    })
    queries.useDismissSubscription.mockReturnValue({ mutate })

    const { getByText } = renderWithProviders(<Spending />)
    getByText('Dismiss').click()

    expect(mutate).toHaveBeenCalledWith({ id: 1, dismissed: true })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/Spending.test.jsx`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement the category chart**

```jsx
// frontend/src/components/SpendingCategoryChart.jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtEur } from '../lib/format'
import { axisProps, chartTooltipProps, gridProps, moneyAxisProps } from '../lib/charts'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'

const CATEGORY_LABELS = {
  GROCERIES: 'Groceries', DINING: 'Dining', TRANSPORT: 'Transport', UTILITIES: 'Utilities',
  SUBSCRIPTIONS: 'Subscriptions', SHOPPING: 'Shopping', HEALTH: 'Health', TRAVEL: 'Travel',
  ENTERTAINMENT: 'Entertainment', INCOME: 'Income', REFUND_CREDIT: 'Refund/Credit', OTHER: 'Other',
}

export default function SpendingCategoryChart({ categories, isLoading, error }) {
  const data = (categories ?? []).map((c) => ({
    category: CATEGORY_LABELS[c.category] ?? c.category,
    amount: Number(c.amount),
  }))
  const placeholder = chartPlaceholderFor({ isLoading, error, data, minPoints: 1, height: 260 })

  return (
    <Card>
      <CardHeader title="Spending by category" subtitle="This period" />
      <div className="mt-4 h-[var(--chart-h-md)]">
        {placeholder ?? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid {...gridProps} />
              <XAxis {...moneyAxisProps} type="number" />
              <YAxis {...axisProps} dataKey="category" type="category" width={100} />
              <Tooltip {...chartTooltipProps} formatter={(v) => fmtEur(v)} />
              <Bar dataKey="amount" fill="#3b82f6" radius={[0, 3, 3, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
```

- [ ] **Step 4: Implement the subscriptions list**

```jsx
// frontend/src/components/SubscriptionsList.jsx
import { Card, CardHeader } from './ui'
import { fmtEur } from '../lib/format'

export default function SubscriptionsList({ subscriptions, onDismiss }) {
  return (
    <Card>
      <CardHeader title="Subscriptions" subtitle="Detected recurring payments" />
      <div className="mt-4 space-y-2">
        {(subscriptions ?? []).length === 0 && (
          <div className="text-zinc-500 text-[var(--fig-sm)]">No subscriptions detected yet.</div>
        )}
        {(subscriptions ?? []).map((sub) => (
          <div key={sub.id} className="flex items-center justify-between py-2 border-b border-zinc-800/60 last:border-0">
            <div>
              <div className="text-zinc-100 text-[var(--fig-sm)] font-medium">{sub.display_name}</div>
              <div className="text-zinc-500 text-[var(--fig-xs)]">{sub.cadence}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-zinc-100 num font-mono">{fmtEur(sub.expected_amount)}</div>
              <button
                onClick={() => onDismiss(sub.id)}
                className="text-[var(--fig-xs)] text-zinc-500 hover:text-red-400"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
```

- [ ] **Step 5: Implement the page**

```jsx
// frontend/src/pages/Spending.jsx
import { useSpendingSummary, useSubscriptions, useDismissSubscription } from '../api/queries'
import { fmtEur } from '../lib/format'
import { PageHeader, StatStrip, StatRow } from '../components/ui'
import SpendingCategoryChart from '../components/SpendingCategoryChart'
import SubscriptionsList from '../components/SubscriptionsList'

export default function Spending() {
  const { data: summary, isLoading, error } = useSpendingSummary()
  const { data: subscriptions } = useSubscriptions()
  const dismissSubscription = useDismissSubscription()

  return (
    <div className="space-y-4">
      <PageHeader title="Spending" subtitle="Categorized bank transactions" />

      <StatStrip>
        <StatRow label="Total spending" value={fmtEur(summary?.total ?? 0)} lead />
        <StatRow
          label="Transfers (not counted above)"
          value={fmtEur(summary?.transfers ?? 0)}
          note="Moved between your own accounts"
        />
      </StatStrip>

      <SpendingCategoryChart categories={summary?.categories} isLoading={isLoading} error={error} />

      <SubscriptionsList
        subscriptions={subscriptions}
        onDismiss={(id) => dismissSubscription.mutate({ id, dismissed: true })}
      />
    </div>
  )
}
```

- [ ] **Step 6: Wire up the route and nav entry**

In `frontend/src/components/Sidebar.jsx`, add `PiggyBank` to the `lucide-react` import and add to `items` (after `accounts`):

```js
  { to: '/spending', label: 'Spending', icon: PiggyBank },
```

In `frontend/src/App.jsx`, add:

```jsx
import Spending from './pages/Spending'
```

```jsx
          <Route path='spending' element={<Spending />} />
```

- [ ] **Step 7: Run the frontend suite, lint, and build**

Run:
```bash
cd frontend
npm test
npm run lint
npm run build
```
Expected: all pass, no new failures.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/SpendingCategoryChart.jsx frontend/src/components/SubscriptionsList.jsx frontend/src/pages/Spending.jsx frontend/src/pages/Spending.test.jsx frontend/src/components/Sidebar.jsx frontend/src/App.jsx
git commit -m "feat: add Spending page with category chart, transfers line, subscriptions list"
```

---

### Task 14: Accounts drill-down

**Files:**
- Create: `frontend/src/pages/AccountTransactions.jsx`
- Create: `frontend/src/pages/AccountTransactions.test.jsx`
- Modify: `frontend/src/pages/Accounts.jsx`
- Create: `frontend/src/pages/Accounts.test.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `useBankTransactions`, `useUpdateBankTransactionCategory` (Task 12).
- Produces: `<AccountTransactions />` page at route `/accounts/:accountId`, with an editable category dropdown per row (the manual-override requirement from the design spec — this is the one place in the UI it's wired up), each Accounts-page card becomes a `<Link>` to that route.

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/pages/Accounts.test.jsx
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import Accounts from './Accounts'

vi.mock('../api/queries')
import * as queries from '../api/queries'

describe('Accounts', () => {
  it('links each account card to its drill-down page', () => {
    queries.useBankAccounts.mockReturnValue({
      data: [{ id: 5, external_id: 'enablebanking:kbc:acc-1', bank: 'KBC', type: 'Current account', iban_masked: 'BE12 •••• •••• 0001', balance: '100.00', available: '100.00' }],
      isLoading: false, error: null,
    })

    renderWithProviders(<Accounts />)

    const link = screen.getByRole('link', { name: /KBC/ })
    expect(link).toHaveAttribute('href', '/accounts/5')
  })
})
```

```jsx
// frontend/src/pages/AccountTransactions.test.jsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AccountTransactions from './AccountTransactions'

vi.mock('../api/queries')
import * as queries from '../api/queries'

function renderAt(id) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/accounts/${id}`]}>
      <Routes>
        <Route path="/accounts/:accountId" element={<AccountTransactions />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AccountTransactions', () => {
  beforeEach(() => {
    queries.useUpdateBankTransactionCategory.mockReturnValue({ mutate: vi.fn() })
  })

  it('renders the transactions for the account in the URL', () => {
    queries.useBankTransactions.mockReturnValue({
      data: [{ id: 1, booking_date: '2026-01-05', counterparty_name: 'COLRUYT', amount: '-40.00', currency: 'EUR', effective_category: 'GROCERIES' }],
      isLoading: false, error: null,
    })

    renderAt(5)

    expect(queries.useBankTransactions).toHaveBeenCalledWith('?account=5')
    expect(screen.getByText('COLRUYT')).toBeInTheDocument()
  })

  it('lets you correct a transaction\'s category', async () => {
    const mutate = vi.fn()
    queries.useBankTransactions.mockReturnValue({
      data: [{ id: 1, booking_date: '2026-01-05', counterparty_name: 'COLRUYT', amount: '-40.00', currency: 'EUR', effective_category: 'GROCERIES' }],
      isLoading: false, error: null,
    })
    queries.useUpdateBankTransactionCategory.mockReturnValue({ mutate })

    renderAt(5)
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'DINING' } })

    expect(mutate).toHaveBeenCalledWith({ id: 1, category: 'DINING' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/Accounts.test.jsx src/pages/AccountTransactions.test.jsx`
Expected: FAIL — `AccountTransactions` module doesn't exist; `Accounts.jsx` cards aren't links yet.

- [ ] **Step 3: Implement the drill-down page**

```jsx
// frontend/src/pages/AccountTransactions.jsx
import { useParams, Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { useBankTransactions, useUpdateBankTransactionCategory } from '../api/queries'
import { fmtEur } from '../lib/format'
import { Card, PageHeader, Th, Td } from '../components/ui'

const CATEGORY_LABELS = {
  GROCERIES: 'Groceries', DINING: 'Dining', TRANSPORT: 'Transport', UTILITIES: 'Utilities',
  SUBSCRIPTIONS: 'Subscriptions', SHOPPING: 'Shopping', HEALTH: 'Health', TRAVEL: 'Travel',
  ENTERTAINMENT: 'Entertainment', INCOME: 'Income', TRANSFER: 'Transfer', SAVINGS: 'Savings',
  REFUND_CREDIT: 'Refund/Credit', OTHER: 'Other',
}

function CategoryCell({ tx, onChange }) {
  return (
    <select
      value={tx.effective_category}
      onChange={(e) => onChange({ id: tx.id, category: e.target.value })}
      className="bg-transparent text-zinc-400 hover:text-zinc-200 text-[var(--fig-sm)] outline-none cursor-pointer"
    >
      {Object.entries(CATEGORY_LABELS).map(([code, label]) => (
        <option key={code} value={code} className="bg-zinc-900">{label}</option>
      ))}
    </select>
  )
}

export default function AccountTransactions() {
  const { accountId } = useParams()
  const { data, isLoading, error } = useBankTransactions(`?account=${accountId}`)
  const updateCategory = useUpdateBankTransactionCategory()

  if (error) return <div className="text-red-400 text-sm">Failed to load transactions</div>
  if (isLoading || !data) return <div className="text-zinc-500 text-sm">Loading…</div>

  return (
    <div className="space-y-4">
      <PageHeader
        title="Account transactions"
        subtitle={
          <Link to="/accounts" className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200">
            <ChevronLeft size={14} /> Back to Accounts
          </Link>
        }
      />
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-[var(--fig-sm)]">
            <thead>
              <tr className="text-left text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide border-b border-zinc-800">
                <Th edge>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th align="right" edge>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((tx) => (
                <tr key={tx.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                  <Td edge className="num text-zinc-300">{tx.booking_date}</Td>
                  <Td className="text-zinc-100">{tx.counterparty_name}</Td>
                  <Td><CategoryCell tx={tx} onChange={updateCategory.mutate} /></Td>
                  <Td align="right" edge className="num text-zinc-100 font-medium">{fmtEur(tx.amount)}</Td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-zinc-500 py-8">No transactions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
```

`useUpdateBankTransactionCategory().mutate` takes `{ id, category }` and PATCHes `category_override` (see Task 12) — the dropdown always shows `effective_category` (override if set, else the rule-assigned one) and changing it always writes an override, never the base `category` field directly.

- [ ] **Step 4: Make each account card a link**

In `frontend/src/pages/Accounts.jsx`, add the import:

```jsx
import { Link } from 'react-router-dom'
```

Replace:

```jsx
          {accounts.map((a) => (
            <Card key={a.id} className="relative overflow-hidden">
```

with:

```jsx
          {accounts.map((a) => (
            <Link key={a.id} to={`/accounts/${a.id}`} className="block">
            <Card className="relative overflow-hidden">
```

and its matching closing tag — replace the closing `</Card>` for that card (immediately before the closing `))}`) with `</Card>\n            </Link>`.

- [ ] **Step 5: Wire up the route**

In `frontend/src/App.jsx`, add:

```jsx
import AccountTransactions from './pages/AccountTransactions'
```

```jsx
          <Route path='accounts/:accountId' element={<AccountTransactions />} />
```

(placed after the existing `path='accounts'` route.)

- [ ] **Step 6: Run the frontend suite, lint, and build**

Run:
```bash
cd frontend
npm test
npm run lint
npm run build
```
Expected: all pass, no new failures.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/AccountTransactions.jsx frontend/src/pages/AccountTransactions.test.jsx frontend/src/pages/Accounts.jsx frontend/src/pages/Accounts.test.jsx frontend/src/App.jsx
git commit -m "feat: add per-account transaction drill-down from the Accounts page"
```

---

### Task 15: Dashboard spending tile

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Modify: `frontend/src/pages/Dashboard.test.jsx`

**Interfaces:**
- Consumes: `useSpendingSummary` (Task 12).

- [ ] **Step 1: Write the failing test**

`frontend/src/pages/Dashboard.test.jsx` stubs every query hook through one shared `stub(over = {})` function. Add the new hook there, in `frontend/src/pages/Dashboard.test.jsx`:

```js
function stub(over = {}) {
  queries.usePortfolioInsights.mockReturnValue({ ...idle, data: over.insights ?? insights })
  queries.usePositions.mockReturnValue({ ...idle, data: positions })
  queries.usePositionQuotes.mockReturnValue(new Map())
  queries.usePortfolioSummary.mockReturnValue({
    ...idle,
    data: { total_value: '13131.00', allocation: [{ ticker: 'NVDA', value: '13131.00', color: '#76b900' }] },
  })
  queries.useTransactions.mockReturnValue({ ...idle, data: [] })
  queries.useNetWorthHistory.mockReturnValue({ ...idle, data: [] })
  queries.useSpendingSummary.mockReturnValue({
    ...idle,
    data: over.spending ?? { categories: [{ category: 'GROCERIES', amount: '50.00' }], total: '50.00', transfers: '0.00' },
  })
}
```

Add a new test case in the `describe('Dashboard', ...)` block, after `'shows movers with a linked ticker'`:

```js
  it("shows this month's spending total and top category", () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByText('€50.00')).toBeInTheDocument()
    expect(screen.getByText(/Top category: GROCERIES/)).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/pages/Dashboard.test.jsx`
Expected: FAIL — `Dashboard.jsx` never calls `useSpendingSummary`, so neither piece of text renders.

- [ ] **Step 3: Implement**

In `frontend/src/pages/Dashboard.jsx`, add `useSpendingSummary` to the existing import from `'../api/queries'`:

```js
import {
  usePortfolioInsights,
  usePortfolioSummary,
  usePositionQuotes,
  usePositions,
  useSpendingSummary,
  useTransactions,
} from '../api/queries'
```

Add the hook call next to the other query hooks at the top of the component (right after `recentTxQuery`):

```js
  const recentTxQuery = useTransactions('?page_size=5')
  const spendingQuery = useSpendingSummary()
```

Add `spendingQuery.error` to the existing `failed` check:

```js
  const failed =
    insightsQuery.error || positionsQuery.error || summaryQuery.error || recentTxQuery.error || spendingQuery.error
```

After the `const insights = insightsQuery.data` block, compute the top category:

```js
  const spending = spendingQuery.data
  const topCategory = (spending?.categories ?? [])
    .slice().sort((a, b) => Number(b.amount) - Number(a.amount))[0]
```

Insert a new tile right after `<AttentionBand items={insights.attention} />` and before the "Top positions / Allocation" grid:

```jsx
      <AttentionBand items={insights.attention} />

      <Card>
        <CardHeader title="This month's spending" subtitle="From bank transactions" />
        <div className="mt-2 text-[var(--fig-xl)] font-semibold text-zinc-50 num font-mono">
          {fmtEur(spending?.total ?? 0)}
        </div>
        {topCategory && (
          <div className="mt-1 text-[var(--fig-xs)] text-zinc-500">
            Top category: {topCategory.category} ({fmtEur(topCategory.amount)})
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
```

(the last line above is the existing line that opens the "Top positions / Allocation" grid — it's shown only so the insertion point is unambiguous, it doesn't move.)

`Card`, `CardHeader`, and `fmtEur` are already imported in this file.

- [ ] **Step 4: Run the frontend suite, lint, and build**

Run:
```bash
cd frontend
npm test
npm run lint
npm run build
```
Expected: all pass, no new failures.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx frontend/src/pages/Dashboard.test.jsx
git commit -m "feat: add this month's spending tile to the Dashboard"
```

---

### Task 16: Manual verification gate (user-side prerequisite, then live check)

**This task cannot be done by Claude — it requires reconnecting real bank accounts.**

- [ ] **Step 1: Reconnect both KBC and Argenta**

Through the Accounts page's existing "Reconnect" flow (now requesting `balances: true, transactions: true` per Task 4). Confirm `EnableBankingStatusView` shows both banks `connected` and `usable` afterward.

- [ ] **Step 2: Live-verify the savings-account IBAN request (Plan A)**

If a savings-account IBAN is known, pass it via the new `iban` param on one bank's reconnect (e.g. by temporarily wiring a manual query-string test, or a quick one-off frontend input if Task 13/14 didn't already expose one — this plan doesn't add a dedicated IBAN-entry UI, so use `connectEnableBanking(bank, iban)` directly from the browser console during this manual step). Observe whether that bank's consent screen offers the account. Record the real outcome here:

- KBC: _(fill in after testing)_
- Argenta: _(fill in after testing)_

If neither bank honors it, fall back to Plan B: create a `ManualIbanLabel` row for the known savings IBAN via Django admin, with `category='SAVINGS'`.

- [ ] **Step 3: Run a real transaction sync**

```bash
cd backend
.venv/bin/python manage.py shell -c "
from enablebanking.tasks import sync_enablebanking_transactions
print(sync_enablebanking_transactions())
"
```

Confirm real `BankTransaction` rows exist (`BankTransaction.objects.count()`), spot-check a handful of `category` assignments against real merchant names, and confirm the second run (re-running the same command) does **not** create duplicates and picks up only new transactions (`date_from` incremental path).

- [ ] **Step 4: Run subscription detection**

```bash
.venv/bin/python manage.py shell -c "
from enablebanking.tasks import detect_enablebanking_subscriptions
print(detect_enablebanking_subscriptions())
"
```

Confirm any real recurring payments (if present) show up as `Subscription` rows with a sensible `cadence`/`expected_amount`.

- [ ] **Step 5: Confirm the Spending page, Accounts drill-down, and Dashboard tile with real data**

Load `/spending`, `/accounts` (click through to a drill-down), and `/` in the browser. Confirm the category chart, transfers line, subscriptions list (with working Dismiss), account drill-down list, and Dashboard tile all render real synced data correctly.

- [ ] **Step 6: Register both periodic tasks**

Via Django admin (`Periodic tasks` under `django_celery_beat`), same as the existing `sync_enablebanking_balances` registration:

- `"Sync Enable Banking transactions"` → `enablebanking.tasks.sync_enablebanking_transactions`, `IntervalSchedule` every 3 hours (same cadence as balance sync), enabled.
- `"Detect Enable Banking subscriptions"` → `enablebanking.tasks.detect_enablebanking_subscriptions`, `IntervalSchedule` every 1 day, enabled.

- [ ] **Step 7: Run the full backend and frontend suites one more time**

```bash
cd backend && .venv/bin/python manage.py test
cd frontend && npm test && npm run lint && npm run build
```
Expected: all green, no regressions from the manual-verification steps above.

- [ ] **Step 8: Commit any corrections made during this task**

If the live-verified savings-IBAN outcome (Step 2) or anything else needed a code correction, commit it separately with a message describing the real behavior found — same convention as every other live-verified fact in this project (e.g. `2ff9384`, `ae89976` in the Enable Banking plan).

```bash
git add -A
git commit -m "docs: record Task 16 live-verification outcome for bank transactions"
```

---

### Task 17: Spending-over-time chart (post-review addition)

**Added after the final whole-branch review found this was promised by the design spec but silently dropped during Task 13's plan-authoring — no ruling exists for the drop, and the user chose to build it rather than formally cut it.**

**Files:**
- Modify: `backend/enablebanking/services.py`
- Modify: `backend/enablebanking/views.py`
- Modify: `backend/enablebanking/urls.py`
- Modify: `backend/enablebanking/test_spending_service.py`
- Modify: `backend/enablebanking/test_transaction_views.py`
- Create: `frontend/src/components/SpendingTrendChart.jsx`
- Modify: `frontend/src/pages/Spending.jsx`
- Modify: `frontend/src/pages/Spending.test.jsx`
- Modify: `frontend/src/api/client.js`
- Modify: `frontend/src/api/queries.js`

**Interfaces:**
- Consumes: `BankTransaction`, `CATEGORY_CHOICES` (Task 1), `TRANSFER_CATEGORIES` (Task 9, `services.py`).
- Produces: `spending_trend(months=6) -> [{"month": "YYYY-MM", "total": Decimal}, ...]` (backend, oldest to newest, outflows only, transfers/savings excluded, respecting `category_override`), `GET /api/enablebanking/spending/trend/?months=N`, `getSpendingTrend(months)` / `useSpendingTrend(months)` (frontend), `<SpendingTrendChart />` (no props, self-fetching).

- [ ] **Step 1: Write the failing backend tests**

```python
# append to backend/enablebanking/test_spending_service.py
class SpendingTrendTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )

    def _tx(self, amount, category, booking_date, external_id):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id=external_id,
            amount=amount, currency='EUR', booking_date=booking_date, category=category,
        )

    def test_groups_by_month(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 1, 5), 't1')
        self._tx(Decimal('-10'), 'DINING', date(2026, 1, 20), 't2')
        self._tx(Decimal('-30'), 'GROCERIES', date(2026, 2, 3), 't3')

        trend = spending_trend(months=6)

        by_month = {row['month']: row['total'] for row in trend}
        self.assertEqual(by_month['2026-01'], Decimal('50'))
        self.assertEqual(by_month['2026-02'], Decimal('30'))

    def test_excludes_transfers(self):
        self._tx(Decimal('-500'), 'TRANSFER', date(2026, 1, 5), 't1')
        trend = spending_trend(months=6)
        self.assertEqual(trend, [])

    def test_respects_category_override_for_exclusion(self):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id='t1', amount=Decimal('-40'),
            currency='EUR', booking_date=date(2026, 1, 5), category='GROCERIES',
            category_override='TRANSFER',
        )
        trend = spending_trend(months=6)
        self.assertEqual(trend, [])

    def test_limits_to_requested_number_of_months(self):
        for i, m in enumerate(range(1, 9)):
            self._tx(Decimal('-10'), 'GROCERIES', date(2026, m, 1), f't{i}')

        trend = spending_trend(months=3)

        self.assertEqual(len(trend), 3)
        self.assertEqual([row['month'] for row in trend], ['2026-06', '2026-07', '2026-08'])
```

Add `from datetime import date` to the top of `test_spending_service.py` if not already present, and `from .services import spending_summary, spending_trend` (extend the existing import line).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_spending_service.SpendingTrendTest -v 2`
Expected: FAIL — `ImportError: cannot import name 'spending_trend'`.

- [ ] **Step 3: Implement the service function**

In `backend/enablebanking/services.py`, change the import line:

```python
from django.db.models.functions import Coalesce
```

to:

```python
from django.db.models.functions import Coalesce, TruncMonth
```

Append:

```python
def spending_trend(months=6):
    qs = (
        BankTransaction.objects
        .filter(amount__lt=0)
        .annotate(effective_category=Coalesce('category_override', 'category'))
        .exclude(effective_category__in=TRANSFER_CATEGORIES)
        .annotate(month=TruncMonth('booking_date'))
        .values('month')
        .annotate(total=Sum('amount'))
        .order_by('month')
    )
    rows = [{'month': row['month'].strftime('%Y-%m'), 'total': -row['total']} for row in qs]
    return rows[-months:]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_spending_service -v 2`
Expected: PASS, all tests (existing `SpendingSummaryTest` class plus the new `SpendingTrendTest` class).

- [ ] **Step 5: Write the failing view test**

```python
# append to backend/enablebanking/test_transaction_views.py
class SpendingTrendViewTest(APITestCase):
    def setUp(self):
        _auth_client(self, 'u5')
        account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        BankTransaction.objects.create(
            bank='kbc', bank_account=account, external_id='t1', amount=-40,
            currency='EUR', booking_date=date(2026, 1, 5), category='GROCERIES',
        )

    def test_returns_monthly_totals(self):
        response = self.client.get('/api/enablebanking/spending/trend/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]['month'], '2026-01')

    def test_respects_months_query_param(self):
        response = self.client.get('/api/enablebanking/spending/trend/?months=1')
        self.assertEqual(len(response.data), 1)
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd backend && .venv/bin/python manage.py test enablebanking.test_transaction_views.SpendingTrendViewTest -v 2`
Expected: FAIL — 404, route doesn't exist yet.

- [ ] **Step 7: Implement the view and route**

Append to `backend/enablebanking/views.py`:

```python
from .services import spending_summary, spending_trend
```

(extend the existing `from .services import spending_summary` line rather than duplicating it — check what's already there.)

```python
class SpendingTrendView(APIView):

    def get(self, request):
        months = int(request.query_params.get('months', 6))
        return Response(spending_trend(months=months))
```

In `backend/enablebanking/urls.py`, add `SpendingTrendView` to the `from .views import (...)` block and add to `urlpatterns`:

```python
    path('spending/trend/', SpendingTrendView.as_view(), name='enablebanking-spending-trend'),
```

- [ ] **Step 8: Run the backend tests to verify they pass**

Run: `cd backend && .venv/bin/python manage.py test enablebanking -v 2`
Expected: PASS, all tests.

- [ ] **Step 9: Commit the backend half**

```bash
git add backend/enablebanking/services.py backend/enablebanking/views.py backend/enablebanking/urls.py backend/enablebanking/test_spending_service.py backend/enablebanking/test_transaction_views.py
git commit -m "feat: add spending-trend aggregation service and endpoint"
```

- [ ] **Step 10: Add the frontend API client and query hook**

In `frontend/src/api/client.js`, append:

```js
export const getSpendingTrend = (months = 6) => apiFetch(`/api/enablebanking/spending/trend/?months=${months}`)
```

In `frontend/src/api/queries.js`, add `getSpendingTrend` to the existing `from './client'` import block (alphabetical slot), add to `queryKeys`:

```js
  spendingTrend: (months = 6) => ['spending-trend', months],
```

and append:

```js
export function useSpendingTrend(months = 6) {
  return useQuery({ queryKey: queryKeys.spendingTrend(months), queryFn: () => getSpendingTrend(months) })
}
```

- [ ] **Step 11: Implement the chart component**

```jsx
// frontend/src/components/SpendingTrendChart.jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useSpendingTrend } from '../api/queries'
import { fmtEur } from '../lib/format'
import { axisProps, chartTooltipProps, gridProps, moneyAxisProps } from '../lib/charts'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'

export default function SpendingTrendChart() {
  const { data, isLoading, error } = useSpendingTrend()

  const placeholder = chartPlaceholderFor({ isLoading, error, data, minPoints: 1, height: 220 })

  return (
    <Card>
      <CardHeader title="Spending over time" subtitle="Monthly total, last 6 months" />
      <div className="mt-4 h-[var(--chart-h-md)]">
        {placeholder ?? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid {...gridProps} />
              <XAxis {...axisProps} dataKey="month" />
              <YAxis {...moneyAxisProps} />
              <Tooltip {...chartTooltipProps} formatter={(v) => fmtEur(v)} />
              <Bar dataKey="total" name="Spending" fill="#f87171" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
```

- [ ] **Step 12: Wire it into the Spending page**

In `frontend/src/pages/Spending.jsx`, add the import:

```jsx
import SpendingTrendChart from '../components/SpendingTrendChart'
```

Insert `<SpendingTrendChart />` between `<SpendingCategoryChart ... />` and `<SubscriptionsList ... />`, matching the design spec's original ordering (category breakdown, then spending-over-time, then subscriptions).

- [ ] **Step 13: Run the existing Spending page test to verify it now fails**

Run: `cd frontend && npx vitest run src/pages/Spending.test.jsx`
Expected: FAIL — `Spending.jsx` now renders `<SpendingTrendChart />`, which calls `useSpendingTrend()`; since `vi.mock('../api/queries')` auto-mocks the whole module, that hook returns `undefined` in every existing test, and destructuring `{ data, isLoading, error }` off `undefined` throws. All three existing tests should break.

- [ ] **Step 14: Add the missing mock to fix the tests**

In `frontend/src/pages/Spending.test.jsx`, add `queries.useSpendingTrend.mockReturnValue({ data: [{ month: '2026-01', total: '50.00' }], isLoading: false, error: null })` to each of the three existing test cases, alongside the other mocks each one already sets up.

- [ ] **Step 15: Run the frontend suite, lint, and build**

Run:
```bash
cd frontend
npm test -- --run
npm run lint
npm run build
```
Expected: all pass, no new failures.

- [ ] **Step 16: Commit the frontend half**

```bash
git add frontend/src/components/SpendingTrendChart.jsx frontend/src/pages/Spending.jsx frontend/src/pages/Spending.test.jsx frontend/src/api/client.js frontend/src/api/queries.js
git commit -m "feat: add spending-over-time chart to the Spending page"
```
