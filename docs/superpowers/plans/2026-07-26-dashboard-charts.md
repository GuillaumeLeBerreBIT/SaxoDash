# Dashboard History Charts Implementation Plan

> **Status: ✅ COMPLETE (2026-07-29)** — All 9 tasks implemented, tested, and committed. Backend 22/22 tests pass (`core` + `transactions`); frontend 14/14 tests pass; lint and build clean. Charts verified in-browser on the Dashboard.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a net-worth history line chart (Investments/Bank/All toggle + 1M/3M/6M/1Y/All range pills) and a monthly cash-flow bar chart to the SaxoDash Dashboard page.

**Architecture:** New `NetWorthSnapshot` Django model in the `core` app records one row per day (portfolio value, bank total, net worth), auto-created on first request each day. A new `core` API endpoint serves ranged history; a new `transactions` endpoint derives monthly inflow/outflow directly from existing `Transaction` rows. Two new self-contained React components (`NetWorthChart`, `CashFlowChart`) fetch their own data and render into the existing `Dashboard.jsx`.

**Tech Stack:** Django 6 / DRF (backend), React 19 + Recharts 3 + Vitest (frontend). No new dependencies on either side.

## Global Constraints

- No cron/scheduler: new snapshots are created on-demand ("first request of the day"), per approved spec `docs/superpowers/specs/2026-07-25-dashboard-charts-design.md`.
- No new pip or npm packages — use stdlib (`random`, `datetime`) and Django ORM features (`TruncMonth`) already available.
- Money fields use `Decimal`, matching every existing model/service in this codebase.
- All new API views rely on the project's global DRF defaults (`IsAuthenticated` + JWT) — do not add explicit `permission_classes`, none of the existing views do either.
- Reuse the existing dark-theme chart look from `frontend/src/lib/charts.js` (`chartTooltipProps`) and the existing color language already used by `Badge`/`StatCard` tones: emerald `#34d399` for investments/inflow, amber `#fbbf24` for bank, blue `#60a5fa` for totals, red `#f87171` for outflow/fees.
- Run the full existing test suites (`python manage.py test` in `backend/`, `npm test` in `frontend/`) before considering any task done — do not break existing passing tests.

---

### Task 1: `NetWorthSnapshot` model

**Files:**
- Modify: `backend/core/models.py`
- Test: `backend/core/tests.py`
- Create (generated): `backend/core/migrations/0001_initial.py`

**Interfaces:**
- Produces: `core.models.NetWorthSnapshot` with fields `date` (unique `DateField`), `portfolio_value`, `bank_total`, `net_worth` (all `DecimalField(max_digits=14, decimal_places=2)`), ordered by `date`.

- [x] **Step 1: Write the failing test**

Replace the placeholder content of `backend/core/tests.py` with:

```python
from decimal import Decimal
from datetime import date

from django.test import TestCase
from django.db.utils import IntegrityError

from core.models import NetWorthSnapshot


class NetWorthSnapshotModelTest(TestCase):
    def test_create_snapshot(self):
        snap = NetWorthSnapshot.objects.create(
            date=date(2026, 7, 25),
            portfolio_value=Decimal('10000.00'),
            bank_total=Decimal('5000.00'),
            net_worth=Decimal('15000.00'),
        )
        self.assertEqual(NetWorthSnapshot.objects.count(), 1)
        self.assertEqual(snap.net_worth, Decimal('15000.00'))

    def test_date_is_unique(self):
        NetWorthSnapshot.objects.create(
            date=date(2026, 7, 25),
            portfolio_value=Decimal('1'), bank_total=Decimal('1'), net_worth=Decimal('2'),
        )
        with self.assertRaises(IntegrityError):
            NetWorthSnapshot.objects.create(
                date=date(2026, 7, 25),
                portfolio_value=Decimal('2'), bank_total=Decimal('2'), net_worth=Decimal('4'),
            )
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test core -v 2`
Expected: FAIL/ERROR — `ImportError: cannot import name 'NetWorthSnapshot' from 'core.models'`

- [x] **Step 3: Implement the model**

Replace `backend/core/models.py` with:

```python
from django.db import models


class NetWorthSnapshot(models.Model):
    date = models.DateField(unique=True)
    portfolio_value = models.DecimalField(max_digits=14, decimal_places=2)
    bank_total = models.DecimalField(max_digits=14, decimal_places=2)
    net_worth = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        ordering = ['date']

    def __str__(self):
        return f'{self.date} net_worth={self.net_worth}'
```

- [x] **Step 4: Generate and apply the migration**

Run:
```bash
cd backend
python manage.py makemigrations core
python manage.py migrate
```
Expected: `Migrations for 'core': core/migrations/0001_initial.py ... Create model NetWorthSnapshot`, then `Applying core.0001_initial... OK`

- [x] **Step 5: Run test to verify it passes**

Run: `cd backend && python manage.py test core -v 2`
Expected: `Ran 2 tests ... OK`

- [x] **Step 6: Commit**

```bash
git add backend/core/models.py backend/core/tests.py backend/core/migrations/0001_initial.py
git commit -m "feat: add NetWorthSnapshot model"
```

---

### Task 2: `ensure_todays_snapshot()` service

**Files:**
- Create: `backend/core/services.py`
- Test: `backend/core/tests.py`

**Interfaces:**
- Consumes: `portfolio.services.get_positions_total_value()` → `Decimal`; `accounts.services.get_total_bank_balance()` → `Decimal`.
- Produces: `core.services.ensure_todays_snapshot()` → `NetWorthSnapshot` (creates today's row if missing, otherwise returns the existing one; idempotent).

- [x] **Step 1: Write the failing test**

Add to `backend/core/tests.py`:

```python
from django.utils import timezone

from core.services import ensure_todays_snapshot
from portfolio.models import Position
from accounts.models import BankAccount


class EnsureTodaysSnapshotTest(TestCase):
    def setUp(self):
        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('150.00'),
            sector='Technology', type='STOCK', color='#76b900',
        )
        BankAccount.objects.create(
            bank='KBC', type='Checking', iban_masked='BE68 1234',
            balance=Decimal('2500.00'), available=Decimal('2500.00'),
        )

    def test_creates_snapshot_with_current_totals(self):
        snap = ensure_todays_snapshot()
        self.assertEqual(snap.date, timezone.localdate())
        self.assertEqual(snap.portfolio_value, Decimal('1500.00'))
        self.assertEqual(snap.bank_total, Decimal('2500.00'))
        self.assertEqual(snap.net_worth, Decimal('4000.00'))

    def test_is_idempotent_for_same_day(self):
        ensure_todays_snapshot()
        ensure_todays_snapshot()
        self.assertEqual(NetWorthSnapshot.objects.count(), 1)
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test core -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'core.services'`

- [x] **Step 3: Implement the service**

Create `backend/core/services.py`:

```python
from django.utils import timezone

from portfolio.services import get_positions_total_value
from accounts.services import get_total_bank_balance

from .models import NetWorthSnapshot


def ensure_todays_snapshot():
    today = timezone.localdate()
    snapshot = NetWorthSnapshot.objects.filter(date=today).first()
    if snapshot:
        return snapshot

    portfolio_value = get_positions_total_value()
    bank_total = get_total_bank_balance()
    return NetWorthSnapshot.objects.create(
        date=today,
        portfolio_value=portfolio_value,
        bank_total=bank_total,
        net_worth=portfolio_value + bank_total,
    )
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test core -v 2`
Expected: `Ran 4 tests ... OK`

- [x] **Step 5: Commit**

```bash
git add backend/core/services.py backend/core/tests.py
git commit -m "feat: add ensure_todays_snapshot service"
```

---

### Task 3: Net worth history API endpoint

**Files:**
- Create: `backend/core/serializers.py`
- Modify: `backend/core/views.py`
- Create: `backend/core/urls.py`
- Modify: `backend/backend/urls.py`
- Test: `backend/core/tests.py`

**Interfaces:**
- Consumes: `core.services.ensure_todays_snapshot()`, `core.models.NetWorthSnapshot`.
- Produces: `GET /api/core/net-worth-history/?range=1M|3M|6M|1Y|ALL` → `200` list of `{date, portfolio_value, bank_total, net_worth}` ordered by date ascending. Missing/unknown `range` defaults to `ALL`.

- [x] **Step 1: Write the failing test**

Add to `backend/core/tests.py`:

```python
from datetime import timedelta

from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken


class NetWorthHistoryAPITest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

        today = timezone.localdate()
        for days_ago in [400, 200, 60, 10, 0]:
            NetWorthSnapshot.objects.create(
                date=today - timedelta(days=days_ago),
                portfolio_value=Decimal('1000.00'),
                bank_total=Decimal('500.00'),
                net_worth=Decimal('1500.00'),
            )

    def test_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/core/net-worth-history/')
        self.assertEqual(response.status_code, 401)

    def test_all_range_returns_every_snapshot(self):
        response = self.client.get('/api/core/net-worth-history/?range=ALL')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)

    def test_1m_range_filters_to_last_30_days(self):
        response = self.client.get('/api/core/net-worth-history/?range=1M')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)  # days_ago 10 and 0

    def test_missing_range_defaults_to_all(self):
        response = self.client.get('/api/core/net-worth-history/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)

    def test_results_ordered_by_date_ascending(self):
        response = self.client.get('/api/core/net-worth-history/?range=ALL')
        dates = [row['date'] for row in response.data]
        self.assertEqual(dates, sorted(dates))
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test core -v 2`
Expected: FAIL — `404` (no such URL) since `core.urls` doesn't exist yet.

- [x] **Step 3: Implement serializer, view, and URLs**

Create `backend/core/serializers.py`:

```python
from rest_framework import serializers

from .models import NetWorthSnapshot


class NetWorthSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = NetWorthSnapshot
        fields = ['date', 'portfolio_value', 'bank_total', 'net_worth']
```

Replace `backend/core/views.py` with:

```python
from datetime import timedelta

from django.utils import timezone
from rest_framework.views import APIView, Response

from .models import NetWorthSnapshot
from .serializers import NetWorthSnapshotSerializer
from .services import ensure_todays_snapshot

RANGE_DAYS = {'1M': 30, '3M': 91, '6M': 182, '1Y': 365}


class NetWorthHistoryView(APIView):

    def get(self, request):
        ensure_todays_snapshot()

        range_param = request.query_params.get('range', 'ALL')
        queryset = NetWorthSnapshot.objects.all()

        days = RANGE_DAYS.get(range_param)
        if days is not None:
            cutoff = timezone.localdate() - timedelta(days=days)
            queryset = queryset.filter(date__gte=cutoff)

        serializer = NetWorthSnapshotSerializer(queryset, many=True)
        return Response(serializer.data)
```

Create `backend/core/urls.py`:

```python
from django.urls import path

from .views import NetWorthHistoryView

urlpatterns = [
    path('net-worth-history/', NetWorthHistoryView.as_view(), name='net-worth-history'),
]
```

In `backend/backend/urls.py`, add the include alongside the other apps:

```python
    path('api/core/', include('core.urls')),
```
(placed after the existing `path('api/portfolio/', ...)` line, before `api/transactions/`)

- [x] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test core -v 2`
Expected: `Ran 9 tests ... OK`

- [x] **Step 5: Commit**

```bash
git add backend/core/serializers.py backend/core/views.py backend/core/urls.py backend/backend/urls.py backend/core/tests.py
git commit -m "feat: add net worth history API endpoint"
```

---

### Task 4: Seed demo data with a year of snapshot history

**Files:**
- Modify: `backend/core/management/commands/seed_demo_data.py`

**Interfaces:**
- Consumes: `core.models.NetWorthSnapshot`, `portfolio.services.get_positions_total_value()`, `accounts.services.get_total_bank_balance()`.
- Produces: 365 `NetWorthSnapshot` rows (one per day, ending today) each time the command runs, replacing any prior snapshots.

- [x] **Step 1: Write the failing test**

There is no dedicated test file for this management command yet. Add one at `backend/core/tests.py`:

```python
from django.core.management import call_command


class SeedDemoDataSnapshotsTest(TestCase):
    def test_seed_creates_a_year_of_snapshots(self):
        call_command('seed_demo_data')

        self.assertEqual(NetWorthSnapshot.objects.count(), 365)

        today = timezone.localdate()
        latest = NetWorthSnapshot.objects.get(date=today)
        self.assertEqual(latest.portfolio_value, get_positions_total_value())
        self.assertEqual(latest.bank_total, get_total_bank_balance())

    def test_seed_is_idempotent(self):
        call_command('seed_demo_data')
        call_command('seed_demo_data')
        self.assertEqual(NetWorthSnapshot.objects.count(), 365)
```

Add the two missing imports at the top of `backend/core/tests.py`:
```python
from portfolio.services import get_positions_total_value
from accounts.services import get_total_bank_balance
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test core -v 2`
Expected: FAIL — `NetWorthSnapshot.objects.count()` is `0`, since the seed command doesn't create snapshots yet.

- [x] **Step 3: Implement the backfill**

In `backend/core/management/commands/seed_demo_data.py`, add the import and a generator function, then call it from `handle()`.

Add to the imports at the top:
```python
import random
from datetime import timedelta

from core.models import NetWorthSnapshot
from portfolio.services import get_positions_total_value
from accounts.services import get_total_bank_balance
```

Add this function after the `BANK_ACCOUNTS` list (before `class Command`):

```python
def build_networth_snapshots(portfolio_target, bank_target, days=365):
    rng = random.Random(42)
    today = date.today()

    def walk(target, start_ratio, noise_pct, jump_chance=0.0, jump_range=(0, 0)):
        values = []
        v = target * Decimal(str(start_ratio))
        for i in range(days):
            remaining = max(days - i, 1)
            drift = (target - v) / Decimal(remaining)
            noise = v * Decimal(str(rng.uniform(-noise_pct, noise_pct)))
            jump = Decimal('0')
            if jump_chance and rng.random() < jump_chance:
                jump = Decimal(str(rng.uniform(*jump_range)))
            v = max(v + drift + noise + jump, Decimal('0'))
            values.append(v)
        values[-1] = target
        return values

    portfolio_values = walk(portfolio_target, 0.62, 0.015)
    bank_values = walk(bank_target, 0.75, 0.01, jump_chance=0.06, jump_range=(-300, 500))

    snapshots = []
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        pv = portfolio_values[i].quantize(Decimal('0.01'))
        bv = bank_values[i].quantize(Decimal('0.01'))
        snapshots.append(NetWorthSnapshot(date=d, portfolio_value=pv, bank_total=bv, net_worth=pv + bv))
    return snapshots
```

In `Command.handle()`, add the delete at the top and the creation after the existing bulk-creates:

```python
    @transaction.atomic
    def handle(self, *args, **options):
        Position.objects.all().delete()
        Transaction.objects.all().delete()
        BankAccount.objects.all().delete()
        NetWorthSnapshot.objects.all().delete()

        Position.objects.bulk_create([Position(**p) for p in POSITIONS])
        Transaction.objects.bulk_create([Transaction(**t) for t in TRANSACTIONS])
        BankAccount.objects.bulk_create([BankAccount(**b) for b in BANK_ACCOUNTS])

        snapshots = build_networth_snapshots(
            get_positions_total_value(), get_total_bank_balance(),
        )
        NetWorthSnapshot.objects.bulk_create(snapshots)

        self.stdout.write(self.style.SUCCESS(
            f'Seeded {len(POSITIONS)} positions, {len(TRANSACTIONS)} transactions, '
            f'{len(BANK_ACCOUNTS)} bank accounts, {len(snapshots)} net worth snapshots.'
        ))
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test core -v 2`
Expected: `Ran 11 tests ... OK`

- [x] **Step 5: Re-seed the actual dev database**

Run: `cd backend && python manage.py seed_demo_data`
Expected: `Seeded 6 positions, 13 transactions, 4 bank accounts, 365 net worth snapshots.`

- [x] **Step 6: Commit**

```bash
git add backend/core/management/commands/seed_demo_data.py backend/core/tests.py
git commit -m "feat: backfill a year of demo net worth snapshots"
```

---

### Task 5: Monthly cash flow API endpoint

**Files:**
- Create: `backend/transactions/services.py`
- Modify: `backend/transactions/views.py`
- Modify: `backend/transactions/urls.py`
- Test: `backend/transactions/tests.py`

**Interfaces:**
- Produces: `transactions.services.get_monthly_cash_flow()` → list of `{month: 'YYYY-MM', inflow: Decimal, outflow: Decimal}` ordered by month ascending. `GET /api/transactions/cash-flow/` → same shape as JSON, `200`, auth required.

- [x] **Step 1: Write the failing test**

Read the existing `backend/transactions/tests.py` first to match its imports/style, then append:

```python
from decimal import Decimal
from datetime import date

from transactions.services import get_monthly_cash_flow
from transactions.models import Transaction


class MonthlyCashFlowServiceTest(TestCase):
    def setUp(self):
        Transaction.objects.create(
            date=date(2026, 6, 1), type='DEPOSIT', instrument='Cash Deposit',
            ticker='-', qty=Decimal('1'), price=Decimal('1000.00'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 6, 15), type='DIVIDEND', instrument='NVIDIA Corporation',
            ticker='NVDA', qty=Decimal('1'), price=Decimal('50.00'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 6, 20), type='FEE', instrument='Brokerage Fee',
            ticker='-', qty=Decimal('1'), price=Decimal('10.00'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 6, 10), type='BUY', instrument='NVIDIA Corporation',
            ticker='NVDA', qty=Decimal('2'), price=Decimal('700.00'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 7, 5), type='DEPOSIT', instrument='Cash Deposit',
            ticker='-', qty=Decimal('1'), price=Decimal('300.00'), account='Saxo',
        )

    def test_groups_by_month_and_sums_inflow_outflow(self):
        result = get_monthly_cash_flow()
        by_month = {row['month']: row for row in result}

        self.assertEqual(by_month['2026-06']['inflow'], Decimal('1050.00'))
        self.assertEqual(by_month['2026-06']['outflow'], Decimal('10.00'))
        self.assertEqual(by_month['2026-07']['inflow'], Decimal('300.00'))
        self.assertEqual(by_month['2026-07']['outflow'], Decimal('0'))

    def test_ordered_by_month_ascending(self):
        result = get_monthly_cash_flow()
        months = [row['month'] for row in result]
        self.assertEqual(months, sorted(months))


class CashFlowAPITest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        Transaction.objects.create(
            date=date(2026, 6, 1), type='DEPOSIT', instrument='Cash Deposit',
            ticker='-', qty=Decimal('1'), price=Decimal('500.00'), account='Saxo',
        )

    def test_requires_auth(self):
        self.client.credentials()
        response = self.client.get('/api/transactions/cash-flow/')
        self.assertEqual(response.status_code, 401)

    def test_returns_monthly_rows(self):
        response = self.client.get('/api/transactions/cash-flow/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [
            {'month': '2026-06', 'inflow': '500.00', 'outflow': '0.00'},
        ])
```

`User`, `APITestCase`, `RefreshToken`, `TestCase`, `date`, and `Decimal` are already imported at the top of `backend/transactions/tests.py` — no new imports needed for this file.

- [x] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test transactions -v 2`
Expected: FAIL — `ModuleNotFoundError: No module named 'transactions.services'`

- [x] **Step 3: Implement the service, view, and URL**

Create `backend/transactions/services.py`:

```python
from decimal import Decimal

from django.db.models import Sum, Case, When, F, DecimalField
from django.db.models.functions import TruncMonth

from .models import Transaction

AMOUNT = F('qty') * F('price')
MONEY_FIELD = DecimalField(max_digits=14, decimal_places=2)


def get_monthly_cash_flow():
    rows = (
        Transaction.objects
        .annotate(month=TruncMonth('date'))
        .values('month')
        .annotate(
            inflow=Sum(
                Case(
                    When(type__in=['DEPOSIT', 'DIVIDEND'], then=AMOUNT),
                    default=Decimal('0'),
                    output_field=MONEY_FIELD,
                )
            ),
            outflow=Sum(
                Case(
                    When(type='FEE', then=AMOUNT),
                    default=Decimal('0'),
                    output_field=MONEY_FIELD,
                )
            ),
        )
        .order_by('month')
    )

    return [
        {
            'month': row['month'].strftime('%Y-%m'),
            'inflow': row['inflow'] or Decimal('0'),
            'outflow': row['outflow'] or Decimal('0'),
        }
        for row in rows
    ]
```

Add to `backend/transactions/views.py`:

```python
from rest_framework.views import APIView, Response
from .services import get_monthly_cash_flow


class CashFlowView(APIView):

    def get(self, request):
        return Response(get_monthly_cash_flow())
```

Replace `backend/transactions/urls.py` with:

```python
from django.urls import path
from .views import TransactionListView, CashFlowView

urlpatterns = [
    path('', TransactionListView.as_view(), name='transaction-list'),
    path('cash-flow/', CashFlowView.as_view(), name='cash-flow'),
]
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd backend && python manage.py test transactions -v 2`
Expected: `OK` with all tests (existing + 4 new) passing.

- [x] **Step 5: Commit**

```bash
git add backend/transactions/services.py backend/transactions/views.py backend/transactions/urls.py backend/transactions/tests.py
git commit -m "feat: add monthly cash flow API endpoint"
```

---

### Task 6: Frontend API client functions

**Files:**
- Modify: `frontend/src/api/client.js`
- Test: `frontend/src/api/client.test.js`

**Interfaces:**
- Produces: `getNetWorthHistory(range = 'ALL')` → `Promise<Array<{date, portfolio_value, bank_total, net_worth}>>`; `getCashFlow()` → `Promise<Array<{month, inflow, outflow}>>`.

- [x] **Step 1: Write the failing test**

Add to `frontend/src/api/client.test.js` (extend the existing imports at the top and add a new `describe` block):

```js
import {
  login,
  logout,
  isAuthenticated,
  getUsername,
  getPositions,
  getNetWorthHistory,
  getCashFlow,
} from './client'
```

```js
describe('getNetWorthHistory / getCashFlow', () => {
  it('requests net worth history with the given range', async () => {
    localStorage.setItem('access', 'valid-access')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse([{ date: '2026-07-01', net_worth: '1000.00' }]))

    const result = await getNetWorthHistory('6M')

    expect(result).toEqual([{ date: '2026-07-01', net_worth: '1000.00' }])
    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/core/net-worth-history/?range=6M'),
      expect.anything()
    )
  })

  it('defaults range to ALL when not provided', async () => {
    localStorage.setItem('access', 'valid-access')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse([]))

    await getNetWorthHistory()

    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/core/net-worth-history/?range=ALL'),
      expect.anything()
    )
  })

  it('requests monthly cash flow', async () => {
    localStorage.setItem('access', 'valid-access')
    window.fetch = vi.fn().mockResolvedValue(jsonResponse([{ month: '2026-06', inflow: '500.00', outflow: '10.00' }]))

    const result = await getCashFlow()

    expect(result).toEqual([{ month: '2026-06', inflow: '500.00', outflow: '10.00' }])
    expect(window.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/transactions/cash-flow/'),
      expect.anything()
    )
  })
})
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `getNetWorthHistory is not a function` (or import error)

- [x] **Step 3: Implement the client functions**

Add to the bottom of `frontend/src/api/client.js`:

```js
export const getNetWorthHistory = (range = 'ALL') => apiFetch(`/api/core/net-worth-history/?range=${range}`)
export const getCashFlow = () => apiFetch('/api/transactions/cash-flow/')
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: all tests pass (existing 11 + 3 new = 14)

- [x] **Step 5: Commit**

```bash
git add frontend/src/api/client.js frontend/src/api/client.test.js
git commit -m "feat: add net worth history and cash flow API client functions"
```

---

### Task 7: `NetWorthChart` component

**Files:**
- Create: `frontend/src/components/NetWorthChart.jsx`

**Interfaces:**
- Consumes: `getNetWorthHistory(range)` from `../api/client`; `fmtEur` from `../lib/format`; `chartTooltipProps` from `../lib/charts`; `Card`, `CardHeader` from `./ui`.
- Produces: default export `NetWorthChart()` — a self-contained card with view toggle (Investments/Bank/All), range pills (1M/3M/6M/1Y/All), and a Recharts line chart. No props.

This component renders a chart (Recharts inside `ResponsiveContainer`, which needs real layout size) and is verified by running the app in the browser per the approved spec ("Chart components themselves are visually verified in-browser rather than deep-unit-tested"), not by an automated test — consistent with how the existing Dashboard donut chart was handled.

- [x] **Step 1: Create the component**

Create `frontend/src/components/NetWorthChart.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getNetWorthHistory } from '../api/client'
import { fmtEur } from '../lib/format'
import { chartTooltipProps } from '../lib/charts'
import { Card, CardHeader } from './ui'

const RANGES = ['1M', '3M', '6M', '1Y', 'ALL']
const VIEWS = [
  { key: 'ALL', label: 'All' },
  { key: 'INVESTMENTS', label: 'Investments' },
  { key: 'BANK', label: 'Bank' },
]

function formatAxisDate(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11.5px] px-2.5 py-1 rounded-md font-medium transition-colors ${
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

export default function NetWorthChart() {
  const [range, setRange] = useState('6M')
  const [view, setView] = useState('ALL')
  const [data, setData] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getNetWorthHistory(range)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load net worth history')
      })
    return () => {
      cancelled = true
    }
  }, [range])

  if (error) {
    return (
      <Card>
        <div className="text-red-400 text-sm">{error}</div>
      </Card>
    )
  }

  const showInvestments = view === 'ALL' || view === 'INVESTMENTS'
  const showBank = view === 'ALL' || view === 'BANK'
  const showTotal = view === 'ALL'

  return (
    <Card>
      <CardHeader
        title="Net worth history"
        subtitle="Portfolio and bank accounts over time"
        right={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-zinc-900/60 rounded-md p-0.5 border border-white/[0.06]">
              {VIEWS.map((v) => (
                <Pill key={v.key} active={view === v.key} onClick={() => setView(v.key)}>
                  {v.label}
                </Pill>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {RANGES.map((r) => (
                <Pill key={r} active={range === r} onClick={() => setRange(r)}>
                  {r}
                </Pill>
              ))}
            </div>
          </div>
        }
      />
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatAxisDate}
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
              tickFormatter={(v) => fmtEur(v, { decimals: 0 })}
            />
            <Tooltip {...chartTooltipProps} labelFormatter={formatAxisDate} formatter={(v, n) => [fmtEur(v), n]} />
            {showInvestments && (
              <Line
                type="monotone"
                dataKey="portfolio_value"
                name="Investments"
                stroke="#34d399"
                strokeWidth={showTotal ? 1.5 : 2}
                strokeOpacity={showTotal ? 0.5 : 1}
                strokeDasharray={showTotal ? '4 3' : undefined}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {showBank && (
              <Line
                type="monotone"
                dataKey="bank_total"
                name="Bank"
                stroke="#fbbf24"
                strokeWidth={showTotal ? 1.5 : 2}
                strokeOpacity={showTotal ? 0.5 : 1}
                strokeDasharray={showTotal ? '4 3' : undefined}
                dot={false}
                isAnimationActive={false}
              />
            )}
            {showTotal && (
              <Line
                type="monotone"
                dataKey="net_worth"
                name="Total"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
```

- [x] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/NetWorthChart.jsx
git commit -m "feat: add NetWorthChart component"
```

---

### Task 8: `CashFlowChart` component

**Files:**
- Create: `frontend/src/components/CashFlowChart.jsx`

**Interfaces:**
- Consumes: `getCashFlow()` from `../api/client`; `fmtEur` from `../lib/format`; `chartTooltipProps` from `../lib/charts`; `Card`, `CardHeader` from `./ui`.
- Produces: default export `CashFlowChart()` — a self-contained card with a grouped bar chart (inflow vs. outflow per month). No props.

- [x] **Step 1: Create the component**

Create `frontend/src/components/CashFlowChart.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getCashFlow } from '../api/client'
import { fmtEur } from '../lib/format'
import { chartTooltipProps } from '../lib/charts'
import { Card, CardHeader } from './ui'

export default function CashFlowChart() {
  const [data, setData] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getCashFlow()
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load cash flow')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <Card>
        <div className="text-red-400 text-sm">{error}</div>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Monthly cash flow" subtitle="Deposits & dividends vs. fees" />
      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
              tickFormatter={(v) => fmtEur(v, { decimals: 0 })}
            />
            <Tooltip {...chartTooltipProps} formatter={(v, n) => [fmtEur(v), n]} />
            <Bar dataKey="inflow" name="Inflow" fill="#34d399" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="outflow" name="Outflow" fill="#f87171" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
```

- [x] **Step 2: Lint**

Run: `cd frontend && npm run lint`
Expected: no errors

- [x] **Step 3: Commit**

```bash
git add frontend/src/components/CashFlowChart.jsx
git commit -m "feat: add CashFlowChart component"
```

---

### Task 9: Wire both charts into the Dashboard page

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`

**Interfaces:**
- Consumes: `NetWorthChart` (default export from `../components/NetWorthChart`), `CashFlowChart` (default export from `../components/CashFlowChart`).

- [x] **Step 1: Add the imports**

In `frontend/src/pages/Dashboard.jsx`, add two new imports after the existing `chartTooltipProps` import (line 8):

```jsx
import NetWorthChart from '../components/NetWorthChart'
import CashFlowChart from '../components/CashFlowChart'
```

- [x] **Step 2: Render `NetWorthChart` above the top-positions/allocation row**

Insert directly after the closing `</div>` of the stat cards grid (after line 51, before the `<div className="grid grid-cols-5 gap-4">` row) and add a bottom margin to the stat grid to match the existing spacing pattern:

```jsx
      <NetWorthChart />

```

(so it becomes: stat cards grid → `<NetWorthChart />` → the existing 5-column "Top positions / Allocation" grid)

- [x] **Step 3: Render `CashFlowChart` below the top-positions/allocation row**

Insert directly after the closing `</div>` of the "Top positions / Allocation" 5-column grid (after line 137) and before the "Recent transactions" `<Card padding={false}>` block:

```jsx
      <CashFlowChart />

```

- [x] **Step 4: Run frontend checks**

Run:
```bash
cd frontend
npm run lint
npm test
npm run build
```
Expected: lint clean, all tests pass, build succeeds.

- [x] **Step 5: Manually verify in the browser**

Run: `cd backend && python manage.py runserver` (one terminal) and `cd frontend && npm run dev` (another terminal), then open the app, log in, and on the Dashboard confirm:
- The net worth chart renders a line for the default 6M range and "All" view (three lines: solid blue Total, dashed/dim green Investments, dashed/dim amber Bank).
- Clicking "Investments" / "Bank" switches to a single solid line each.
- Clicking each range pill (1M/3M/6M/1Y/All) reloads the chart with a different date span.
- The cash flow bar chart renders monthly green/red bars matching the seeded transaction history.

- [x] **Step 6: Commit**

```bash
git add frontend/src/pages/Dashboard.jsx
git commit -m "feat: wire net worth and cash flow charts into Dashboard"
```
