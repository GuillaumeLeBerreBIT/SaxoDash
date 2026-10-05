# Review Phase 1 — Backend Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the backend stop producing wrong or misleading figures found in the 2026-10-04 review: ignored `page_size`, USD transactions treated as EUR, a Spending trend that drops months, mismatched date ranges, a bank chart on the wrong basis, Analytics statistics built on 8 days of history, and unreliable Earnings and news payloads.

**Architecture:** Nine independent areas (one new `StandardPagination`, a `Transaction.currency/fx_rate` migration with backfill, one shared definition of "spending", a `NetWorthSnapshot.bank_only_total`, a single history-requirement table for Analytics, and payload hygiene in `research/earnings.py` and `research/finnhub.py`). Payloads only gain keys or turn unsupported figures into `null`; existing key names stay, so Phase 2 consumes them without a rewrite.

**Tech Stack:** Django 5 + DRF, SQLite (WAL), Celery, `core.money.Money`, `APITestCase`.

**Spec:** `docs/superpowers/plans/2026-10-04-app-review-roadmap.md` (Phase 1 table) and AGENTS.md.

## Global Constraints

- Zero code comments in generated code; rationale goes in commit messages and the PR description.
- Test-first, run the new test and watch it fail before implementing.
- A migration is not done until `python manage.py migrate` has run against the dev `db.sqlite3` (Task 2a Step 8 and Task 6, both gated: run only after the human approves the merge).
- Never guess a currency: unknown is `null`, not EUR. Absent figure is `null`, never `0`.
- Branch `fix/review-backend` cut from `main`. Do not touch `feat/discover-*` branches or the Discover files.
- Backend gate after every task: `cd backend && source .venv/bin/activate && python manage.py test <app>`; full `python manage.py test` before the final task.

## Decisions to confirm before executing

1. **Task 6 — decided: Saxo cash is portfolio money, not banking.** The Accounts page and its chart show real bank accounts only. `get_total_bank_balance()` and the net-worth totals keep including `saxo:cash`, so net worth is unchanged and nothing is double counted; only the Accounts chart switches to the new `NetWorthSnapshot.bank_only_total` (approximate backfill for rows with `saxo_account_value`). Follow-up for Phase 2.3: the Dashboard hero's bank/invested split and the Portfolio page's "Bank balance" row should count Saxo cash with the portfolio side.
2. **Task 7e touches the frontend.** Nulling `expected_return`/`volatility` would break the Projection tab, so one small frontend change feeds it from `projection_inputs`. The rest of the null rendering stays in Phase 2.4.
3. **`session` keeps `dmh`.** The roadmap said `bmo | amc | null`; Finnhub also sends `dmh` (during market hours) and the UI already labels it.
4. **`ConversionRateClose`** (closed-position fx) comes from Saxo's closed-position view but is not in any captured payload in this repo. The plan falls back to `fx_rate = null` when it is absent. Confirm against a live response when convenient.
5. **Backfilled fx_rate is the position's current rate**, not the trade-date rate; Saxo gives no history here. Closed or sold-out positions with no matching `Position` stay `null`.
6. **Malformed `date_from`/`date_to` still 500** (`date.fromisoformat` on raw params). Out of scope here; flagged for Phase 4.
7. **Not fixed, only explained:** the 2026-09-29 €2,671.12 credit is `REFUND_CREDIT` because `categorize()` falls back to that for any positive amount with no matching keyword. Recategorising is a product decision, not part of this plan.

## Review Focus

- A transaction with no matching position: `currency` and `fx_rate` stay `null`, `total_eur` is `null` (Task 2a, 2c).
- A month where credits exceed spending: zero spend, month present, trend equals summary (Task 3).
- A call with `date_from` only, and a `date_from` after today (Task 5).
- Analytics with 8, 30, 90, 365 and 400 days of history, and a benchmark with longer history than the portfolio (Tasks 7a–7d).
- Duplicate earnings rows, unknown `hour` values, negative revenue, and an estimate of 0.004 (Task 8).
- Headlines with `&amp;`, nested tags and adjacent tags (Task 9).

---

## Order and dependencies

Task 1 first (independent, unblocks nothing but shared settings). Tasks 2a → 2b → 2c in order. Tasks 3 → 4 → 5 share `enablebanking/services.py` and must run in order. Task 6 after 5. Tasks 7a → 7b → 7c → 7d → 7e in order. Tasks 8 and 9 are independent of everything else. Parallelisable groups for subagents: {1}, {2a–2c}, {3–6}, {7a–7e}, {8}, {9}; none of these groups touch the same files except `settings.py` (Task 1 only).

### Task 1: Honour `?page_size=` on every paginated endpoint (roadmap 1.1)

`PAGE_SIZE_QUERY_PARAM` is not a DRF setting; `PageNumberPagination.page_size_query_param` defaults to `None`, so `?page_size=` has never done anything. The fix is a subclass in `core/` made the default.

Frontend callers found by `grep -rn page_size frontend/src` (the only two; nothing in the frontend uses `?page=` or follows `next`):

| Caller | Request | Effect today | Effect after |
|---|---|---|---|
| `frontend/src/pages/Dashboard.jsx:37` | `useTransactions('?page_size=5')` | 20 rows returned, "Last 5" shows more | 5 rows |
| `frontend/src/pages/Transactions.jsx:18` | `useTransactions('?page_size=1000')` | 20 rows only, page silently truncated | up to 1000 rows |

`max_page_size = 1000` is the smallest cap that still covers the Transactions page. No frontend edit is needed in this plan. Other `ListAPIView`s (`PositionListView`, `BankAccountListView`, research `ListCreateAPIView`s) inherit the default pagination class and now also honour `?page_size=`; their default stays 20. `enablebanking.BankTransactionListView` sets `pagination_class = None` and is unaffected.

**Files:**
- Create: `backend/core/pagination.py`
- Create: `backend/core/test_pagination.py`
- Modify: `backend/backend/settings.py:92-94`

**Interfaces:**
- Consumes: DRF `rest_framework.pagination.PageNumberPagination`; `/api/transactions/` (`transactions.views.TransactionListView`, uses the default pagination class).
- Produces: `core.pagination.StandardPagination` (`page_size = 20`, `page_size_query_param = 'page_size'`, `max_page_size = 1000`), set as `REST_FRAMEWORK['DEFAULT_PAGINATION_CLASS']`.

- [ ] **Step 1: Write the failing test**

Create `backend/core/test_pagination.py`:

```python
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from core.pagination import StandardPagination
from transactions.models import Transaction


class PageSizeQueryParamTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        Transaction.objects.bulk_create([
            Transaction(
                date=date(2026, 1, 1), type='BUY', instrument=f'Inst {n}',
                ticker=f'T{n}', qty=Decimal('1'), price=Decimal('1.00'),
                account='Saxo',
            )
            for n in range(25)
        ])

    def results(self, query=''):
        response = self.client.get(f'/api/transactions/{query}')
        self.assertEqual(response.status_code, 200)
        return response.data['results']

    def test_defaults_to_twenty_rows(self):
        self.assertEqual(len(self.results()), 20)

    def test_page_size_is_honoured(self):
        self.assertEqual(len(self.results('?page_size=5')), 5)

    def test_page_size_above_the_default_is_honoured(self):
        self.assertEqual(len(self.results('?page_size=25')), 25)

    def test_page_size_is_capped_at_max_page_size(self):
        with patch.object(StandardPagination, 'max_page_size', 7):
            self.assertEqual(len(self.results('?page_size=500')), 7)

    def test_an_invalid_page_size_falls_back_to_the_default(self):
        self.assertEqual(len(self.results('?page_size=abc')), 20)

    def test_the_cap_covers_the_transactions_page_request(self):
        self.assertGreaterEqual(StandardPagination.max_page_size, 1000)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test core.test_pagination -v 2`
Expected: ERROR at import, `ModuleNotFoundError: No module named 'core.pagination'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/core/pagination.py`:

```python
from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 1000
```

In `backend/backend/settings.py`, replace

```python
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'PAGE_SIZE_QUERY_PARAM': 'page_size',
```

with

```python
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.StandardPagination',
```

(`PAGE_SIZE` is dropped: the subclass owns the 20, and DRF only reads `PAGE_SIZE` when the class does not set `page_size`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test core.test_pagination -v 2`
Expected: 6 tests, `OK`.

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && python manage.py test`
Expected: `OK` (no test relied on the ignored param; existing pagination-shape tests still see `count`/`results`).

- [ ] **Step 6: Commit**

```bash
git add backend/core/pagination.py backend/core/test_pagination.py backend/backend/settings.py
git commit -m "fix: honour ?page_size= through a StandardPagination default capped at 1000"
```

---

### Task 2a: Transaction `currency` and `fx_rate` columns plus backfill from Position (roadmap 1.2, schema and data)

Facts the plan rests on (verified in the code):
- `Position.ticker` is `unique=True`, and `Transaction.ticker` is written with the same `mapping.bare_symbol(...)`, so the join key is `ticker`. There is no uic on `Transaction`.
- `Position.currency` is `CharField(max_length=3, default=settings.REPORTING_CURRENCY)` and `Position.fx_rate` is `DecimalField(max_digits=18, decimal_places=8, default=Decimal('1'))`. The new Transaction columns copy those specs but are nullable and have no default, so "unknown" is representable.
- Only `BUY` and `SELL` rows are ever written by a sync. `DIVIDEND`/`DEPOSIT`/`FEE` rows are left untouched by the backfill.
- A backfilled `fx_rate` is the position's current rate, not the trade-date rate (Saxo gives no historical rate here). The value is an approximation and the note in Task 2c says so.
- Latest migration is `transactions/migrations/0003_transaction_tx_date_id_desc_idx_and_more.py`, so the new ones are `0004` (schema) and `0005` (data).

**Files:**
- Modify: `backend/transactions/models.py`
- Create: `backend/transactions/migrations/0004_transaction_currency_transaction_fx_rate.py`
- Create: `backend/transactions/migrations/0005_backfill_currency_and_fx_rate.py`
- Test: `backend/transactions/test_backfill.py`

**Interfaces:**
- Consumes: `portfolio.models.Position` (`ticker`, `currency`, `fx_rate`); migration `portfolio` latest state is read via `apps.get_model` so the data migration depends on the portfolio app's current migration (looked up in Step 4).
- Produces: `Transaction.currency` (`CharField(max_length=3, null=True, blank=True, default=None)`), `Transaction.fx_rate` (`DecimalField(max_digits=18, decimal_places=8, null=True, blank=True, default=None)`), and `transactions.migrations.0005_backfill_currency_and_fx_rate.backfill_from_positions(apps, schema_editor)` (importable through `importlib`).

- [ ] **Step 1: Write the failing test**

Create `backend/transactions/test_backfill.py`:

```python
from datetime import date
from decimal import Decimal
from importlib import import_module

from django.apps import apps
from django.test import TestCase

from portfolio.models import Position
from transactions.models import Transaction

backfill = import_module(
    'transactions.migrations.0005_backfill_currency_and_fx_rate'
).backfill_from_positions


def make_position(ticker, currency, fx_rate):
    return Position.objects.create(
        ticker=ticker, name=ticker, qty=Decimal('1'), avg_cost=Decimal('1'),
        current_price=Decimal('1'), sector='Uncategorized', type='STOCK',
        color='#000000', currency=currency, fx_rate=fx_rate,
    )


def make_transaction(ticker, type='BUY', **extra):
    return Transaction.objects.create(
        date=date(2026, 8, 26), type=type, instrument=ticker, ticker=ticker,
        qty=Decimal('2'), price=Decimal('100.00'), account='Saxo', **extra,
    )


class TransactionCurrencyColumnsTest(TestCase):
    def test_new_rows_default_to_unknown_currency_and_rate(self):
        tx = make_transaction('NVDA')
        self.assertIsNone(tx.currency)
        self.assertIsNone(tx.fx_rate)


class BackfillFromPositionsTest(TestCase):
    def test_a_matched_buy_takes_the_positions_currency_and_rate(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('NVDA')

        backfill(apps, None)

        tx.refresh_from_db()
        self.assertEqual(tx.currency, 'USD')
        self.assertEqual(tx.fx_rate, Decimal('0.86008950'))

    def test_a_matched_sell_is_backfilled_too(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('NVDA', type='SELL')

        backfill(apps, None)

        tx.refresh_from_db()
        self.assertEqual(tx.currency, 'USD')

    def test_an_unmatched_row_stays_null_and_is_never_guessed_as_eur(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('META')

        backfill(apps, None)

        tx.refresh_from_db()
        self.assertIsNone(tx.currency)
        self.assertIsNone(tx.fx_rate)

    def test_non_trade_rows_are_left_alone(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('NVDA', type='DIVIDEND')

        backfill(apps, None)

        tx.refresh_from_db()
        self.assertIsNone(tx.currency)

    def test_a_row_that_already_has_a_currency_is_not_overwritten(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('NVDA', currency='GBP', fx_rate=Decimal('1.15000000'))

        backfill(apps, None)

        tx.refresh_from_db()
        self.assertEqual(tx.currency, 'GBP')
        self.assertEqual(tx.fx_rate, Decimal('1.15000000'))

    def test_running_it_twice_changes_nothing_more(self):
        make_position('NVDA', 'USD', Decimal('0.86008950'))
        tx = make_transaction('NVDA')

        backfill(apps, None)
        backfill(apps, None)

        tx.refresh_from_db()
        self.assertEqual(tx.currency, 'USD')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test transactions.test_backfill`
Expected: ERROR at import, `ModuleNotFoundError: No module named 'transactions.migrations.0005_backfill_currency_and_fx_rate'`.

- [ ] **Step 3: Add the model fields**

In `backend/transactions/models.py`, after the `saxo_trade_id` field (before `class Meta`), add:

```python
    currency = models.CharField(max_length=3, null=True, blank=True, default=None)
    fx_rate = models.DecimalField(max_digits=18, decimal_places=8,
                                  null=True, blank=True, default=None)
```

- [ ] **Step 4: Generate the schema migration and name it**

Run: `cd backend && python manage.py makemigrations transactions -n transaction_currency_transaction_fx_rate`
Expected: `Migrations for 'transactions': transactions/migrations/0004_transaction_currency_transaction_fx_rate.py` with `+ Add field currency to transaction` and `+ Add field fx_rate to transaction`.


- [ ] **Step 5: Write the data migration**

Create `backend/transactions/migrations/0005_backfill_currency_and_fx_rate.py` (the portfolio dependency is the newest portfolio migration, `0006_remove_position_isin`):

```python
from django.db import migrations

TRADE_TYPES = ('BUY', 'SELL')


def backfill_from_positions(apps, schema_editor):
    Position = apps.get_model('portfolio', 'Position')
    Transaction = apps.get_model('transactions', 'Transaction')

    for position in Position.objects.all():
        Transaction.objects.filter(
            ticker=position.ticker,
            type__in=TRADE_TYPES,
            currency__isnull=True,
        ).update(currency=position.currency, fx_rate=position.fx_rate)


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0004_transaction_currency_transaction_fx_rate'),
        ('portfolio', '0006_remove_position_isin'),
    ]

    operations = [
        migrations.RunPython(backfill_from_positions, migrations.RunPython.noop),
    ]
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && python manage.py test transactions`
Expected: `OK` (the new `test_backfill` tests plus the existing transaction tests).

Run: `cd backend && python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

- [ ] **Step 7: Commit**

```bash
git add backend/transactions/models.py backend/transactions/migrations/0004_transaction_currency_transaction_fx_rate.py backend/transactions/migrations/0005_backfill_currency_and_fx_rate.py backend/transactions/test_backfill.py
git commit -m "feat: transactions carry a nullable currency and fx_rate, backfilled from matching positions"
```

- [ ] **Step 8: Apply to the dev database and verify (RUN ONLY AFTER HUMAN MERGE APPROVAL)**

> **Gate:** do not run this step until a human has approved the merge. It mutates the persistent `backend/db.sqlite3` that the live dev server reads. `manage.py test` never touches that file, so green tests prove nothing about it (AGENTS.md).

Run: `cd backend && python manage.py migrate`
Expected: `Applying transactions.0004_transaction_currency_transaction_fx_rate... OK` and `Applying transactions.0005_backfill_currency_and_fx_rate... OK`.

Run:
```bash
cd backend && python manage.py shell -c "
from transactions.models import Transaction
trades = Transaction.objects.filter(type__in=['BUY', 'SELL'])
print('trades', trades.count())
print('with currency', trades.exclude(currency__isnull=True).count())
print('null currency', trades.filter(currency__isnull=True).values_list('ticker', flat=True).distinct())
print('non-trades touched', Transaction.objects.exclude(type__in=['BUY', 'SELL']).exclude(currency__isnull=True).count())
"
```
Expected: `with currency` plus the null count equals `trades`; `non-trades touched 0`; any null tickers are positions already sold out (they fill on the next `sync_closed_positions` run, Task 2b).

---

### Task 2b: `sync_positions` and `sync_closed_positions` write `currency` and `fx_rate` on Transaction rows (roadmap 1.2, sync)

Both writers use `Transaction.objects.update_or_create(saxo_trade_id=..., defaults=fields)` (`saxo/tasks.py:151` and `:168`), so putting the two keys into the mapping output covers both. Behaviour to pin:

- `currency` comes from `DisplayAndFormat.Currency`; if Saxo omits it the field is `None`, never `settings.REPORTING_CURRENCY`.
- Open positions: `fx_rate` is `PositionView.ConversionRateCurrent`. Closed positions: `ClosedPosition.ConversionRateClose` when Saxo sends it (the captured SIM payload in `SAMPLE_CLOSED_POSITION` does not, so it is `None` there).
- When the rate is absent but the instrument currency equals `REPORTING_CURRENCY`, the rate is exactly `1` (this is a fact, not a guess). Otherwise it is `None`.
- A resync must not move a stored `fx_rate` once set (it would silently restate history every tick); it only fills a null one. `currency` is refreshed normally.

**Files:**
- Modify: `backend/saxo/mapping.py` (add `_currency_and_rate`, extend `to_transaction_fields` at line 87 and `to_closed_transaction_fields` at line 117)
- Modify: `backend/saxo/tasks.py` (add `_upsert_transaction`, use it at lines 151 and 168)
- Test: `backend/saxo/test_mapping.py`, `backend/saxo/test_tasks.py`

**Interfaces:**
- Consumes: `Transaction.currency` / `Transaction.fx_rate` from Task 2a; existing `mapping._decimal`, `settings.REPORTING_CURRENCY`.
- Produces: `to_transaction_fields(...)` and `to_closed_transaction_fields(...)` dicts now contain `currency: str | None` and `fx_rate: Decimal | None`; `saxo.tasks._upsert_transaction(fields)`.

- [ ] **Step 1: Write the failing mapping tests**

Append to `backend/saxo/test_mapping.py`:

```python
class TransactionCurrencyMappingTest(TestCase):
    def test_open_position_carries_currency_and_conversion_rate(self):
        fields = mapping.to_transaction_fields(UNENTITLED_POSITION)
        self.assertEqual(fields['currency'], 'USD')
        self.assertEqual(fields['fx_rate'], Decimal('0.8600895'))

    def test_reporting_currency_without_a_rate_is_exactly_one(self):
        fields = mapping.to_transaction_fields(SAMPLE_POSITION)
        self.assertEqual(fields['currency'], 'EUR')
        self.assertEqual(fields['fx_rate'], Decimal('1'))

    def test_foreign_currency_without_a_rate_is_unknown_not_one(self):
        position = {
            **UNENTITLED_POSITION,
            'PositionView': {'CurrentPrice': 1.0},
        }
        fields = mapping.to_transaction_fields(position)
        self.assertEqual(fields['currency'], 'USD')
        self.assertIsNone(fields['fx_rate'])

    def test_missing_currency_is_unknown_not_eur(self):
        position = {
            **SAMPLE_POSITION,
            'DisplayAndFormat': {'Symbol': 'NVDA:xnas', 'Description': 'NVIDIA'},
        }
        fields = mapping.to_transaction_fields(position)
        self.assertIsNone(fields['currency'])
        self.assertIsNone(fields['fx_rate'])

    def test_closed_position_without_a_rate_has_unknown_fx(self):
        fields = mapping.to_closed_transaction_fields(SAMPLE_CLOSED_POSITION)
        self.assertEqual(fields['currency'], 'USD')
        self.assertIsNone(fields['fx_rate'])

    def test_closed_position_uses_the_closing_conversion_rate(self):
        closed = {
            **SAMPLE_CLOSED_POSITION,
            'ClosedPosition': {
                **SAMPLE_CLOSED_POSITION['ClosedPosition'],
                'ConversionRateClose': 0.85,
            },
        }
        fields = mapping.to_closed_transaction_fields(closed)
        self.assertEqual(fields['fx_rate'], Decimal('0.85'))
```

- [ ] **Step 2: Write the failing task tests**

Append to `backend/saxo/test_tasks.py`:

```python
class TransactionCurrencySyncTest(TestCase):
    def setUp(self):
        self.cred = SaxoCredential.objects.create(
            access_token='a', refresh_token='b',
            expires_at=timezone.now() + timedelta(hours=1),
        )
        self.usd_position = {
            **SAMPLE_POSITION,
            'PositionView': {'CurrentPrice': 875.40, 'ConversionRateCurrent': 0.86},
            'DisplayAndFormat': {
                'Symbol': 'NVDA:xnas', 'Description': 'NVIDIA Corporation', 'Currency': 'USD',
            },
        }

    @patch('saxo.tasks.client.get_positions')
    def test_sync_positions_writes_currency_and_fx_rate_on_the_transaction(self, mock_get_positions):
        mock_get_positions.return_value = [self.usd_position]
        tasks.sync_positions()
        txn = Transaction.objects.get(ticker='NVDA')
        self.assertEqual(txn.currency, 'USD')
        self.assertEqual(txn.fx_rate, Decimal('0.86'))

    @patch('saxo.tasks.client.get_positions')
    def test_a_resync_keeps_the_stored_fx_rate(self, mock_get_positions):
        mock_get_positions.return_value = [self.usd_position]
        tasks.sync_positions()
        moved = {
            **self.usd_position,
            'PositionView': {'CurrentPrice': 875.40, 'ConversionRateCurrent': 0.91},
        }
        mock_get_positions.return_value = [moved]
        tasks.sync_positions()
        self.assertEqual(Transaction.objects.get(ticker='NVDA').fx_rate, Decimal('0.86'))

    @patch('saxo.tasks.client.get_positions')
    def test_a_resync_fills_a_null_fx_rate(self, mock_get_positions):
        mock_get_positions.return_value = [self.usd_position]
        tasks.sync_positions()
        Transaction.objects.filter(ticker='NVDA').update(fx_rate=None)
        tasks.sync_positions()
        self.assertEqual(Transaction.objects.get(ticker='NVDA').fx_rate, Decimal('0.86'))

    @patch('saxo.tasks.client.get_closed_positions')
    def test_sync_closed_positions_writes_currency_and_leaves_unknown_fx_null(self, mock_get_closed):
        mock_get_closed.return_value = [SAMPLE_CLOSED_POSITION]
        tasks.sync_closed_positions()
        txn = Transaction.objects.get(ticker='META')
        self.assertEqual(txn.currency, 'USD')
        self.assertIsNone(txn.fx_rate)
```

Check that `SAMPLE_CLOSED_POSITION` and `SAMPLE_POSITION` are defined or imported at the top of `saxo/test_tasks.py` (the existing `SyncClosedPositionsTaskTest` already uses both, so they are in scope).

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && python manage.py test saxo.test_mapping saxo.test_tasks`
Expected: FAIL, `KeyError: 'currency'` in the mapping tests and `AssertionError: None != 'USD'` in the task tests.

- [ ] **Step 4: Implement the mapping**

In `backend/saxo/mapping.py`, add above `to_transaction_fields`:

```python
def _currency_and_rate(display, rate):
    currency = display.get('Currency')
    if rate is not None:
        return currency, _decimal(rate)
    if currency == settings.REPORTING_CURRENCY:
        return currency, Decimal('1')
    return currency, None
```

In `to_transaction_fields`, before the `return`, add `currency, fx_rate = _currency_and_rate(display, saxo_position.get('PositionView', {}).get('ConversionRateCurrent'))` and add `'currency': currency, 'fx_rate': fx_rate,` to the returned dict (after `'account': 'Saxo'`).

In `to_closed_transaction_fields`, before the `return`, add `currency, fx_rate = _currency_and_rate(display, base.get('ConversionRateClose'))` and the same two keys to the dict.

A missing `Currency` with no rate returns `(None, None)`; with a rate but no currency it returns `(None, <rate>)`, which Task 2c ignores because it needs both.

- [ ] **Step 5: Implement the upsert in tasks**

In `backend/saxo/tasks.py`, add below `CREATE_ONLY_FIELDS`:

```python
def _upsert_transaction(fields):
    transaction_row, created = Transaction.objects.update_or_create(
        saxo_trade_id=fields['saxo_trade_id'],
        defaults={key: value for key, value in fields.items() if key != 'fx_rate'},
        create_defaults=fields,
    )
    if not created and transaction_row.fx_rate is None and fields['fx_rate'] is not None:
        transaction_row.fx_rate = fields['fx_rate']
        transaction_row.save(update_fields=['fx_rate'])
    return transaction_row
```

Replace both loop bodies:

```python
            Transaction.objects.update_or_create(
                saxo_trade_id=fields['saxo_trade_id'], defaults=fields
            )
```

with

```python
            _upsert_transaction(fields)
```

(in `sync_positions` at line ~151 and `sync_closed_positions` at line ~168; keep the `rows += 1` in the latter).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && python manage.py test saxo transactions`
Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add backend/saxo/mapping.py backend/saxo/tasks.py backend/saxo/test_mapping.py backend/saxo/test_tasks.py
git commit -m "feat: sync writes currency and a frozen fx_rate on transaction rows"
```

---

### Task 2c: Serializer exposes `currency`, `fx_rate` and `total_eur` (roadmap 1.2, API)

`total` stays the instrument-currency amount (`qty * price`), per AGENTS.md ("prices stay in the instrument's currency; only converted figures are safe to sum"). `total_eur` is that total converted with `fx_rate`, using `core.money.Money`, rounded to cents, and `null` when either `currency` or `fx_rate` is unknown. The frontend then uses `fmtMoney(price, currency)` for price/total and `fmtEur(total_eur)` for the converted figure (no frontend edit in this plan). The field is named `total_eur` as the roadmap asks; its value is in `settings.REPORTING_CURRENCY`, which defaults to EUR.

**Files:**
- Modify: `backend/transactions/serializers.py`
- Test: `backend/transactions/tests.py` (append a new `APITestCase`)

**Interfaces:**
- Consumes: `Transaction.currency`, `Transaction.fx_rate`, `Transaction.total` (Task 2a); `core.money.Money(amount, currency)`, `.converted(currency, rate)`, `.rounded()`; `settings.REPORTING_CURRENCY`.
- Produces: `/api/transactions/` result items gain `currency: str | null`, `fx_rate: str | null` (DRF decimal string) and `total_eur: Decimal-as-string | null`.

- [ ] **Step 1: Write the failing test**

Append to `backend/transactions/tests.py`:

```python
class TransactionCurrencyAPITest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        token = RefreshToken.for_user(user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    def row(self, **extra):
        Transaction.objects.create(
            date=date(2026, 8, 26), type='BUY', instrument='NVIDIA', ticker='NVDA',
            qty=Decimal('5'), price=Decimal('100.00'), account='Saxo', **extra,
        )
        return self.client.get('/api/transactions/').data['results'][0]

    def test_total_eur_converts_the_instrument_total_with_fx_rate(self):
        row = self.row(currency='USD', fx_rate=Decimal('0.86000000'))
        self.assertEqual(row['currency'], 'USD')
        self.assertEqual(Decimal(row['fx_rate']), Decimal('0.86'))
        self.assertEqual(row['total'], Decimal('500.00'))
        self.assertEqual(Decimal(str(row['total_eur'])), Decimal('430.00'))

    def test_total_eur_is_rounded_to_cents(self):
        row = self.row(currency='USD', fx_rate=Decimal('0.86008950'))
        self.assertEqual(Decimal(str(row['total_eur'])), Decimal('430.04'))

    def test_total_eur_is_null_without_fx_rate(self):
        row = self.row(currency='USD')
        self.assertEqual(row['currency'], 'USD')
        self.assertIsNone(row['fx_rate'])
        self.assertIsNone(row['total_eur'])

    def test_total_eur_is_null_without_currency(self):
        row = self.row(fx_rate=Decimal('0.86000000'))
        self.assertIsNone(row['currency'])
        self.assertIsNone(row['total_eur'])

    def test_a_row_with_neither_reports_nulls_never_eur(self):
        row = self.row()
        self.assertIsNone(row['currency'])
        self.assertIsNone(row['fx_rate'])
        self.assertIsNone(row['total_eur'])
        self.assertEqual(row['total'], Decimal('500.00'))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test transactions.tests.TransactionCurrencyAPITest`
Expected: FAIL with `KeyError: 'currency'`.

- [ ] **Step 3: Implement the serializer**

Replace `backend/transactions/serializers.py` with:

```python
from django.conf import settings
from rest_framework import serializers

from core.money import Money

from .models import Transaction


class TransactionSerializer(serializers.ModelSerializer):
    total = serializers.ReadOnlyField()
    total_eur = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = [
            'id', 'date', 'type', 'instrument', 'ticker',
            'qty', 'price', 'account', 'total',
            'currency', 'fx_rate', 'total_eur',
        ]

    def get_total_eur(self, transaction):
        if not transaction.currency or transaction.fx_rate is None:
            return None
        converted = Money(transaction.total, transaction.currency).converted(
            settings.REPORTING_CURRENCY, transaction.fx_rate
        )
        return converted.rounded().amount
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python manage.py test transactions`
Expected: `OK`. (`430.0400...` check: `500 * 0.86008950 = 430.04475` rounds half-up to `430.04`.)

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && python manage.py test`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add backend/transactions/serializers.py backend/transactions/tests.py
git commit -m "feat: transaction API exposes currency, fx_rate and a null-safe total_eur"
```

### Task 3: Spending trend uses the summary's per-category rule, is continuous, and flags the partial month

**Files:**
- Modify: `backend/enablebanking/services.py` (add `defaultdict` import, `_today`, `_shift_month`, `_spend_by_category`; rewrite `spending_trend`; route `spending_summary` through `_spend_by_category`)
- Test: `backend/enablebanking/test_spending_service.py` (replace `SpendingTrendTest`, add one agreement test, add `patch` import)
- Test: `backend/enablebanking/test_transaction_views.py` (`SpendingTrendViewTest`)

**Interfaces:**
- Consumes: `BankTransaction` (`amount`, `booking_date`, `category`, `category_override`), `TRANSFER_CATEGORIES` in `enablebanking/services.py`.
- Produces:
  - `_today() -> date` (the single clock seam for the whole module; later tasks and tests patch `enablebanking.services._today`).
  - `_shift_month(day: date, delta: int) -> date` (first of the month `delta` months from `day`).
  - `_spend_by_category(nets) -> dict[str, Decimal]`: `nets` is an iterable of `(category, signed_net_total)`; returns `{category: positive_spend}` for categories whose net is negative only. This is the one definition of "spending".
  - `spending_trend(months=6) -> list[{'month': 'YYYY-MM', 'total': Decimal, 'partial': bool}]`, always exactly `max(1, months)` entries, oldest first, zeros included, `partial` true only for the current month.

Why the bug exists: `spending_trend` sums all non-transfer categories into one signed net per month and drops months with net >= 0, so one uncategorised credit (the 2026-09-29 `REFUND_CREDIT` of 2671.12) swallows a whole month of real outflows. `spending_summary` only counts categories whose own net is negative.

- [ ] **Step 1: Write the failing tests**

In `backend/enablebanking/test_spending_service.py`, change the imports at the top to:

```python
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from accounts.models import BankAccount

from .models import BankTransaction
from .services import spending_summary, spending_trend
```

Replace the whole `SpendingTrendTest` class (from `class SpendingTrendTest(TestCase):` to the end of the file) with:

```python
class SpendingTrendTest(TestCase):
    def setUp(self):
        self.account = BankAccount.objects.create(
            bank='KBC', type='Current account', iban_masked='BE12 •••• •••• 0001',
            balance=100, available=100, external_id='enablebanking:kbc:acc-1',
        )
        patcher = patch('enablebanking.services._today', return_value=date(2026, 10, 4))
        patcher.start()
        self.addCleanup(patcher.stop)

    def _tx(self, amount, category, booking_date, external_id, category_override=None):
        BankTransaction.objects.create(
            bank='kbc', bank_account=self.account, external_id=external_id,
            amount=amount, currency='EUR', booking_date=booking_date,
            category=category, category_override=category_override,
        )

    def _by_month(self, trend):
        return {row['month']: row['total'] for row in trend}

    def test_groups_by_month(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 8, 5), 't1')
        self._tx(Decimal('-10'), 'DINING', date(2026, 8, 20), 't2')
        self._tx(Decimal('-30'), 'GROCERIES', date(2026, 9, 3), 't3')

        by_month = self._by_month(spending_trend(months=6))

        self.assertEqual(by_month['2026-08'], Decimal('50'))
        self.assertEqual(by_month['2026-09'], Decimal('30'))

    def test_series_is_continuous_with_zero_months_included(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 8, 5), 't1')
        self._tx(Decimal('-25'), 'GROCERIES', date(2026, 10, 2), 't2')

        trend = spending_trend(months=6)

        self.assertEqual(
            [row['month'] for row in trend],
            ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
        )
        self.assertEqual(
            [row['total'] for row in trend],
            [Decimal('0'), Decimal('0'), Decimal('0'), Decimal('40'), Decimal('0'), Decimal('25')],
        )

    def test_empty_database_still_returns_the_requested_months(self):
        trend = spending_trend(months=6)

        self.assertEqual(len(trend), 6)
        self.assertTrue(all(row['total'] == Decimal('0') for row in trend))

    def test_only_the_current_month_is_partial(self):
        trend = spending_trend(months=6)

        self.assertEqual([row['partial'] for row in trend], [False] * 5 + [True])

    def test_limits_to_requested_number_of_months(self):
        trend = spending_trend(months=3)

        self.assertEqual([row['month'] for row in trend], ['2026-08', '2026-09', '2026-10'])

    def test_a_zero_or_negative_month_count_still_returns_the_current_month(self):
        self.assertEqual([row['month'] for row in spending_trend(months=0)], ['2026-10'])

    def test_series_crosses_a_year_boundary(self):
        with patch('enablebanking.services._today', return_value=date(2026, 2, 10)):
            trend = spending_trend(months=4)

        self.assertEqual([row['month'] for row in trend], ['2025-11', '2025-12', '2026-01', '2026-02'])

    def test_excludes_transfers(self):
        self._tx(Decimal('-500'), 'TRANSFER', date(2026, 9, 5), 't1')

        trend = spending_trend(months=6)

        self.assertEqual(self._by_month(trend)['2026-09'], Decimal('0'))

    def test_respects_category_override_for_exclusion(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 9, 5), 't1', category_override='TRANSFER')

        self.assertEqual(self._by_month(spending_trend(months=6))['2026-09'], Decimal('0'))

    def test_matched_refund_reduces_the_months_total(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 9, 5), 't1')
        self._tx(Decimal('20'), 'GROCERIES', date(2026, 9, 10), 't2')

        self.assertEqual(self._by_month(spending_trend(months=6))['2026-09'], Decimal('30'))

    def test_fully_refunded_category_contributes_zero_and_the_month_is_kept(self):
        self._tx(Decimal('-50'), 'GROCERIES', date(2026, 9, 5), 't1')
        self._tx(Decimal('50'), 'GROCERIES', date(2026, 9, 10), 't2')

        trend = spending_trend(months=6)

        self.assertIn('2026-09', [row['month'] for row in trend])
        self.assertEqual(self._by_month(trend)['2026-09'], Decimal('0'))

    def test_an_unmatched_credit_larger_than_the_months_spend_does_not_erase_it(self):
        self._tx(Decimal('-100'), 'GROCERIES', date(2026, 9, 5), 't1')
        self._tx(Decimal('-50'), 'DINING', date(2026, 9, 6), 't2')
        self._tx(Decimal('2671.12'), 'REFUND_CREDIT', date(2026, 9, 29), 't3')

        self.assertEqual(self._by_month(spending_trend(months=6))['2026-09'], Decimal('150'))

    def test_a_month_with_only_a_credit_shows_zero_spend_not_a_missing_month(self):
        self._tx(Decimal('2671.12'), 'REFUND_CREDIT', date(2026, 9, 29), 't1')

        trend = spending_trend(months=6)

        self.assertEqual(self._by_month(trend)['2026-09'], Decimal('0'))

    def test_trend_and_summary_agree_for_the_same_month(self):
        self._tx(Decimal('-100'), 'GROCERIES', date(2026, 9, 5), 't1')
        self._tx(Decimal('-50'), 'DINING', date(2026, 9, 6), 't2')
        self._tx(Decimal('30'), 'GROCERIES', date(2026, 9, 7), 't3')
        self._tx(Decimal('2671.12'), 'REFUND_CREDIT', date(2026, 9, 29), 't4')
        self._tx(Decimal('-500'), 'TRANSFER', date(2026, 9, 8), 't5')
        self._tx(Decimal('-20'), 'DINING', date(2026, 9, 9), 't6', category_override='SAVINGS')

        summary = spending_summary(date_from='2026-09-01', date_to='2026-09-30')
        trend = self._by_month(spending_trend(months=6))

        self.assertEqual(summary['total'], Decimal('120'))
        self.assertEqual(trend['2026-09'], summary['total'])
```

In `backend/enablebanking/test_transaction_views.py`, replace the `SpendingTrendViewTest` class with the version below. Check the file's imports first; it already imports `date`, `Decimal`, `BankAccount`, `BankTransaction`; add `from unittest.mock import patch` if it is missing.

```python
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
        patcher = patch('enablebanking.services._today', return_value=date(2026, 1, 20))
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_returns_monthly_totals_with_the_partial_flag(self):
        response = self.client.get('/api/enablebanking/spending/trend/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 6)
        self.assertEqual(response.data[-1]['month'], '2026-01')
        self.assertEqual(response.data[-1]['total'], Decimal('40'))
        self.assertTrue(response.data[-1]['partial'])
        self.assertFalse(response.data[0]['partial'])

    def test_respects_months_query_param(self):
        response = self.client.get('/api/enablebanking/spending/trend/?months=1')
        self.assertEqual(len(response.data), 1)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `python manage.py test enablebanking.test_spending_service.SpendingTrendTest enablebanking.test_transaction_views.SpendingTrendViewTest -v 2`
Expected: FAIL / ERROR. Patching `enablebanking.services._today` raises `AttributeError: <module 'enablebanking.services'> does not have the attribute '_today'` in every test.

- [ ] **Step 3: Implement**

In `backend/enablebanking/services.py`, change the first import line to:

```python
from collections import defaultdict
from datetime import date, timedelta
```

Directly under `TRANSFER_CATEGORIES = ('TRANSFER', 'SAVINGS')` add:

```python
def _today():
    return timezone.localdate()


def _shift_month(day, delta):
    index = day.year * 12 + day.month - 1 + delta
    return date(index // 12, index % 12 + 1, 1)


def _spend_by_category(nets):
    return {category: -net for category, net in nets if net < 0}
```

In `spending_summary`, replace the `categories = [...]` block (including its comment) with:

```python
    spend = _spend_by_category(
        (row['effective_category'], row['total']) for row in spending_rows
    )
    categories = [{'category': category, 'amount': amount} for category, amount in spend.items()]
```

Replace the whole `spending_trend` function with:

```python
def spending_trend(months=6):
    months = max(1, months)
    current = _today().replace(day=1)
    starts = [_shift_month(current, offset) for offset in range(1 - months, 1)]

    rows = (
        BankTransaction.objects
        .filter(booking_date__gte=starts[0])
        .annotate(effective_category=Coalesce('category_override', 'category'))
        .exclude(effective_category__in=TRANSFER_CATEGORIES)
        .annotate(month=TruncMonth('booking_date'))
        .values('month', 'effective_category')
        .annotate(total=Sum('amount'))
    )
    nets_by_month = defaultdict(list)
    for row in rows:
        nets_by_month[row['month']].append((row['effective_category'], row['total']))

    return [
        {
            'month': start.strftime('%Y-%m'),
            'total': sum(_spend_by_category(nets_by_month[start]).values(), Decimal('0')),
            'partial': start == current,
        }
        for start in starts
    ]
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `python manage.py test enablebanking -v 1`
Expected: PASS (`OK`), including the untouched `SpendingSummaryTest` cases.

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/services.py backend/enablebanking/test_spending_service.py backend/enablebanking/test_transaction_views.py
git commit -m "fix: spending trend counts per-category spend like the summary and returns every month"
```

---

### Task 4: Spending summary compares like-for-like spans and says which comparison it made

**Files:**
- Modify: `backend/enablebanking/services.py` (`_previous_period`, `spending_summary`, new `_last_day_of_month`)
- Test: `backend/enablebanking/test_spending_service.py` (`SpendingSummaryTest`)
- Test: `backend/enablebanking/test_transaction_views.py` (`SpendingSummaryViewTest`)

**Interfaces:**
- Consumes: `_shift_month` from Task 3.
- Produces:
  - `_previous_period(date_from: date, date_to: date) -> (date, date, str)`: previous window plus its human label.
  - `spending_summary(...)` payload gains top-level `comparison_label: str | None` (None exactly when `previous_period` is None). `previous_period` keeps its `{'date_from','date_to','total'}` shape.

Rule (the frontend presets in `frontend/src/lib/periods.js` are `this_month` = 1st..today, `last_month` = whole month, `last_3_months` = 1st of month-2..today; all start on day 1, so one month-aligned rule covers them):
- `date_from` is the 1st: let `n` = calendar months spanned. The previous window starts `n` months earlier on the 1st. It ends on the last day of that month when the current window ends on the last day of its month (label `previous month` / `previous N months`), otherwise on the same day-of-month, clamped to the month length (label `same days last month` / `same days N months earlier`).
- Any other start day: the preceding window of equal length (previous behaviour), label `previous N days`.

- [ ] **Step 1: Write the failing tests**

In `backend/enablebanking/test_spending_service.py`, inside `SpendingSummaryTest`, replace `test_previous_period_is_computed_for_an_explicit_date_range` with the tests below (keep `test_previous_period_is_none_when_unscoped` and add the label assertion there):

```python
    def test_a_whole_month_is_compared_with_the_whole_previous_month(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 2, 5), 't1')
        self._tx(Decimal('-100'), 'GROCERIES', date(2026, 1, 3), 't2')
        self._tx(Decimal('-100'), 'GROCERIES', date(2026, 1, 30), 't3')

        summary = spending_summary(date_from='2026-02-01', date_to='2026-02-28')

        self.assertEqual(summary['previous_period']['total'], Decimal('200'))
        self.assertEqual(summary['previous_period']['date_from'], '2026-01-01')
        self.assertEqual(summary['previous_period']['date_to'], '2026-01-31')
        self.assertEqual(summary['comparison_label'], 'previous month')

    def test_a_month_to_date_is_compared_with_the_same_days_of_the_previous_month(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 9, 3), 't1')
        self._tx(Decimal('-60'), 'GROCERIES', date(2026, 8, 2), 't2')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 8, 20), 't3')

        summary = spending_summary(date_from='2026-09-01', date_to='2026-09-04')

        self.assertEqual(summary['previous_period']['date_from'], '2026-08-01')
        self.assertEqual(summary['previous_period']['date_to'], '2026-08-04')
        self.assertEqual(summary['previous_period']['total'], Decimal('60'))
        self.assertEqual(summary['comparison_label'], 'same days last month')

    def test_the_same_day_is_clamped_to_a_shorter_previous_month(self):
        summary = spending_summary(date_from='2026-03-01', date_to='2026-03-30')

        self.assertEqual(summary['previous_period']['date_from'], '2026-02-01')
        self.assertEqual(summary['previous_period']['date_to'], '2026-02-28')

    def test_a_multi_month_span_is_compared_with_the_same_span_earlier(self):
        self._tx(Decimal('-30'), 'GROCERIES', date(2026, 5, 10), 't1')
        self._tx(Decimal('-70'), 'GROCERIES', date(2026, 6, 20), 't2')
        self._tx(Decimal('-500'), 'GROCERIES', date(2026, 6, 25), 't3')

        summary = spending_summary(date_from='2026-07-01', date_to='2026-09-15')

        self.assertEqual(summary['previous_period']['date_from'], '2026-04-01')
        self.assertEqual(summary['previous_period']['date_to'], '2026-06-15')
        self.assertEqual(summary['previous_period']['total'], Decimal('100'))
        self.assertEqual(summary['comparison_label'], 'same days 3 months earlier')

    def test_a_range_not_starting_on_the_first_falls_back_to_the_preceding_equal_window(self):
        summary = spending_summary(date_from='2026-01-10', date_to='2026-01-19')

        self.assertEqual(summary['previous_period']['date_from'], '2025-12-31')
        self.assertEqual(summary['previous_period']['date_to'], '2026-01-09')
        self.assertEqual(summary['comparison_label'], 'previous 10 days')

    def test_a_previous_window_crossing_a_year_boundary(self):
        summary = spending_summary(date_from='2026-01-01', date_to='2026-01-31')

        self.assertEqual(summary['previous_period']['date_from'], '2025-12-01')
        self.assertEqual(summary['previous_period']['date_to'], '2025-12-31')
```

Replace `test_previous_period_is_none_when_unscoped` with:

```python
    def test_previous_period_and_label_are_none_when_unscoped(self):
        summary = spending_summary()
        self.assertIsNone(summary['previous_period'])
        self.assertIsNone(summary['comparison_label'])
```

In `backend/enablebanking/test_transaction_views.py`, extend `SpendingSummaryViewTest.test_includes_previous_period_and_transaction_count` by adding this line at the end of the method:

```python
        self.assertEqual(response.data['comparison_label'], 'previous month')
```

(The request there is `date_from=2026-01-01&date_to=2026-01-31`, a whole month.)

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `python manage.py test enablebanking.test_spending_service.SpendingSummaryTest enablebanking.test_transaction_views.SpendingSummaryViewTest -v 2`
Expected: FAIL with `KeyError: 'comparison_label'` and wrong `date_from` values (e.g. `'2026-01-04'`).

- [ ] **Step 3: Implement**

In `backend/enablebanking/services.py`, replace `_previous_period` with:

```python
def _last_day_of_month(day):
    return _shift_month(day, 1) - timedelta(days=1)


def _previous_period(date_from, date_to):
    if date_from.day == 1:
        months = (date_to.year - date_from.year) * 12 + date_to.month - date_from.month + 1
        prev_from = _shift_month(date_from, -months)
        prev_month_start = _shift_month(date_to, -months)
        prev_month_end = _last_day_of_month(prev_month_start)
        whole = date_to == _last_day_of_month(date_to)
        if whole:
            prev_to = prev_month_end
            label = 'previous month' if months == 1 else f'previous {months} months'
        else:
            prev_to = prev_month_start.replace(day=min(date_to.day, prev_month_end.day))
            label = 'same days last month' if months == 1 else f'same days {months} months earlier'
        return prev_from, prev_to, label

    length_days = (date_to - date_from).days + 1
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=length_days - 1)
    return prev_from, prev_to, f'previous {length_days} days'
```

In `spending_summary`, replace the `previous_period = None` block with:

```python
    previous_period = None
    comparison_label = None
    if _include_previous and date_from and date_to:
        prev_from, prev_to, comparison_label = _previous_period(
            date.fromisoformat(date_from), date.fromisoformat(date_to),
        )
        prev = spending_summary(
            date_from=prev_from.isoformat(), date_to=prev_to.isoformat(), _include_previous=False,
        )
        previous_period = {
            'date_from': prev_from.isoformat(),
            'date_to': prev_to.isoformat(),
            'total': prev['total'],
        }
```

and add `'comparison_label': comparison_label,` to the returned dict, after `'previous_period': previous_period,`.

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `python manage.py test enablebanking -v 1`
Expected: PASS (`OK`).

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/services.py backend/enablebanking/test_spending_service.py backend/enablebanking/test_transaction_views.py
git commit -m "fix: spending summary compares month-to-date with the same days of the previous month"
```

---

### Task 5: Spending summary and trend never include future-dated rows

**Files:**
- Modify: `backend/enablebanking/services.py` (`spending_summary` head and previous-period guard, `spending_trend` filter)
- Test: `backend/enablebanking/test_spending_service.py`
- Test: `backend/enablebanking/test_transaction_views.py` (`SpendingSummaryViewTest`)

**Interfaces:**
- Consumes: `_today` (Task 3), the 3-tuple `_previous_period` and `comparison_label` (Task 4).
- Produces: policy, implemented in the service (the view stays a pass-through): the effective end of a summary is `min(date_to, today)`, and `today` when `date_to` is absent. Rows with `booking_date > today` are excluded from both `spending_summary` and `spending_trend`. A call with `date_from` only now also returns `previous_period`/`comparison_label`, computed against the capped end.

Affected frontend callers (no frontend edits in this task):
- `frontend/src/pages/Dashboard.jsx:42` calls `useSpendingSummary('?date_from=<first of month>')` with no `date_to`; this is the "Spent MTD" figure that picked up the tomorrow-dated demo row. It is fixed by this task alone, and its payload now also carries `previous_period`/`comparison_label` (ignored by the page today).
- `frontend/src/pages/Spending.jsx:15` and `frontend/src/pages/Accounts.jsx:20` already send `date_to=today` (via `resolvePeriod`, `frontend/src/lib/periods.js`); their numbers do not change. Both hardcode the words "last month" next to `previous_period.total`; a later frontend pass can show `comparison_label` instead.
- `frontend/src/components/SpendingTrendChart.jsx` receives six rows including zero months and a new `partial` field; it needs no change to render, a later pass may style the partial bar.
- Also unchanged and out of scope: `budget_progress()` filters the current month with `booking_date__lt=end` and so still includes future-dated rows inside the month.

- [ ] **Step 1: Write the failing tests**

In `backend/enablebanking/test_spending_service.py`, in `SpendingSummaryTest.setUp`, append:

```python
        patcher = patch('enablebanking.services._today', return_value=date(2026, 10, 4))
        patcher.start()
        self.addCleanup(patcher.stop)
```

Add these tests to `SpendingSummaryTest`:

```python
    def test_a_missing_date_to_means_today_and_excludes_future_dated_rows(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 10, 3), 't1')
        self._tx(Decimal('-15'), 'DINING', date(2026, 10, 4), 't2')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 10, 5), 't3')

        summary = spending_summary(date_from='2026-10-01')

        self.assertEqual(summary['total'], Decimal('55'))
        self.assertEqual(summary['transaction_count'], 2)

    def test_no_dates_at_all_still_excludes_future_dated_rows(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 10, 3), 't1')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 10, 5), 't2')

        self.assertEqual(spending_summary()['total'], Decimal('40'))

    def test_a_date_to_in_the_future_is_capped_at_today(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 10, 3), 't1')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 10, 20), 't2')

        summary = spending_summary(date_from='2026-10-01', date_to='2026-10-31')

        self.assertEqual(summary['total'], Decimal('40'))
        self.assertEqual(summary['comparison_label'], 'same days last month')
        self.assertEqual(summary['previous_period']['date_to'], '2026-09-04')

    def test_a_past_date_to_is_respected(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 9, 10), 't1')
        self._tx(Decimal('-60'), 'GROCERIES', date(2026, 9, 25), 't2')

        summary = spending_summary(date_from='2026-09-01', date_to='2026-09-15')

        self.assertEqual(summary['total'], Decimal('40'))

    def test_a_date_from_only_call_gets_a_month_to_date_comparison(self):
        self._tx(Decimal('-70'), 'GROCERIES', date(2026, 9, 2), 't1')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 9, 20), 't2')

        summary = spending_summary(date_from='2026-10-01')

        self.assertEqual(summary['previous_period']['date_from'], '2026-09-01')
        self.assertEqual(summary['previous_period']['date_to'], '2026-09-04')
        self.assertEqual(summary['previous_period']['total'], Decimal('70'))

    def test_a_date_from_after_today_is_empty_and_has_no_comparison(self):
        self._tx(Decimal('-40'), 'GROCERIES', date(2026, 10, 3), 't1')

        summary = spending_summary(date_from='2026-11-01')

        self.assertEqual(summary['total'], Decimal('0'))
        self.assertIsNone(summary['previous_period'])
        self.assertIsNone(summary['comparison_label'])
```

Add this test to `SpendingTrendTest`:

```python
    def test_future_dated_rows_are_not_counted_in_the_current_month(self):
        self._tx(Decimal('-25'), 'GROCERIES', date(2026, 10, 2), 't1')
        self._tx(Decimal('-900'), 'GROCERIES', date(2026, 10, 5), 't2')

        self.assertEqual(self._by_month(spending_trend(months=6))['2026-10'], Decimal('25'))
```

In `backend/enablebanking/test_transaction_views.py`, replace `SpendingSummaryViewTest.setUp` with:

```python
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
        self.account = account
        patcher = patch('enablebanking.services._today', return_value=date(2026, 10, 4))
        patcher.start()
        self.addCleanup(patcher.stop)
```

and add this test to the class:

```python
    def test_date_from_only_excludes_tomorrows_rows_like_the_spending_page_does(self):
        for external_id, booking_date, amount in [
            ('today', date(2026, 10, 4), -15), ('tomorrow', date(2026, 10, 5), -900),
        ]:
            BankTransaction.objects.create(
                bank='kbc', bank_account=self.account, external_id=external_id, amount=amount,
                currency='EUR', booking_date=booking_date, category='GROCERIES',
            )

        mtd_only_from = self.client.get('/api/enablebanking/spending/summary/?date_from=2026-10-01')
        mtd_with_to = self.client.get(
            '/api/enablebanking/spending/summary/?date_from=2026-10-01&date_to=2026-10-04'
        )

        self.assertEqual(mtd_only_from.data['total'], Decimal('15'))
        self.assertEqual(mtd_only_from.data['total'], mtd_with_to.data['total'])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `python manage.py test enablebanking.test_spending_service enablebanking.test_transaction_views.SpendingSummaryViewTest -v 2`
Expected: FAIL, e.g. `AssertionError: Decimal('955') != Decimal('55')` and `TypeError`/`AssertionError` on the `date_from`-only comparison (`previous_period` is None).

- [ ] **Step 3: Implement**

In `backend/enablebanking/services.py`, replace the first lines of `spending_summary` (from `def spending_summary` down to and including the `qs = qs.annotate(effective_category=...)` line) with:

```python
def spending_summary(date_from=None, date_to=None, _include_previous=True):
    today = _today()
    end = min(date.fromisoformat(date_to), today) if date_to else today
    qs = BankTransaction.objects.filter(booking_date__lte=end)
    if date_from:
        qs = qs.filter(booking_date__gte=date_from)
    qs = qs.annotate(effective_category=Coalesce('category_override', 'category'))
```

Replace the previous-period guard and call so they use the capped `end` (the rest of the block from Task 4 is unchanged):

```python
    previous_period = None
    comparison_label = None
    if _include_previous and date_from and date.fromisoformat(date_from) <= end:
        prev_from, prev_to, comparison_label = _previous_period(date.fromisoformat(date_from), end)
        prev = spending_summary(
            date_from=prev_from.isoformat(), date_to=prev_to.isoformat(), _include_previous=False,
        )
        previous_period = {
            'date_from': prev_from.isoformat(),
            'date_to': prev_to.isoformat(),
            'total': prev['total'],
        }
```

In `spending_trend`, change the first filter to:

```python
        .filter(booking_date__gte=starts[0], booking_date__lte=_today())
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `python manage.py test enablebanking -v 1`
Expected: PASS (`OK`).

- [ ] **Step 5: Commit**

```bash
git add backend/enablebanking/services.py backend/enablebanking/test_spending_service.py backend/enablebanking/test_transaction_views.py
git commit -m "fix: spending summary and trend stop at today so every caller agrees"
```

---

### Task 6: Accounts "Bank balance" chart plots bank-only totals

**Files:**
- Modify: `backend/core/models.py` (`NetWorthSnapshot.bank_only_total`)
- Create: `backend/core/migrations/0007_networthsnapshot_bank_only_total.py` (schema + approximate backfill)
- Modify: `backend/accounts/services.py` (`get_bank_only_balance`)
- Modify: `backend/core/services.py` (`ensure_todays_snapshot`)
- Modify: `backend/core/serializers.py`
- Modify: `frontend/src/pages/Accounts.jsx` (`dataKey`, one line)
- Test: `backend/accounts/tests.py`, `backend/core/tests.py`

**Interfaces:**
- Consumes: `saxo.mapping.SAXO_CASH_ACCOUNT_ID` (`'saxo:cash'`; `saxo/mapping.py` imports only stdlib/Django, so `accounts` importing it creates no cycle), `core.money.Money.total`, `settings.REPORTING_CURRENCY`.
- Produces:
  - `accounts.services.get_bank_only_balance() -> Money`: sum of every `BankAccount` except the Saxo cash mirror (a null `external_id`, i.e. a hand-entered account, is kept).
  - `NetWorthSnapshot.bank_only_total: Decimal | None` (null for rows that predate the column and had no `saxo_account_value` to estimate from).
  - `/api/core/net-worth-history/` rows gain `bank_only_total`; `bank_total` is unchanged because it is a component of `net_worth` and the Portfolio page's "Bank balance" row.

Why a stored column: the snapshot stores one `bank_total` that deliberately includes the Saxo cash mirror (see the `NetWorthSnapshot` and `current_net_worth` docstrings: it keeps net worth from double counting). History cannot be split after the fact, so the bank-only figure has to be recorded from now on.

- [ ] **Step 1: Write the failing tests**

In `backend/accounts/tests.py` add (import `get_bank_only_balance` from `.services` and `Money` from `core.money` at the top if absent, `BankAccount` is already used in that file):

```python
class BankOnlyBalanceTest(TestCase):
    def test_excludes_the_saxo_cash_mirror(self):
        BankAccount.objects.create(
            bank='KBC', type='Checking', iban_masked='BE68 1234',
            balance=Decimal('833.00'), available=Decimal('833.00'), external_id='enablebanking:kbc:acc-1',
        )
        BankAccount.objects.create(
            bank='Saxo', type='Cash', iban_masked='-',
            balance=Decimal('971000.00'), available=Decimal('971000.00'), external_id='saxo:cash',
        )

        self.assertEqual(get_bank_only_balance(), Money(Decimal('833.00'), 'EUR'))

    def test_keeps_hand_entered_accounts_without_an_external_id(self):
        BankAccount.objects.create(
            bank='ING', type='Checking', iban_masked='BE45 9012',
            balance=Decimal('100.00'), available=Decimal('100.00'),
        )

        self.assertEqual(get_bank_only_balance(), Money(Decimal('100.00'), 'EUR'))

    def test_is_zero_with_no_accounts(self):
        self.assertEqual(get_bank_only_balance(), Money(Decimal('0'), 'EUR'))
```

In `backend/core/tests.py` add these classes (the file already imports `NetWorthSnapshot`, `BankAccount`, `Decimal`, `date`, `timezone`, `TestCase`, `APITestCase`, `User`, `RefreshToken`, `PortfolioValuation`, `SAXO_SOURCE`, `ensure_todays_snapshot`):

```python
class SnapshotBankOnlyTotalTest(TestCase):
    def setUp(self):
        BankAccount.objects.create(
            bank='Saxo', type='Cash', iban_masked='-', external_id='saxo:cash',
            balance=Decimal('900.00'), available=Decimal('900.00'),
        )
        BankAccount.objects.create(
            bank='KBC', type='Checking', iban_masked='BE68 1234',
            balance=Decimal('2500.00'), available=Decimal('2500.00'),
        )

    def test_snapshot_records_bank_only_total_alongside_bank_total(self):
        snap = ensure_todays_snapshot()

        self.assertEqual(snap.bank_total, Decimal('3400.00'))
        self.assertEqual(snap.bank_only_total, Decimal('2500.00'))

    def test_net_worth_is_unchanged_by_the_new_field(self):
        snap = ensure_todays_snapshot()

        self.assertEqual(snap.net_worth, snap.portfolio_value + snap.bank_total)


class NetWorthHistoryBankOnlyTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='bankonly', password='pw')
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {RefreshToken.for_user(user).access_token}')

    def test_history_rows_expose_bank_only_total_and_keep_bank_total(self):
        NetWorthSnapshot.objects.create(
            date=timezone.localdate() - timedelta(days=3),
            portfolio_value=Decimal('1000.00'), bank_total=Decimal('971833.00'),
            bank_only_total=Decimal('833.00'), net_worth=Decimal('972833.00'),
        )

        response = self.client.get('/api/core/net-worth-history/?range=ALL')

        row = next(r for r in response.data if r['date'] == str(timezone.localdate() - timedelta(days=3)))
        self.assertEqual(row['bank_only_total'], '833.00')
        self.assertEqual(row['bank_total'], '971833.00')

    def test_a_row_without_the_figure_serialises_null(self):
        NetWorthSnapshot.objects.create(
            date=timezone.localdate() - timedelta(days=5),
            portfolio_value=Decimal('1.00'), bank_total=Decimal('1.00'), net_worth=Decimal('2.00'),
        )

        response = self.client.get('/api/core/net-worth-history/?range=ALL')

        row = next(r for r in response.data if r['date'] == str(timezone.localdate() - timedelta(days=5)))
        self.assertIsNone(row['bank_only_total'])


class BankOnlyBackfillTest(TestCase):
    def test_estimates_saxo_cash_from_the_broker_figure_and_subtracts_it(self):
        import importlib
        from django.apps import apps

        migration = importlib.import_module('core.migrations.0007_networthsnapshot_bank_only_total')
        estimated = NetWorthSnapshot.objects.create(
            date=date(2026, 6, 1), portfolio_value=Decimal('1000.00'), bank_total=Decimal('1833.00'),
            saxo_account_value=Decimal('2000.00'), net_worth=Decimal('2833.00'),
        )
        unknown = NetWorthSnapshot.objects.create(
            date=date(2026, 6, 2), portfolio_value=Decimal('1000.00'), bank_total=Decimal('1833.00'),
            net_worth=Decimal('2833.00'),
        )

        migration.backfill_bank_only_total(apps, None)

        estimated.refresh_from_db()
        unknown.refresh_from_db()
        self.assertEqual(estimated.bank_only_total, Decimal('833.00'))
        self.assertIsNone(unknown.bank_only_total)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `python manage.py test accounts core -v 2`
Expected: ERROR, `ImportError: cannot import name 'get_bank_only_balance' from 'accounts.services'` for accounts, and `TypeError: NetWorthSnapshot() got unexpected keyword arguments: 'bank_only_total'` for core.

- [ ] **Step 3: Implement**

In `backend/accounts/services.py`, add the import `from saxo.mapping import SAXO_CASH_ACCOUNT_ID` below `from core.money import Money`, and append:

```python
def get_bank_only_balance():
    return Money.total(
        (Money(account.balance, account.currency)
         for account in BankAccount.objects.exclude(external_id=SAXO_CASH_ACCOUNT_ID)),
        settings.REPORTING_CURRENCY,
    )
```

In `backend/core/models.py`, add below `bank_total`:

```python
    bank_only_total = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, default=None,
    )
```

Create `backend/core/migrations/0007_networthsnapshot_bank_only_total.py`:

```python
from decimal import Decimal

from django.db import migrations, models


def backfill_bank_only_total(apps, schema_editor):
    Snapshot = apps.get_model('core', 'NetWorthSnapshot')
    rows = Snapshot.objects.filter(saxo_account_value__isnull=False, bank_only_total__isnull=True)
    for snapshot in rows:
        saxo_cash = max(snapshot.saxo_account_value - snapshot.portfolio_value, Decimal('0'))
        snapshot.bank_only_total = max(snapshot.bank_total - saxo_cash, Decimal('0'))
        snapshot.save(update_fields=['bank_only_total'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_seed_discover_scan'),
    ]

    operations = [
        migrations.AddField(
            model_name='networthsnapshot',
            name='bank_only_total',
            field=models.DecimalField(blank=True, decimal_places=2, default=None, max_digits=14, null=True),
        ),
        migrations.RunPython(backfill_bank_only_total, migrations.RunPython.noop),
    ]
```

In `backend/core/services.py`, change the import to `from accounts.services import get_bank_only_balance, get_total_bank_balance`, and add this entry to the `defaults` dict in `ensure_todays_snapshot`, after `'bank_total': ...`:

```python
            'bank_only_total': get_bank_only_balance().rounded().amount,
```

In `backend/core/serializers.py` change `fields` to:

```python
        fields = ['date', 'portfolio_value', 'bank_total', 'bank_only_total', 'saxo_account_value', 'net_worth']
```

In `frontend/src/pages/Accounts.jsx`, change the `HistoryAreaChart` prop `dataKey="bank_total"` to `dataKey="bank_only_total"` and the subtitle to `"Your connected bank accounts over time"`. Check `frontend/src/pages/Accounts.test.jsx` for assertions on the old subtitle text and update them to match.

- [ ] **Step 4: Run the tests to verify they pass, and migrate the dev database**

Run (from `backend/`): `python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

Run: `python manage.py test accounts core enablebanking saxo -v 1`
Expected: PASS (`OK`).

Run: `cd ../frontend && npx vitest run src/pages/Accounts.test.jsx`
Expected: PASS.

Per AGENTS.md a migration is not done until the dev database has it: run `python manage.py migrate` from `backend/` (the dev server must not be left with a missing column). Expected last line: `Applying core.0007_networthsnapshot_bank_only_total... OK`.

- [ ] **Step 5: Commit**

```bash
git add backend/accounts/services.py backend/accounts/tests.py backend/core/models.py backend/core/migrations/0007_networthsnapshot_bank_only_total.py backend/core/services.py backend/core/serializers.py backend/core/tests.py frontend/src/pages/Accounts.jsx frontend/src/pages/Accounts.test.jsx
git commit -m "fix: the Accounts bank-balance chart plots bank accounts only, not the Saxo cash mirror"
```

### Task 7a: One module that owns "how much history does each figure need"

**Files:**
- Create: `backend/analytics/history.py`
- Modify: `backend/analytics/tests.py` (imports at line 14; append `HistoryTest` at the end of the file)

**Interfaces:**
- Consumes: nothing.
- Produces (`analytics.history`), relied on by Tasks 7b-7d:
  - `MIN_HISTORY_DAYS: dict[str, int]` with keys `volatility` 30, `tracking_error` 30, `beta` 90, `expected_return` 365, `sharpe` 365, `sortino` 365, `information_ratio` 365, `jensen_alpha` 365.
  - `RISK_METRICS = ('expected_return', 'volatility', 'sharpe', 'sortino')`, `BENCHMARK_METRICS = ('tracking_error', 'beta', 'information_ratio', 'jensen_alpha')`
  - `PROJECTION_MIN_HISTORY_DAYS = 365`, `MIN_COMPLETE_MONTHS = 2`, `MONTH_END_TOLERANCE_DAYS = 3`, `BENCHMARK_EDGE_TOLERANCE_DAYS = 4`
  - `span_days(dates: list[date]) -> int` (0 when fewer than 2 dates)
  - `history_days(dated_values: list[tuple[date, number]]) -> int` (calendar days from first to last point; 0 when fewer than 2 points)
  - `days_missing(have: int, need: int) -> int` (never negative)
  - `needs_days(days: int, names: tuple[str, ...]) -> dict[str, int]`
  - `gate(value, days: int, metric: str)` returns `value` when `days >= MIN_HISTORY_DAYS[metric]`, else `None`
  - `inputs_reliable(days: int) -> bool`
  - `latest_month_is_complete(last_date: date) -> bool`

Thresholds, and why: the three annualising-by-mean statistics (expected return, Sharpe, Sortino) and the two that subtract or divide annualised means (information ratio, Jensen alpha) are never produced under 365 days, which is the "never annualise under a year" rule applied to them. A standard deviation scales by a square root and stabilises sooner, so volatility and tracking error need 30 days (roughly 20 trading days, the point `data_quality` already calls out as the edge of 'low'). Beta is a regression slope with no annualising, 90 days (about 60 observations). Projection inputs (mean and volatility) are only reliable when both are, so 365.

- [ ] **Step 1: Write the failing tests**

In `backend/analytics/tests.py` change line 14 to:

```python
from . import benchmarks, history, metrics, report, views
```

Append at the end of the file:

```python
SERIES_START = date(2025, 3, 3)


def synthetic_series(days, start=SERIES_START):
    return [
        (start + timedelta(days=i), 100 + i * 0.2 + (3 if i % 3 == 0 else 0))
        for i in range(days + 1)
    ]


def benchmark_series(days, start=SERIES_START):
    return [
        (start + timedelta(days=i), 50 + i * 0.1 + (1 if i % 4 == 0 else 0))
        for i in range(days + 1)
    ]


class HistoryTest(TestCase):
    def test_history_days_is_the_calendar_span_of_the_series(self):
        self.assertEqual(history.history_days(synthetic_series(8)), 8)

    def test_fewer_than_two_points_is_zero_days(self):
        self.assertEqual(history.history_days([]), 0)
        self.assertEqual(history.history_days([(SERIES_START, 100)]), 0)

    def test_a_figure_appears_exactly_at_its_threshold(self):
        self.assertIsNone(history.gate(1.5, 29, 'volatility'))
        self.assertEqual(history.gate(1.5, 30, 'volatility'), 1.5)

    def test_gating_passes_none_through(self):
        self.assertIsNone(history.gate(None, 400, 'sharpe'))

    def test_days_missing_is_never_negative(self):
        self.assertEqual(history.days_missing(8, 30), 22)
        self.assertEqual(history.days_missing(400, 30), 0)

    def test_needs_days_names_every_requested_metric(self):
        self.assertEqual(
            history.needs_days(8, history.RISK_METRICS),
            {'expected_return': 357, 'volatility': 22, 'sharpe': 357, 'sortino': 357},
        )

    def test_projection_inputs_are_reliable_from_a_year(self):
        self.assertFalse(history.inputs_reliable(364))
        self.assertTrue(history.inputs_reliable(365))

    def test_a_month_is_complete_once_its_last_trading_day_has_passed(self):
        self.assertTrue(history.latest_month_is_complete(date(2026, 3, 31)))
        self.assertTrue(history.latest_month_is_complete(date(2026, 1, 30)))
        self.assertFalse(history.latest_month_is_complete(date(2026, 3, 20)))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python manage.py test analytics.tests.HistoryTest -v 2`
Expected: ERROR, `ImportError: cannot import name 'history' from 'analytics'`

- [ ] **Step 3: Write the module**

Create `backend/analytics/history.py`:

```python
from datetime import timedelta

MIN_HISTORY_DAYS = {
    'volatility': 30,
    'tracking_error': 30,
    'beta': 90,
    'expected_return': 365,
    'sharpe': 365,
    'sortino': 365,
    'information_ratio': 365,
    'jensen_alpha': 365,
}

RISK_METRICS = ('expected_return', 'volatility', 'sharpe', 'sortino')
BENCHMARK_METRICS = ('tracking_error', 'beta', 'information_ratio', 'jensen_alpha')

PROJECTION_MIN_HISTORY_DAYS = 365
MIN_COMPLETE_MONTHS = 2
MONTH_END_TOLERANCE_DAYS = 3
BENCHMARK_EDGE_TOLERANCE_DAYS = 4


def span_days(dates):
    if len(dates) < 2:
        return 0
    return (dates[-1] - dates[0]).days


def history_days(dated_values):
    return span_days([d for d, _ in dated_values])


def days_missing(have, need):
    return max(0, need - have)


def needs_days(days, names):
    return {name: days_missing(days, MIN_HISTORY_DAYS[name]) for name in names}


def gate(value, days, metric):
    return value if days >= MIN_HISTORY_DAYS[metric] else None


def inputs_reliable(days):
    return days >= PROJECTION_MIN_HISTORY_DAYS


def latest_month_is_complete(last_date):
    return (last_date + timedelta(days=MONTH_END_TOLERANCE_DAYS)).month != last_date.month
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python manage.py test analytics.tests.HistoryTest -v 2`
Expected: 8 tests, `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/analytics/history.py backend/analytics/tests.py
git commit -m "feat: analytics names how much history each figure needs in one module"
```

---

### Task 7b: Performance periods are null until history covers them, and the benchmark is compared over the portfolio's own window

**Files:**
- Modify: `backend/analytics/metrics.py` (imports at lines 7-9; `period_return` at lines 227-235; `performance_summary` at lines 318-348)
- Test: `backend/analytics/tests.py`

**Interfaces:**
- Consumes: `history.history_days`, `history.days_missing`, `history.BENCHMARK_EDGE_TOLERANCE_DAYS` (Task 7a); test helpers `synthetic_series`, `benchmark_series`, `SERIES_START` (Task 7a).
- Produces: `metrics.window_return(dated_values, start, end) -> float | None`, `metrics.benchmark_window_return(dated_values, start, end) -> float | None`, and the `/api/analytics/performance/` payload (existing keys unchanged, additions marked):

```json
{
  "history_days": 8,
  "periods": [
    {"label": "1 month", "portfolio_pct": null, "benchmark_pct": null, "alpha_pct": null, "annualised": false, "needs_days": 22},
    {"label": "3 months", "...": "...", "needs_days": 83},
    {"label": "Year to date", "...": "...", "needs_days": null},
    {"label": "1 year", "...": "...", "needs_days": 357},
    {"label": "3 years (ann.)", "...": "...", "annualised": true, "needs_days": 1087},
    {"label": "5 years (ann.)", "...": "...", "annualised": true, "needs_days": 1817},
    {"label": "Since inception", "portfolio_pct": 1.3, "benchmark_pct": 0.9, "alpha_pct": 0.4, "annualised": false, "needs_days": 0}
  ],
  "calendar_years": ["unchanged"],
  "benchmark": {"key": "world", "name": "World Index", "reason": null},
  "available_benchmarks": ["unchanged"]
}
```

`needs_days` is `0` when the period is covered, a positive integer of calendar days still missing otherwise, and `null` only for Year to date when tracking began after 1 January of the latest year (waiting cannot fix it before the next year). "Since inception" is never annualised and is `null` with `needs_days: 1` only for fewer than two points.

- [ ] **Step 1: Write the failing tests**

Replace `PerformanceSummaryTest` (currently lines 219-243) with the class below, keeping its two existing tests unchanged inside it, and add the new ones:

```python
class PerformanceSummaryTest(TestCase):
    def _row(self, summary, label):
        return next(row for row in summary['periods'] if row['label'] == label)

    def test_includes_alpha_as_the_difference_between_portfolio_and_benchmark(self):
        port = [(date(2026, 1, i), 100 + i) for i in range(1, 32)]
        bench = [(date(2026, 1, i), 50 + i * 0.4) for i in range(1, 32)]

        summary = metrics.performance_summary(port, bench)

        labels = [row['label'] for row in summary['periods']]
        self.assertIn('1 month', labels)
        self.assertIn('Year to date', labels)
        self.assertIn('Since inception', labels)

        one_month = self._row(summary, '1 month')
        self.assertAlmostEqual(
            one_month['alpha_pct'], one_month['portfolio_pct'] - one_month['benchmark_pct']
        )
        self.assertEqual(len(summary['calendar_years']), 1)

    def test_a_missing_side_reports_no_alpha_rather_than_a_wrong_number(self):
        port = [(date(2026, 1, i), 100 + i) for i in range(1, 32)]
        summary = metrics.performance_summary(port, [])
        one_month = self._row(summary, '1 month')
        self.assertIsNotNone(one_month['portfolio_pct'])
        self.assertIsNone(one_month['benchmark_pct'])
        self.assertIsNone(one_month['alpha_pct'])

    def test_eight_days_of_history_leaves_every_trailing_period_empty(self):
        summary = metrics.performance_summary(synthetic_series(8), benchmark_series(8))

        self.assertEqual(summary['history_days'], 8)
        for label, missing in [
            ('1 month', 22), ('3 months', 83), ('1 year', 357),
            ('3 years (ann.)', 1087), ('5 years (ann.)', 1817),
        ]:
            row = self._row(summary, label)
            self.assertIsNone(row['portfolio_pct'], label)
            self.assertIsNone(row['benchmark_pct'], label)
            self.assertIsNone(row['alpha_pct'], label)
            self.assertEqual(row['needs_days'], missing, label)

    def test_eight_days_of_history_still_reports_since_inception_unannualised(self):
        port = synthetic_series(8)
        summary = metrics.performance_summary(port, benchmark_series(8))

        inception = self._row(summary, 'Since inception')
        self.assertAlmostEqual(
            inception['portfolio_pct'], (float(port[-1][1]) / float(port[0][1]) - 1) * 100
        )
        self.assertFalse(inception['annualised'])
        self.assertEqual(inception['needs_days'], 0)

    def test_year_to_date_is_empty_when_tracking_began_after_new_year(self):
        summary = metrics.performance_summary(synthetic_series(8), benchmark_series(8))
        ytd = self._row(summary, 'Year to date')
        self.assertIsNone(ytd['portfolio_pct'])
        self.assertIsNone(ytd['needs_days'])

    def test_a_period_appears_exactly_when_history_reaches_it(self):
        short = metrics.performance_summary(synthetic_series(29), benchmark_series(29))
        exact = metrics.performance_summary(synthetic_series(30), benchmark_series(30))

        self.assertIsNone(self._row(short, '1 month')['portfolio_pct'])
        self.assertEqual(self._row(short, '1 month')['needs_days'], 1)
        self.assertIsNotNone(self._row(exact, '1 month')['portfolio_pct'])
        self.assertEqual(self._row(exact, '1 month')['needs_days'], 0)

    def test_four_hundred_days_fills_one_year_but_not_the_annualised_periods(self):
        summary = metrics.performance_summary(synthetic_series(400), benchmark_series(400))

        one_year = self._row(summary, '1 year')
        self.assertIsNotNone(one_year['portfolio_pct'])
        self.assertIsNotNone(one_year['alpha_pct'])
        self.assertFalse(one_year['annualised'])
        self.assertIsNone(self._row(summary, '3 years (ann.)')['portfolio_pct'])
        self.assertEqual(self._row(summary, '3 years (ann.)')['needs_days'], 695)
        self.assertIsNone(self._row(summary, '5 years (ann.)')['portfolio_pct'])

    def test_three_years_of_history_annualises_the_three_year_row(self):
        port = synthetic_series(1095)
        summary = metrics.performance_summary(port, benchmark_series(1095))

        three_years = self._row(summary, '3 years (ann.)')
        total = (float(port[-1][1]) / float(port[0][1]) - 1) * 100
        self.assertTrue(three_years['annualised'])
        self.assertAlmostEqual(three_years['portfolio_pct'], metrics.annualize(total, 3))

    def test_a_longer_benchmark_is_compared_only_over_the_portfolios_own_window(self):
        port = synthetic_series(40)
        base = date(2024, 1, 1)
        bench = [(base + timedelta(days=i), 1000 + i) for i in range(800)]

        summary = metrics.performance_summary(port, bench)

        def bench_at(day):
            return 1000 + (day - base).days

        start, end = port[0][0], port[-1][0]
        inception = self._row(summary, 'Since inception')
        self.assertAlmostEqual(inception['benchmark_pct'], (bench_at(end) / bench_at(start) - 1) * 100)
        one_month = self._row(summary, '1 month')
        month_start = end - timedelta(days=30)
        self.assertAlmostEqual(one_month['benchmark_pct'], (bench_at(end) / bench_at(month_start) - 1) * 100)
        self.assertAlmostEqual(
            inception['alpha_pct'], inception['portfolio_pct'] - inception['benchmark_pct']
        )

    def test_a_benchmark_that_starts_after_the_portfolio_gives_no_alpha(self):
        port = synthetic_series(40)
        late_bench = benchmark_series(10, start=SERIES_START + timedelta(days=30))

        summary = metrics.performance_summary(port, late_bench)

        inception = self._row(summary, 'Since inception')
        self.assertIsNotNone(inception['portfolio_pct'])
        self.assertIsNone(inception['benchmark_pct'])
        self.assertIsNone(inception['alpha_pct'])

    def test_no_history_leaves_everything_empty(self):
        summary = metrics.performance_summary([], [])
        self.assertEqual(summary['history_days'], 0)
        self.assertTrue(all(row['portfolio_pct'] is None for row in summary['periods']))
        self.assertEqual(self._row(summary, 'Since inception')['needs_days'], 1)
```

In `PerformanceViewTest` append:

```python
    def test_a_week_of_history_reports_what_is_missing_instead_of_zeros(self):
        for offset in range(5):
            NetWorthSnapshot.objects.create(
                date=date(2026, 1, 5) + timedelta(days=offset),
                portfolio_value=100, saxo_account_value=100 + offset,
                bank_total=0, net_worth=100,
            )

        response = self.client.get('/api/analytics/performance/')

        self.assertEqual(response.data['history_days'], 4)
        by_label = {row['label']: row for row in response.data['periods']}
        self.assertIsNone(by_label['1 year']['portfolio_pct'])
        self.assertEqual(by_label['1 year']['needs_days'], 361)
        self.assertIsNotNone(by_label['Since inception']['portfolio_pct'])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python manage.py test analytics.tests.PerformanceSummaryTest analytics.tests.PerformanceViewTest -v 2`
Expected: FAIL/ERROR, `KeyError: 'history_days'` / `KeyError: 'needs_days'`

- [ ] **Step 3: Implement**

In `backend/analytics/metrics.py` replace the imports at lines 7-9 with:

```python
import math
import statistics
from datetime import date, timedelta

from . import history
```

Replace `period_return` with these three functions:

```python
def window_return(dated_values, start, end):
    window = [(d, v) for d, v in dated_values if start <= d <= end]
    if len(window) < MIN_DAILY_POINTS:
        return None
    return (float(window[-1][1]) / float(window[0][1]) - 1) * 100


def benchmark_window_return(dated_values, start, end):
    window = [(d, v) for d, v in dated_values if start <= d <= end]
    if len(window) < MIN_DAILY_POINTS:
        return None
    tolerance = history.BENCHMARK_EDGE_TOLERANCE_DAYS
    if (window[0][0] - start).days > tolerance or (end - window[-1][0]).days > tolerance:
        return None
    return (float(window[-1][1]) / float(window[0][1]) - 1) * 100


def period_return(dated_values, days):
    """Compound % change over the trailing `days` calendar days, or None."""
    if len(dated_values) < MIN_DAILY_POINTS:
        return None
    end_date = dated_values[-1][0]
    return window_return(dated_values, end_date - timedelta(days=days), end_date)
```

Replace `performance_summary` with:

```python
def performance_summary(port_dated_values, bench_dated_values):
    days = history.history_days(port_dated_values)
    has_window = len(port_dated_values) >= MIN_DAILY_POINTS
    port_end = port_dated_values[-1][0] if has_window else None

    def row(label, start, needs, years=None):
        port_total = None
        if has_window and needs == 0:
            port_total = window_return(port_dated_values, start, port_end)
        bench_total = None
        if port_total is not None:
            bench_total = benchmark_window_return(bench_dated_values, start, port_end)
        if years:
            port_pct, bench_pct = annualize(port_total, years), annualize(bench_total, years)
        else:
            port_pct, bench_pct = port_total, bench_total
        alpha = None if port_pct is None or bench_pct is None else port_pct - bench_pct
        return {
            'label': label, 'portfolio_pct': port_pct, 'benchmark_pct': bench_pct,
            'alpha_pct': alpha, 'annualised': bool(years), 'needs_days': needs,
        }

    rows = []
    for label, period_days, years in PERFORMANCE_PERIODS:
        start = port_end - timedelta(days=period_days) if has_window else None
        shown = f'{label} (ann.)' if years else label
        rows.append(row(shown, start, history.days_missing(days, period_days), years))

    if not has_window:
        ytd_start, ytd_needs = None, history.days_missing(days, 1)
    else:
        ytd_start = date(port_end.year, 1, 1)
        ytd_needs = 0 if port_dated_values[0][0] <= ytd_start else None
    rows.insert(2, row('Year to date', ytd_start, ytd_needs))

    inception_start = port_dated_values[0][0] if has_window else None
    rows.append(row('Since inception', inception_start, history.days_missing(days, 1) if not has_window else 0))

    return {
        'history_days': days,
        'periods': rows,
        'calendar_years': calendar_year_returns(port_dated_values, bench_dated_values),
    }
```

`ytd_return` and `since_inception_return` stay (their own tests still pin them).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python manage.py test analytics -v 2`
Expected: `OK` (every pre-existing test still green; none of them asserted on a short-history period).

- [ ] **Step 5: Commit**

```bash
git add backend/analytics/metrics.py backend/analytics/tests.py
git commit -m "feat: performance periods stay empty until history covers them and the benchmark is measured over the portfolio's own window"
```

---

### Task 7c: Risk metrics, monthly stats and projection inputs gated by history

**Files:**
- Modify: `backend/analytics/metrics.py` (`risk_summary`, lines 351-396; add `_month_end` and `monthly_stats_needs_days` above it)
- Modify: `backend/analytics/tests.py` (`RiskSummaryTest` lines 246-281; `RiskMetricsViewTest.test_computes_risk_from_portfolio_value_history` lines 478-488)
- Test: `backend/analytics/tests.py`

**Interfaces:**
- Consumes: `history.gate`, `history.needs_days`, `history.RISK_METRICS`, `history.history_days`, `history.inputs_reliable`, `history.latest_month_is_complete`, `history.MIN_COMPLETE_MONTHS`, `history.days_missing` (Task 7a); `synthetic_series` (Task 7a).
- Produces: `metrics.risk_summary(dated_values, risk_free_annual)` and the `/api/analytics/risk/` payload. Every existing key keeps its name; additions marked.

```json
{
  "has_data": true,
  "data_quality": "low",
  "sample_size": 9,
  "history_days": 8,
  "inputs_reliable": false,
  "needs_days": {
    "expected_return": 357, "volatility": 22, "sharpe": 357, "sortino": 357,
    "monthly_stats": 81
  },
  "projection_inputs": {"expected_return": 12.4, "volatility": 9.8},
  "risk_free_annual": 0.02,
  "expected_return": null,
  "volatility": null,
  "sharpe": null,
  "sortino": null,
  "max_drawdown": -0.4,
  "current_drawdown": -0.1,
  "positive_months_pct": null,
  "best_month": null,
  "worst_month": null,
  "drawdown_series": [{"date": "2025-03-03", "dd": 0.0}],
  "monthly_returns": [],
  "available_benchmarks": ["unchanged"],
  "benchmark": "see Task 7d"
}
```

`expected_return`, `volatility`, `sharpe`, `sortino` are `null` under their `history.MIN_HISTORY_DAYS`; `best_month`, `worst_month`, `positive_months_pct` are `null` unless there are at least two complete monthly returns (the latest month counts only once `history.latest_month_is_complete` is true). `needs_days[k]` is `0` when the figure is shown. `projection_inputs` carries the raw, ungated mean and volatility so the projection still renders, and `inputs_reliable` says whether to trust it. When `has_data` is false the payload carries the same added keys with `history_days` from the series, `inputs_reliable: false`, `projection_inputs: {expected_return: null, volatility: null}`, and `monthly_stats` needs `null` for an empty series. `max_drawdown`/`current_drawdown` are observed facts and stay ungated (Phase 2.4 should format `-0.0%` as `0.0%` or a "flat" label; the backend value is a true tiny number).

- [ ] **Step 1: Write the failing tests**

Replace `test_enough_history_produces_real_numbers` (lines 254-263) with:

```python
    def test_enough_history_produces_real_numbers(self):
        summary = metrics.risk_summary(synthetic_series(40), risk_free_annual=0.02)

        self.assertTrue(summary['has_data'])
        self.assertIsNotNone(summary['volatility'])
        self.assertEqual(len(summary['drawdown_series']), 41)
        self.assertEqual(summary['drawdown_series'][0]['date'], '2025-03-03')
        self.assertEqual(summary['risk_free_annual'], 0.02)
```

Append inside `RiskSummaryTest`:

```python
    def test_eight_days_withholds_every_annualised_statistic(self):
        summary = metrics.risk_summary(synthetic_series(8), risk_free_annual=0.02)

        self.assertTrue(summary['has_data'])
        self.assertEqual(summary['history_days'], 8)
        for key in ('expected_return', 'volatility', 'sharpe', 'sortino'):
            self.assertIsNone(summary[key], key)
        self.assertEqual(summary['needs_days']['volatility'], 22)
        self.assertEqual(summary['needs_days']['sharpe'], 357)
        self.assertIsNotNone(summary['max_drawdown'])
        self.assertEqual(len(summary['drawdown_series']), 9)

    def test_eight_days_withholds_the_monthly_statistics(self):
        summary = metrics.risk_summary(synthetic_series(8), risk_free_annual=0.02)

        self.assertIsNone(summary['best_month'])
        self.assertIsNone(summary['worst_month'])
        self.assertIsNone(summary['positive_months_pct'])
        self.assertEqual(summary['needs_days']['monthly_stats'], 81)

    def test_eight_days_keeps_the_projection_inputs_but_marks_them_unreliable(self):
        summary = metrics.risk_summary(synthetic_series(8), risk_free_annual=0.02)

        self.assertFalse(summary['inputs_reliable'])
        self.assertIsNotNone(summary['projection_inputs']['expected_return'])
        self.assertIsNotNone(summary['projection_inputs']['volatility'])

    def test_volatility_appears_exactly_at_thirty_days_but_sharpe_does_not(self):
        short = metrics.risk_summary(synthetic_series(29), risk_free_annual=0.02)
        exact = metrics.risk_summary(synthetic_series(30), risk_free_annual=0.02)

        self.assertIsNone(short['volatility'])
        self.assertIsNotNone(exact['volatility'])
        self.assertEqual(exact['needs_days']['volatility'], 0)
        self.assertIsNone(exact['sharpe'])

    def test_a_full_year_fills_every_statistic_and_trusts_the_projection(self):
        summary = metrics.risk_summary(synthetic_series(365), risk_free_annual=0.02)

        for key in ('expected_return', 'volatility', 'sharpe', 'sortino'):
            self.assertIsNotNone(summary[key], key)
        self.assertTrue(all(missing == 0 for key, missing in summary['needs_days'].items() if key != 'monthly_stats'))
        self.assertTrue(summary['inputs_reliable'])
        self.assertEqual(summary['projection_inputs']['expected_return'], summary['expected_return'])

    def test_four_hundred_days_has_monthly_statistics(self):
        summary = metrics.risk_summary(synthetic_series(400), risk_free_annual=0.02)

        self.assertIsNotNone(summary['best_month'])
        self.assertIsNotNone(summary['worst_month'])
        self.assertIsNotNone(summary['positive_months_pct'])
        self.assertEqual(summary['needs_days']['monthly_stats'], 0)

    def test_two_complete_months_are_enough_for_the_monthly_statistics(self):
        dated = [(date(2026, 1, 31), 100), (date(2026, 2, 27), 110), (date(2026, 3, 31), 99)]
        summary = metrics.risk_summary(dated, risk_free_annual=0.02)

        self.assertAlmostEqual(summary['best_month']['pct'], 10.0)
        self.assertAlmostEqual(summary['worst_month']['pct'], -10.0)
        self.assertAlmostEqual(summary['positive_months_pct'], 50.0)

    def test_a_partial_latest_month_does_not_count_as_a_complete_one(self):
        dated = [(date(2026, 1, 31), 100), (date(2026, 2, 27), 110), (date(2026, 3, 20), 99)]
        summary = metrics.risk_summary(dated, risk_free_annual=0.02)

        self.assertEqual(len(summary['monthly_returns']), 2)
        self.assertIsNone(summary['best_month'])
        self.assertIsNone(summary['positive_months_pct'])
        self.assertEqual(summary['needs_days']['monthly_stats'], 11)

    def test_no_data_branch_carries_the_new_keys(self):
        summary = metrics.risk_summary([], risk_free_annual=0.02)

        self.assertFalse(summary['has_data'])
        self.assertEqual(summary['history_days'], 0)
        self.assertFalse(summary['inputs_reliable'])
        self.assertEqual(summary['projection_inputs'], {'expected_return': None, 'volatility': None})
        self.assertIsNone(summary['needs_days']['monthly_stats'])
        self.assertEqual(summary['needs_days']['volatility'], 30)
```

Note on the partial-month case: baseline Jan 31, Feb 27 is complete (27 + 3 days crosses into March), March 20 is partial. One complete return only, so the stats are null and the missing days are `Mar 31 - Mar 20 = 11`.

Replace the body of `RiskMetricsViewTest.test_computes_risk_from_portfolio_value_history` assertions (keep the seeding) with:

```python
        self.assertTrue(response.data['has_data'])
        self.assertEqual(response.data['history_days'], 4)
        self.assertIsNone(response.data['volatility'])
        self.assertIsNotNone(response.data['projection_inputs']['volatility'])
        self.assertFalse(response.data['inputs_reliable'])
        self.assertEqual(len(response.data['drawdown_series']), 5)
```

The seeded dates are Mon 5 to Fri 9 January 2026, five weekday points spanning 4 days.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python manage.py test analytics.tests.RiskSummaryTest analytics.tests.RiskMetricsViewTest -v 2`
Expected: FAIL, `KeyError: 'history_days'` and `AssertionError: ... is not None` for volatility

- [ ] **Step 3: Implement**

In `backend/analytics/metrics.py`, add above `risk_summary`:

```python
def _month_end(year, month):
    return date(year + month // 12, month % 12 + 1, 1) - timedelta(days=1)


def monthly_stats_needs_days(dated_values):
    if not dated_values:
        return None
    first, last = dated_values[0][0], dated_values[-1][0]
    year = first.year + (first.month + 1) // 12
    month = (first.month + 1) % 12 + 1
    return max(0, (_month_end(year, month) - last).days)
```

Replace `risk_summary` with:

```python
def risk_summary(dated_values, risk_free_annual):
    """The benchmark-free Risk tab, computed from a date-ascending value series."""
    days = history.history_days(dated_values)
    needs = {
        **history.needs_days(days, history.RISK_METRICS),
        'monthly_stats': monthly_stats_needs_days(dated_values),
    }

    if len(dated_values) < MIN_DAILY_POINTS:
        return {
            'has_data': False,
            'data_quality': None,
            'sample_size': len(dated_values),
            'history_days': days,
            'inputs_reliable': False,
            'needs_days': needs,
            'projection_inputs': {'expected_return': None, 'volatility': None},
            'risk_free_annual': risk_free_annual,
            'expected_return': None,
            'volatility': None,
            'sharpe': None,
            'sortino': None,
            'max_drawdown': None,
            'current_drawdown': None,
            'positive_months_pct': None,
            'best_month': None,
            'worst_month': None,
            'drawdown_series': [],
            'monthly_returns': [],
        }

    dates = [d for d, _ in dated_values]
    values = [float(v) for _, v in dated_values]
    returns = daily_returns(values)
    dd = drawdown_series(values)
    monthly = monthly_returns(dated_values)
    complete = monthly if history.latest_month_is_complete(dates[-1]) else monthly[:-1]
    enough_months = len(complete) >= history.MIN_COMPLETE_MONTHS
    best, worst = best_worst_month(complete) if enough_months else (None, None)
    if enough_months:
        needs['monthly_stats'] = 0

    raw_expected = expected_annual_return(returns)
    raw_volatility = annualized_volatility(returns)

    return {
        'has_data': True,
        'data_quality': data_quality(len(dated_values)),
        'sample_size': len(dated_values),
        'history_days': days,
        'inputs_reliable': history.inputs_reliable(days),
        'needs_days': needs,
        'projection_inputs': {'expected_return': raw_expected, 'volatility': raw_volatility},
        'risk_free_annual': risk_free_annual,
        'expected_return': history.gate(raw_expected, days, 'expected_return'),
        'volatility': history.gate(raw_volatility, days, 'volatility'),
        'sharpe': history.gate(sharpe_ratio(returns, risk_free_annual), days, 'sharpe'),
        'sortino': history.gate(sortino_ratio(returns, risk_free_annual), days, 'sortino'),
        'max_drawdown': min(dd),
        'current_drawdown': dd[-1],
        'positive_months_pct': positive_months_pct(complete) if enough_months else None,
        'best_month': best,
        'worst_month': worst,
        'drawdown_series': [{'date': d.isoformat(), 'dd': v} for d, v in zip(dates, dd)],
        'monthly_returns': monthly,
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python manage.py test analytics -v 2`
Expected: `OK`. `test_data_quality_is_*` tests still pass (they read `data_quality`, untouched). `test_a_sale_moving_value_...` still passes (`max_drawdown` ungated).

- [ ] **Step 5: Commit**

```bash
git add backend/analytics/metrics.py backend/analytics/tests.py
git commit -m "feat: risk metrics, monthly stats and projection inputs report what history they still need"
```

---

### Task 7d: Benchmark-relative statistics gated over the aligned window

**Files:**
- Modify: `backend/analytics/metrics.py` (`_aligned_values` line ~150 and `benchmark_summary`, lines 156-200)
- Modify: `backend/analytics/tests.py` (`BenchmarkSummaryTest.test_aligns_on_common_dates_only` lines 332-348; append tests)
- Test: `backend/analytics/tests.py`

**Interfaces:**
- Consumes: `history.span_days`, `history.gate`, `history.needs_days`, `history.BENCHMARK_METRICS` (Task 7a); `synthetic_series`, `benchmark_series` (Task 7a). `report.py` needs no change: `_benchmark` and `_empty_benchmark` spread `benchmark_summary`'s dict, so the added keys flow through.
- Produces: the `benchmark` block of `/api/analytics/risk/` (keys `key`, `name`, `reason`, `has_data`, `data_quality`, `sample_size`, `expected_return`, `beta`, `tracking_error`, `information_ratio`, `jensen_alpha` unchanged), with additions:

```json
{
  "history_days": 8,
  "needs_days": {"tracking_error": 22, "beta": 82, "information_ratio": 357, "jensen_alpha": 357}
}
```

`history_days` is the span of the dates present in both series. The benchmark's own `expected_return` is gated at 365 like the portfolio's. A benchmark with a longer history than the portfolio is cut to the shared dates, so it can never lend the portfolio extra history.

- [ ] **Step 1: Write the failing tests**

In `BenchmarkSummaryTest.test_aligns_on_common_dates_only` replace the four `assertIsNotNone` lines and the closing comment/assert with:

```python
        self.assertIsNone(summary['beta'])
        self.assertIsNone(summary['tracking_error'])
        self.assertIsNone(summary['information_ratio'])
        self.assertIsNone(summary['jensen_alpha'])
        self.assertEqual(summary['data_quality'], 'low')
        self.assertEqual(summary['history_days'], 4)
```

Rename it `test_aligns_on_common_dates_only_and_withholds_short_history`. Append inside `BenchmarkSummaryTest`:

```python
    def test_thresholds_release_each_statistic_in_turn(self):
        thirty = metrics.benchmark_summary(synthetic_series(30), benchmark_series(30), 0.02)
        ninety = metrics.benchmark_summary(synthetic_series(90), benchmark_series(90), 0.02)

        self.assertIsNotNone(thirty['tracking_error'])
        self.assertIsNone(thirty['beta'])
        self.assertEqual(thirty['needs_days']['beta'], 60)
        self.assertIsNotNone(ninety['beta'])
        self.assertIsNone(ninety['information_ratio'])
        self.assertIsNone(ninety['jensen_alpha'])
        self.assertIsNone(ninety['expected_return'])

    def test_four_hundred_days_has_every_statistic(self):
        summary = metrics.benchmark_summary(synthetic_series(400), benchmark_series(400), 0.02)

        for key in ('expected_return', 'beta', 'tracking_error', 'information_ratio', 'jensen_alpha'):
            self.assertIsNotNone(summary[key], key)
        self.assertEqual(summary['history_days'], 400)
        self.assertEqual(summary['needs_days'], {
            'tracking_error': 0, 'beta': 0, 'information_ratio': 0, 'jensen_alpha': 0,
        })

    def test_a_longer_benchmark_does_not_lend_the_portfolio_history(self):
        long_bench = benchmark_series(900, start=SERIES_START - timedelta(days=500))

        summary = metrics.benchmark_summary(synthetic_series(40), long_bench, 0.02)

        self.assertEqual(summary['history_days'], 40)
        self.assertEqual(summary['sample_size'], 41)
        self.assertIsNone(summary['jensen_alpha'])
        self.assertIsNotNone(summary['tracking_error'])

    def test_no_overlap_reports_no_history(self):
        summary = metrics.benchmark_summary([], [], 0.02)
        self.assertEqual(summary['history_days'], 0)
        self.assertEqual(summary['needs_days']['beta'], 90)
```

Append to `RiskReportTest`:

```python
    @patch('analytics.report.benchmarks.eur_closes')
    def test_the_benchmark_block_carries_history_and_needs(self, mock_eur_closes):
        mock_eur_closes.return_value = benchmark_series(400)

        out = report.risk_report(synthetic_series(8), 'world')

        self.assertEqual(out['history_days'], 8)
        self.assertEqual(out['benchmark']['history_days'], 8)
        self.assertEqual(out['benchmark']['needs_days']['jensen_alpha'], 357)
        self.assertIsNone(out['benchmark']['beta'])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python manage.py test analytics.tests.BenchmarkSummaryTest analytics.tests.RiskReportTest -v 2`
Expected: FAIL, `KeyError: 'history_days'` and `AssertionError: ... is not None`

- [ ] **Step 3: Implement**

In `backend/analytics/metrics.py` replace `_aligned_values` and `benchmark_summary` with:

```python
def _aligned(dated_values_a, dated_values_b):
    """Two date-ascending series -> common dates plus same-length value lists over them."""
    by_date_a = dict(dated_values_a)
    by_date_b = dict(dated_values_b)
    common_dates = sorted(set(by_date_a) & set(by_date_b))
    return (
        common_dates,
        [float(by_date_a[d]) for d in common_dates],
        [float(by_date_b[d]) for d in common_dates],
    )


def benchmark_summary(port_dated_values, bench_dated_values, risk_free_annual):
    """Beta/tracking-error/information-ratio/Jensen-alpha against one benchmark.

    Aligned on dates present in both series - a portfolio snapshot with no
    matching benchmark bar (or vice versa) is excluded rather than guessed at.
    History is measured on that shared window, so a benchmark with a longer
    record never lends the portfolio extra days.
    """
    common_dates, port_values, bench_values = _aligned(port_dated_values, bench_dated_values)
    days = history.span_days(common_dates)
    needs = history.needs_days(days, history.BENCHMARK_METRICS)

    if len(port_values) < MIN_DAILY_POINTS:
        return {
            'has_data': False,
            'data_quality': None,
            'sample_size': len(port_values),
            'history_days': days,
            'needs_days': needs,
            'expected_return': None,
            'beta': None,
            'tracking_error': None,
            'information_ratio': None,
            'jensen_alpha': None,
        }

    port_returns = daily_returns(port_values)
    bench_returns = daily_returns(bench_values)
    port_expected = expected_annual_return(port_returns)
    bench_expected = expected_annual_return(bench_returns)
    beta_value = beta(port_returns, bench_returns)
    te = tracking_error(port_returns, bench_returns)

    return {
        'has_data': True,
        'data_quality': data_quality(len(port_values)),
        'sample_size': len(port_values),
        'history_days': days,
        'needs_days': needs,
        'expected_return': history.gate(bench_expected, days, 'expected_return'),
        'beta': history.gate(beta_value, days, 'beta'),
        'tracking_error': history.gate(te, days, 'tracking_error'),
        'information_ratio': history.gate(
            information_ratio(port_expected, bench_expected, te), days, 'information_ratio'
        ),
        'jensen_alpha': history.gate(
            jensen_alpha(port_expected, bench_expected, beta_value, risk_free_annual),
            days, 'jensen_alpha',
        ),
    }
```

`BENCHMARK_METRICS` does not include `expected_return`, so the benchmark's `needs_days` omits it (its requirement equals `information_ratio`'s).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python manage.py test analytics -v 2`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/analytics/metrics.py backend/analytics/tests.py
git commit -m "feat: benchmark-relative statistics wait for history on the window both series share"
```

---

### Task 7e: The Analytics page feeds the projection from `projection_inputs` and says when they are thin

**Files:**
- Modify: `frontend/src/pages/Analytics.jsx` (Projection call, around lines 265-268)
- Modify: `frontend/src/pages/Analytics.test.jsx` (fixture `summary` at lines 10-41; append a test)

**Interfaces:**
- Consumes: the Task 7c risk payload keys `projection_inputs.expected_return`, `projection_inputs.volatility`, `inputs_reliable`, `history_days`. `Alert` is already imported in `Analytics.jsx` (used by `DataQualityNotice`).
- Produces: nothing for later tasks. This is the minimum that keeps the Projection tab working once Task 7c nulls the top-level `expected_return` and `volatility`; the rest of the page's null handling (stat strip, risk tab, performance table `needs_days` copy) belongs to Phase 2.4.

- [ ] **Step 1: Write the failing test**

In `Analytics.test.jsx` add to the `summary` fixture (after `expected_return: 9.5,`):

```js
  history_days: 400,
  inputs_reliable: true,
  projection_inputs: { expected_return: 9.5, volatility: 12.345 },
```

Append inside `describe('Analytics', ...)`:

```js
  it('says so on the Projection tab when its inputs come from under a year of history', async () => {
    const thin = {
      ...summary,
      expected_return: null,
      volatility: null,
      history_days: 8,
      inputs_reliable: false,
      projection_inputs: { expected_return: 9.5, volatility: 12.345 },
    }
    queries.useRiskMetrics.mockReturnValue({ data: thin, isLoading: false, error: null })
    queries.usePerformance.mockReturnValue({ data: performance, isLoading: false, error: null })
    queries.usePositions.mockReturnValue({ data: positions, isLoading: false, error: null })
    stubPortfolioSummary()
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Projection' }))

    expect(screen.getByText(/only 8 days of history/i)).toBeInTheDocument()
    expect(screen.getByText('Median outcome')).toBeInTheDocument()
  })

  it('does not caveat the Projection tab once the inputs are reliable', async () => {
    stubHappyPath()
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Projection' }))

    expect(screen.queryByText(/of history, so the range/i)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/pages/Analytics.test.jsx`
Expected: FAIL on `Unable to find an element with the text: /only 8 days of history/i`

- [ ] **Step 3: Implement**

In `Analytics.jsx` replace the `tab === 'projection'` block with:

```jsx
      {tab === 'projection' && (
        summary?.total_value != null ? (
          <div className="space-y-4">
            {data.inputs_reliable === false && (
              <Alert tone="info">
                Projection inputs come from only {data.history_days} days of history, so the range
                below is illustrative, not a forecast.
              </Alert>
            )}
            <Projection
              start={summary.total_value}
              expectedReturnPct={data.projection_inputs?.expected_return}
              volatilityPct={data.projection_inputs?.volatility}
            />
          </div>
        ) : (
          <ChartPlaceholder>Loading portfolio value…</ChartPlaceholder>
        )
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/pages/Analytics.test.jsx src/components/analytics`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Analytics.jsx frontend/src/pages/Analytics.test.jsx
git commit -m "feat: the Analytics projection reads projection_inputs and flags inputs from under a year of history"
```

### Task 8: Earnings payload hygiene (session, revenue, duplicates, surprise base)

Roadmap 1.8. All changes live in `backend/research/earnings.py`; `_shape` feeds both `window_earnings` (via `_market_week`) and `symbol_earnings` (via `_fetch_calendar`), so every fix lands on both endpoints.

**Files:**
- Modify: `backend/research/earnings.py` (`_surprise`, `_shape`, `_fetch_calendar`, `_market_week`; new constants and `_dedupe`)
- Modify: `backend/research/test_earnings_shaping.py` (new test classes appended)
- Modify: `backend/research/test_earnings_calendar.py` (one dedupe-through-the-endpoint test appended to `WindowEarningsTest`)

**Interfaces:**
- Consumes: `earnings._shape(row) -> dict`, `earnings._surprise(estimate, actual)`, `finnhub.get_earnings_calendar(symbol, date_from, date_to)` (all existing).
- Produces:
  - `earnings.SESSIONS = frozenset({'bmo', 'amc', 'dmh'})`; `_shape(...)['session']` is one of `'bmo' | 'amc' | 'dmh' | None`. Anything else (empty, missing, `'--'`, `'xyz'`) is `None`, never coerced to `'amc'`. `dmh` (during market hours) is kept because the Finnhub feed really emits it and `Earnings.jsx`, `EarningsTab.jsx` and `UpcomingEarnings.jsx` already label it.
  - `_shape(...)['revenue_actual']` is `None` when the provider value is negative; `revenue_surprise_pct` is derived from the nulled value, so it is `None` too.
  - `earnings.MIN_SURPRISE_BASE = 0.01`; `_surprise` returns `None` when `abs(estimate) < MIN_SURPRISE_BASE`.
  - `earnings._dedupe(events) -> list` keyed on `(symbol, date, quarter)`; winner rule below. Applied inside `_fetch_calendar` and `_market_week` before sorting.
  - `CACHE_V` bumped `'v3'` -> `'v4'` (payload values change; old cache entries must not be served).

**Decisions to state in the PR:**
- Duplicate winner: the event with a reported `eps_actual` beats one without; then the one with more non-null fields; then the first one in provider order. Rationale: a re-listed row without an actual is the stale copy, and "first wins" on a tie is deterministic because the provider order is stable per response.
- Surprise base threshold `0.01`: for EPS, estimates below one cent are rounding noise (a $0.004 estimate and $0.20 actual would print +4,900%). For revenue (dollars) the threshold can never bind. The history endpoint `_eps_history` passes Finnhub's own `surprisePercent` through untouched and is out of scope.

- [ ] **Step 1: Write the failing tests for session, revenue and surprise base**

Append to `backend/research/test_earnings_shaping.py` (after `EarningsShapingTest`, before `WeekStatsTest`):

```python
class SessionShapingTest(TestCase):
    def test_known_sessions_pass_through_lowercased_and_trimmed(self):
        for raw, expected in (('bmo', 'bmo'), (' AMC ', 'amc'), ('dmh', 'dmh')):
            with self.subTest(raw=raw):
                self.assertEqual(earnings._shape({**RAW_EARNINGS_ROW, 'hour': raw})['session'], expected)

    def test_unknown_or_blank_sessions_are_none_never_amc(self):
        for raw in ('', None, '--', 'xyz', 'after hours'):
            with self.subTest(raw=raw):
                self.assertIsNone(earnings._shape({**RAW_EARNINGS_ROW, 'hour': raw})['session'])


class RevenueShapingTest(TestCase):
    def test_negative_revenue_actual_is_none_and_so_is_its_surprise(self):
        event = earnings._shape({**RAW_EARNINGS_ROW, 'revenueActual': -4_200_000})
        self.assertIsNone(event['revenue_actual'])
        self.assertIsNone(event['revenue_surprise_pct'])

    def test_zero_revenue_actual_is_kept(self):
        event = earnings._shape({**RAW_EARNINGS_ROW, 'revenueActual': 0})
        self.assertEqual(event['revenue_actual'], 0)
        self.assertEqual(event['revenue_surprise_pct'], -100.0)

    def test_negative_revenue_does_not_touch_the_eps_figures(self):
        event = earnings._shape({**RAW_EARNINGS_ROW, 'revenueActual': -1})
        self.assertEqual((event['eps_actual'], event['eps_surprise_pct']), (2.2, 10.0))


class SurpriseBaseTest(TestCase):
    def test_estimate_below_one_cent_has_no_surprise(self):
        self.assertIsNone(earnings._surprise(0.004, 0.20))
        self.assertIsNone(earnings._surprise(-0.009, 0.05))

    def test_estimate_at_the_threshold_still_scores(self):
        self.assertEqual(earnings._surprise(0.01, 0.02), 100.0)

    def test_shape_carries_the_null_through(self):
        event = earnings._shape({**RAW_EARNINGS_ROW, 'epsEstimate': 0.003, 'epsActual': 0.30})
        self.assertIsNone(event['eps_surprise_pct'])
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `cd backend && python manage.py test research.test_earnings_shaping -v 1`
Expected: FAIL: `test_unknown_or_blank_sessions_are_none_never_amc` (`'xyz'` comes back as `'xyz'`), `test_negative_revenue_actual_is_none_and_so_is_its_surprise`, `test_estimate_below_one_cent_has_no_surprise`, `test_shape_carries_the_null_through`.

- [ ] **Step 3: Implement**

In `backend/research/earnings.py`, change `CACHE_V = 'v3'` to `CACHE_V = 'v4'`, and replace `_surprise` and `_shape` (keep the existing comment lines above `CACHE_V` untouched):

```python
SESSIONS = frozenset({'bmo', 'amc', 'dmh'})

MIN_SURPRISE_BASE = 0.01


def _surprise(estimate, actual):
    if estimate is None or actual is None or abs(estimate) < MIN_SURPRISE_BASE:
        return None
    return round((actual - estimate) / abs(estimate) * 100, 2)


def _session(raw):
    session = (raw or '').strip().lower()
    return session if session in SESSIONS else None


def _revenue_actual(value):
    return None if value is not None and value < 0 else value


def _shape(row):
    estimate = row.get('epsEstimate')
    actual = row.get('epsActual')
    rev_estimate = row.get('revenueEstimate')
    rev_actual = _revenue_actual(row.get('revenueActual'))
    return {
        'symbol': row.get('symbol'),
        'date': row.get('date'),
        'session': _session(row.get('hour')),
        'quarter': row.get('quarter'),
        'year': row.get('year'),
        'eps_estimate': estimate,
        'eps_actual': actual,
        'revenue_estimate': rev_estimate,
        'revenue_actual': rev_actual,
        'eps_surprise_pct': _surprise(estimate, actual),
        'revenue_surprise_pct': _surprise(rev_estimate, rev_actual),
    }
```

- [ ] **Step 4: Run and confirm green**

Run: `cd backend && python manage.py test research.test_earnings_shaping research.test_earnings_calendar -v 1`
Expected: `OK` (the existing `test_surprise_is_none_when_estimate_is_zero`, `test_empty_hour_becomes_none` and the negative-estimate `-100.0` test still pass).

- [ ] **Step 5: Write the failing dedupe tests**

Append to `backend/research/test_earnings_shaping.py`:

```python
def _event(**overrides):
    base = {
        'symbol': 'AAPL', 'date': '2026-10-28', 'session': 'amc', 'quarter': 4, 'year': 2026,
        'eps_estimate': 2.0, 'eps_actual': None, 'revenue_estimate': None, 'revenue_actual': None,
        'eps_surprise_pct': None, 'revenue_surprise_pct': None,
    }
    return {**base, **overrides}


class DedupeTest(TestCase):
    def test_distinct_quarters_on_the_same_date_both_survive(self):
        events = [_event(quarter=3), _event(quarter=4)]
        self.assertEqual(len(earnings._dedupe(events)), 2)

    def test_reported_copy_beats_unreported_regardless_of_order(self):
        reported = _event(eps_actual=2.2, eps_surprise_pct=10.0)
        pending = _event()
        self.assertEqual(earnings._dedupe([pending, reported]), [reported])
        self.assertEqual(earnings._dedupe([reported, pending]), [reported])

    def test_fuller_copy_wins_when_both_are_unreported(self):
        sparse = _event(session=None, eps_estimate=None)
        full = _event()
        self.assertEqual(earnings._dedupe([sparse, full]), [full])

    def test_exact_tie_keeps_the_first_in_provider_order(self):
        first = _event(year=2026)
        second = _event(year=2027)
        self.assertEqual(earnings._dedupe([first, second]), [first])
        self.assertEqual(earnings._dedupe([second, first]), [second])

    def test_survivors_keep_first_seen_order(self):
        a, b = _event(symbol='AAPL'), _event(symbol='MSFT')
        self.assertEqual(earnings._dedupe([a, b, dict(a)]), [a, b])

    def test_a_missing_quarter_is_its_own_key(self):
        events = [_event(quarter=None), _event(quarter=None, symbol='MSFT')]
        self.assertEqual(len(earnings._dedupe(events)), 2)
```

Append inside `WindowEarningsTest` in `backend/research/test_earnings_calendar.py`:

```python
    @patch('research.earnings.finnhub.get_earnings_calendar')
    def test_duplicate_rows_for_one_symbol_date_quarter_collapse_to_the_reported_one(self, mock_cal):
        mon = self._monday().isoformat()
        mock_cal.return_value = {'earningsCalendar': [
            self._row('AAPL', mon),
            self._row('AAPL', mon, actual=1.2),
        ]}

        result = earnings.window_earnings('all', 0)

        self.assertEqual(len(result['events']), 1)
        self.assertEqual(result['events'][0]['eps_actual'], 1.2)
        self.assertEqual(result['stats']['total'], 1)
```

- [ ] **Step 6: Run and confirm they fail**

Run: `cd backend && python manage.py test research.test_earnings_shaping.DedupeTest research.test_earnings_calendar -v 1`
Expected: FAIL with `AttributeError: module 'research.earnings' has no attribute '_dedupe'` and the calendar test failing on `len(result['events'])` being 2.

- [ ] **Step 7: Implement `_dedupe` and wire it in**

In `backend/research/earnings.py`, add after `_shape`:

```python
def _completeness(event):
    return (event['eps_actual'] is not None, sum(value is not None for value in event.values()))


def _dedupe(events):
    best = {}
    for event in events:
        key = (event['symbol'], event['date'], event['quarter'])
        held = best.get(key)
        if held is None or _completeness(event) > _completeness(held):
            best[key] = event
    return list(best.values())
```

`dict` preserves the insertion position of a key when its value is replaced, so survivors keep first-seen order. Then replace the shaping lines in the two fetchers.

In `_fetch_calendar`, replace `shaped = (_shape(row) for row in rows)` with `shaped = _dedupe([_shape(row) for row in rows])`.

In `_market_week`, replace `shaped = (_shape(row) for row in rows)` with `shaped = _dedupe([_shape(row) for row in rows])`.

- [ ] **Step 8: Run the whole research suite**

Run: `cd backend && python manage.py test research -v 1`
Expected: `OK`.

- [ ] **Step 9: Commit**

```bash
git add backend/research/earnings.py backend/research/test_earnings_shaping.py backend/research/test_earnings_calendar.py
git commit -m "fix: earnings emit explicit sessions, drop negative revenue actuals and duplicate rows, skip surprise on a near-zero estimate"
```

---

### Task 9: Research news text hygiene and cap

Roadmap 1.9. The shaping function is `finnhub._to_news_item`; `finnhub.news(symbol)` caps and caches. Verified: today nothing strips markup or decodes entities, so both defects come straight from the provider. `NEWS_MAX_ITEMS` already exists (value 40); this task lowers it to 30 and bumps the news cache key so entries shaped by the old code are not served.

**Files:**
- Modify: `backend/research/finnhub.py` (`import html, re`; `NEWS_MAX_ITEMS`; new `_clean_text`; `_to_news_item`; `news` cache key)
- Create: `backend/research/test_news_shaping.py`

**Interfaces:**
- Consumes: `finnhub._to_news_item(row)`, `finnhub.news(symbol)`, `finnhub.get_company_news(...)` (existing; the view `CompanyNewsView` at `/api/research/news/<symbol>/` is unchanged).
- Produces:
  - `finnhub._clean_text(value) -> str`: replaces each HTML tag with a single space, then `html.unescape`, then collapses whitespace runs and trims. `None` and non-strings give `''`. Tags are stripped before decoding so an entity-encoded `&lt;b&gt;` survives as literal text instead of being re-parsed as markup.
  - `_to_news_item(row)['headline']` and `['summary']` go through `_clean_text`.
  - `finnhub.NEWS_MAX_ITEMS = 30`.
  - News cache key `research:news:v2:{symbol}:{date}`.

- [ ] **Step 1: Write the failing tests**

Create `backend/research/test_news_shaping.py`:

```python
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings

from . import finnhub

LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}

RAW_ROW = {
    'category': 'company', 'datetime': 1_760_000_000, 'id': 7,
    'image': 'https://example.com/x.png', 'related': 'SPY', 'source': 'Yahoo',
    'url': 'https://example.com/story',
    'headline': 'Is the SPDR S&amp;P 500 ETF a buy?',
    'summary': '',
}


class CleanTextTest(TestCase):
    def test_decodes_named_and_numeric_entities(self):
        self.assertEqual(finnhub._clean_text('SPDR S&amp;P 500 ETF'), 'SPDR S&P 500 ETF')
        self.assertEqual(finnhub._clean_text('Apple&#39;s &quot;Pro&quot; push'), 'Apple\'s "Pro" push')
        self.assertEqual(finnhub._clean_text('Q3&nbsp;beat'), 'Q3 beat')

    def test_a_tag_boundary_becomes_a_space(self):
        self.assertEqual(
            finnhub._clean_text("<b>Key Takeaways</b>Morgan Stanley's view"),
            "Key Takeaways Morgan Stanley's view",
        )
        self.assertEqual(finnhub._clean_text('one<br/>two<p>three</p>'), 'one two three')

    def test_whitespace_runs_collapse_and_ends_are_trimmed(self):
        self.assertEqual(finnhub._clean_text('  a \n\n b\t c  '), 'a b c')

    def test_encoded_markup_is_text_not_a_tag(self):
        self.assertEqual(finnhub._clean_text('Use &lt;b&gt; carefully'), 'Use <b> carefully')

    def test_none_and_non_strings_are_empty(self):
        self.assertEqual(finnhub._clean_text(None), '')
        self.assertEqual(finnhub._clean_text(42), '')

    def test_plain_text_is_untouched(self):
        self.assertEqual(finnhub._clean_text('Apple ships a thing'), 'Apple ships a thing')


class NewsItemShapingTest(TestCase):
    def test_headline_and_summary_are_cleaned(self):
        item = finnhub._to_news_item({
            **RAW_ROW,
            'summary': "<p>Key Takeaways</p>Morgan Stanley&#x27;s analysts say S&amp;P earnings&nbsp;rise.",
        })
        self.assertEqual(item['headline'], 'Is the SPDR S&P 500 ETF a buy?')
        self.assertEqual(item['summary'], "Key Takeaways Morgan Stanley's analysts say S&P earnings rise.")

    def test_missing_summary_is_an_empty_string(self):
        item = finnhub._to_news_item({k: v for k, v in RAW_ROW.items() if k != 'summary'})
        self.assertEqual(item['summary'], '')

    def test_source_and_url_are_left_alone(self):
        item = finnhub._to_news_item({**RAW_ROW, 'url': 'https://example.com/a?x=1&amp;y=2'})
        self.assertEqual(item['url'], 'https://example.com/a?x=1&amp;y=2')
        self.assertEqual(item['source'], 'Yahoo')


@override_settings(CACHES=LOCMEM, FINNHUB_API_KEY='test-key')
class NewsCapTest(TestCase):
    def setUp(self):
        cache.clear()

    @patch('research.finnhub.get_company_news')
    def test_list_is_capped_at_the_newest_news_max_items(self, mock_news):
        total = finnhub.NEWS_MAX_ITEMS + 5
        mock_news.return_value = [
            {**RAW_ROW, 'id': i, 'datetime': 1_760_000_000 + i, 'headline': f'story {i}'}
            for i in range(total)
        ]

        items = finnhub.news('SPY')['items']

        self.assertEqual(finnhub.NEWS_MAX_ITEMS, 30)
        self.assertEqual(len(items), 30)
        self.assertEqual(items[0]['headline'], f'story {total - 1}')
        self.assertEqual(items[-1]['headline'], f'story {total - 30}')

    @patch('research.finnhub.get_company_news')
    def test_entities_are_decoded_end_to_end(self, mock_news):
        mock_news.return_value = [RAW_ROW]
        self.assertEqual(finnhub.news('SPY')['items'][0]['headline'], 'Is the SPDR S&P 500 ETF a buy?')
```

- [ ] **Step 2: Run and confirm failure**

Run: `cd backend && python manage.py test research.test_news_shaping -v 1`
Expected: FAIL: `AttributeError: module 'research.finnhub' has no attribute '_clean_text'` for `CleanTextTest`; `NewsItemShapingTest`/`NewsCapTest` fail on raw `&amp;` and on `len(items) == 40`.

- [ ] **Step 3: Implement**

In `backend/research/finnhub.py` imports, add `import html` and `import re` (alphabetical: `html`, `logging`, `re`, `statistics`):

```python
import html
import logging
import re
import statistics
```

Change `NEWS_MAX_ITEMS = 40` to `NEWS_MAX_ITEMS = 30`.

Replace `_to_news_item` and add `_clean_text` above it:

```python
_TAG = re.compile(r'<[^>]*>')


def _clean_text(value):
    if not isinstance(value, str):
        return ''
    return ' '.join(html.unescape(_TAG.sub(' ', value)).split())


def _to_news_item(row):
    ts = row.get('datetime')
    return {
        'id': row.get('id'),
        'datetime': datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None,
        'headline': _clean_text(row.get('headline', '')),
        'source': row.get('source', ''),
        'summary': _clean_text(row.get('summary', '')),
        'url': row.get('url', ''),
    }
```

In `news()`, change the cache key to `key = f'research:news:v2:{symbol}:{today.isoformat()}'`.

- [ ] **Step 4: Run and confirm green**

Run: `cd backend && python manage.py test research.test_news_shaping research.test_views research.test_finnhub_client -v 1`
Expected: `OK` (existing `CompanyNewsViewTest` still passes: its headlines are plain `'older'`/`'newer'`).

- [ ] **Step 5: Commit**

```bash
git add backend/research/finnhub.py backend/research/test_news_shaping.py
git commit -m "fix: research news decodes HTML entities, separates stripped tags and caps at 30"
```

---

### Task 10: Phase gate

**Files:** none.

- [ ] **Step 1: Full backend suite**

Run: `cd backend && source .venv/bin/activate && python manage.py test`
Expected: `OK`, no failures.

- [ ] **Step 2: Migration state**

Run: `cd backend && python manage.py makemigrations --check --dry-run`
Expected: `No changes detected`.

- [ ] **Step 3: Human approval, then migrate the dev DB**

After the human approves the merge, run `cd backend && python manage.py migrate` and then the verification queries in Task 2a Step 8 and Task 6.

- [ ] **Step 4: Smoke the live payloads**

With the stack running, fetch each of `/api/transactions/?page_size=5`, `/api/analytics/performance/`, `/api/analytics/risk/`, the spending summary and trend, the net-worth history and the earnings week with a minted JWT and confirm: 5 rows returned, `history_days` present, no `portfolio_pct` of `0.0` where `needs_days > 0`, trend contains zero months, `bank_only_total` present, `session` is `bmo`, `amc`, `dmh` or `null`.

- [ ] **Step 5: Open the PR**

Describe in the PR body the payload additions Phase 2 will consume: `currency`, `fx_rate`, `total_eur`, `history_days`, `needs_days`, `inputs_reliable`, `projection_inputs`, `comparison_label`, `partial`, `bank_only_total`, nullable `session`.
