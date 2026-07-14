# SaxoDash Backend (Django + DRF) Implementation Plan

> **For agentic workers:** This plan is executed in **coach mode**, per
> `AGENTS.md`. Do NOT dispatch subagents to write these files and do NOT
> edit backend files directly yourself. For each task: explain the
> pattern, walk through the code block below as a worked example, flag
> gotchas, then have the user write the file themselves in their editor.
> Move to the next step only once the user confirms they've written it,
> and verify by running the test/command shown — don't take their word
> for it, run it. Use superpowers:executing-plans as the checkpoint
> structure, but replace every "implement this" step with "coach the
> user through implementing this."
>
> **Git is hands-off**: the user commits on their own schedule. Don't run
> `git add`/`git commit` — leave "Commit" steps unchecked even once the
> rest of a task is done; they're not part of this plan's tracked state.
>
> **Progress so far**: project package is named `backend` (not
> `saxodash` — `startproject backend .` was run instead), all code
> snippets below already reflect this. Task 1 steps 1–4 are done and
> checked off; `manage.py check` passes.

**Goal:** A running Django REST Framework API serving Position,
Transaction, and BankAccount/net-worth data (seeded mock data) behind
token auth, ready for the frontend plan to consume.

**Architecture:** One Django project (config package named `backend`, matching what was actually run) with four apps —
`core` (auth + seeding), `portfolio`, `transactions`, `accounts` — each
owning one model and a thin REST API. Derived financial figures (P&L,
weight, net worth) are computed in serializers/views, never stored.

**Tech Stack:** Python 3.14 (existing venv), Django, djangorestframework,
`rest_framework.authtoken` for auth, SQLite (dev).

## Global Constraints

- Backend code is written by the user, not Claude — see the coach-mode
  note above. This applies to every task in this plan.
- All money fields are `DecimalField`, never `float` (avoids rounding
  errors in financial data).
- All list/detail endpoints live under `/api/<app>/...` and require
  `IsAuthenticated` (set as the DRF default, not per-view).
- No endpoint in this plan needs to be paginated except
  `/api/transactions/`, which uses DRF's default `PageNumberPagination`
  at `PAGE_SIZE = 20`.
- Every app's tests use `rest_framework.test.APITestCase`.

---

## File Structure

```
backend/
├── manage.py
├── requirements.txt
├── backend/                 (Django config package — named to match what was run)
│   ├── __init__.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── core/
│   ├── apps.py
│   ├── urls.py
│   ├── management/commands/seed_demo_data.py
│   └── tests.py
├── portfolio/
│   ├── models.py          Position
│   ├── services.py        get_positions_total_value()
│   ├── serializers.py     PositionSerializer
│   ├── views.py           PositionListView, PortfolioSummaryView
│   ├── urls.py
│   └── tests.py
├── transactions/
│   ├── models.py          Transaction
│   ├── serializers.py     TransactionSerializer
│   ├── views.py           TransactionListView
│   ├── urls.py
│   └── tests.py
└── accounts/
    ├── models.py           BankAccount, CashHolding
    ├── serializers.py      BankAccountSerializer
    ├── views.py            BankAccountListView, NetWorthView
    ├── urls.py
    └── tests.py
```

---

### Task 1: Django project scaffold

**Files:**
- Create: `backend/manage.py`, `backend/backend/settings.py`,
  `backend/backend/urls.py`, `backend/backend/wsgi.py`
- Create: `backend/requirements.txt`
- Create (empty stub apps, no models yet): `backend/core/`,
  `backend/portfolio/`, `backend/transactions/`, `backend/accounts/`

**Interfaces:**
- Produces: a working Django project (config package `backend`) with `core`,
  `portfolio`, `transactions`, `accounts` in `INSTALLED_APPS`, DRF
  installed and configured, SQLite at `backend/db.sqlite3`.

- [x] **Step 1: Activate the existing venv and install dependencies**

```bash
cd backend  # create this directory first if it doesn't exist: mkdir backend && cd backend
source ../venv/bin/activate
pip install django djangorestframework
pip freeze > requirements.txt
```

Expected: `requirements.txt` contains `Django==...` and
`djangorestframework==...`.

- [x] **Step 2: Start the Django project and four apps**

```bash
django-admin startproject backend .   # NOTE: project already created — this step is done
python manage.py startapp core
python manage.py startapp portfolio
python manage.py startapp transactions
python manage.py startapp accounts
```

Expected: `manage.py` at `backend/manage.py`, and four app directories
each with `models.py`, `apps.py`, `migrations/`.

- [x] **Step 3: Register apps and DRF in settings**

In `backend/backend/settings.py`, add to `INSTALLED_APPS` (after the
Django defaults):

```python
INSTALLED_APPS = [
    # ...django defaults...
    'rest_framework',
    'rest_framework.authtoken',
    'core',
    'portfolio',
    'transactions',
    'accounts',
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'PAGE_SIZE_QUERY_PARAM': 'page_size',
}
```

- [x] **Step 4: Run initial migrations and verify** (confirmed: `check` passed)

```bash
python manage.py migrate
python manage.py check
```

Expected: `check` outputs `System check identified no issues (0 silenced).`

- [ ] **Step 5: Commit** (user handles git on their own schedule — not tracked via checkbox)

```bash
git add backend/
git commit -m "chore: scaffold Django project with DRF and four apps"
```

---

### Task 2: `portfolio` app — Position model

**Files:**
- Modify: `backend/portfolio/models.py`
- Test: `backend/portfolio/tests.py`

**Interfaces:**
- Produces: `Position` model with fields `ticker`, `name`, `qty`,
  `avg_cost`, `current_price`, `sector`, `type`, `color`. `qty` is an
  integer; `avg_cost`/`current_price` are `DecimalField(max_digits=12,
  decimal_places=2)`.

- [ ] **Step 1: Write the failing test**

```python
# backend/portfolio/tests.py
from decimal import Decimal
from django.test import TestCase
from portfolio.models import Position


class PositionModelTest(TestCase):
    def test_create_position(self):
        position = Position.objects.create(
            ticker='NVDA', name='NVIDIA Corporation', qty=15,
            avg_cost=Decimal('412.30'), current_price=Decimal('875.40'),
            sector='Technology', type='STOCK', color='#76b900',
        )
        self.assertEqual(Position.objects.count(), 1)
        self.assertEqual(position.ticker, 'NVDA')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test portfolio -v 2`
Expected: FAIL — `ImportError` or `AttributeError` (no `Position` model yet).

- [ ] **Step 3: Write the model**

```python
# backend/portfolio/models.py
from django.db import models


class Position(models.Model):
    TYPE_CHOICES = [('STOCK', 'Stock'), ('ETF', 'ETF')]

    ticker = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100)
    qty = models.IntegerField()
    avg_cost = models.DecimalField(max_digits=12, decimal_places=2)
    current_price = models.DecimalField(max_digits=12, decimal_places=2)
    sector = models.CharField(max_length=50)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    color = models.CharField(max_length=7)  # hex color, e.g. #76b900

    class Meta:
        ordering = ['-ticker']

    def __str__(self):
        return self.ticker
```

- [ ] **Step 4: Make and run migrations, then run the test**

```bash
python manage.py makemigrations portfolio
python manage.py migrate
python manage.py test portfolio -v 2
```

Expected: PASS (1 test).

- [ ] **Step 5: Register with the admin site**

```python
# backend/portfolio/admin.py
from django.contrib import admin
from .models import Position

admin.site.register(Position)
```

- [ ] **Step 6: Commit**

```bash
git add backend/portfolio/
git commit -m "feat(portfolio): add Position model"
```

---

### Task 3: `portfolio` app — total-value service + serializer with computed fields

**Files:**
- Create: `backend/portfolio/services.py`
- Create: `backend/portfolio/serializers.py`
- Modify: `backend/portfolio/tests.py`

**Interfaces:**
- Consumes: `Position` model from Task 2.
- Produces: `get_positions_total_value(queryset=None) -> Decimal` in
  `services.py`. `PositionSerializer` with fields `id`, `ticker`, `name`,
  `qty`, `avg_cost`, `current_price`, `sector`, `type`, `color`, `value`,
  `cost`, `pnl`, `pnl_pct`, `weight` — the last five computed, and
  `weight` requires `context['total_value']` to be set by the caller.

- [ ] **Step 1: Write the failing test**

```python
# add to backend/portfolio/tests.py
from decimal import Decimal
from portfolio.serializers import PositionSerializer
from portfolio.services import get_positions_total_value


class PositionSerializerTest(TestCase):
    def setUp(self):
        self.p1 = Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('150.00'),
            sector='Technology', type='STOCK', color='#76b900',
        )
        self.p2 = Position.objects.create(
            ticker='AAPL', name='Apple', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('50.00'),
            sector='Technology', type='STOCK', color='#a3a3a3',
        )

    def test_total_value(self):
        total = get_positions_total_value()
        self.assertEqual(total, Decimal('2000.00'))  # 1500 + 500

    def test_computed_fields(self):
        total = get_positions_total_value()
        data = PositionSerializer(self.p1, context={'total_value': total}).data
        self.assertEqual(data['value'], Decimal('1500.00'))
        self.assertEqual(data['cost'], Decimal('1000.00'))
        self.assertEqual(data['pnl'], Decimal('500.00'))
        self.assertEqual(data['pnl_pct'], Decimal('50.00'))
        self.assertEqual(data['weight'], Decimal('75.00'))  # 1500/2000
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test portfolio -v 2`
Expected: FAIL — no `services` or `serializers` module.

- [ ] **Step 3: Write the service function**

```python
# backend/portfolio/services.py
from decimal import Decimal
from .models import Position


def get_positions_total_value(queryset=None):
    queryset = queryset if queryset is not None else Position.objects.all()
    total = sum((p.qty * p.current_price for p in queryset), Decimal('0'))
    return total
```

- [ ] **Step 4: Write the serializer**

```python
# backend/portfolio/serializers.py
from decimal import Decimal
from rest_framework import serializers
from .models import Position


class PositionSerializer(serializers.ModelSerializer):
    value = serializers.SerializerMethodField()
    cost = serializers.SerializerMethodField()
    pnl = serializers.SerializerMethodField()
    pnl_pct = serializers.SerializerMethodField()
    weight = serializers.SerializerMethodField()

    class Meta:
        model = Position
        fields = [
            'id', 'ticker', 'name', 'qty', 'avg_cost', 'current_price',
            'sector', 'type', 'color', 'value', 'cost', 'pnl', 'pnl_pct',
            'weight',
        ]

    def get_value(self, obj):
        return obj.qty * obj.current_price

    def get_cost(self, obj):
        return obj.qty * obj.avg_cost

    def get_pnl(self, obj):
        return self.get_value(obj) - self.get_cost(obj)

    def get_pnl_pct(self, obj):
        cost = self.get_cost(obj)
        if cost == 0:
            return Decimal('0')
        return (self.get_pnl(obj) / cost) * 100

    def get_weight(self, obj):
        total = self.context.get('total_value') or Decimal('1')
        return (self.get_value(obj) / total) * 100
```

- [ ] **Step 5: Run the test**

Run: `python manage.py test portfolio -v 2`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/portfolio/
git commit -m "feat(portfolio): add total-value service and computed serializer"
```

---

### Task 4: `portfolio` app — API views and URLs

**Files:**
- Create: `backend/portfolio/views.py`
- Create: `backend/portfolio/urls.py`
- Modify: `backend/backend/urls.py`
- Modify: `backend/portfolio/tests.py`

**Interfaces:**
- Consumes: `PositionSerializer`, `get_positions_total_value` from Task 3.
- Produces: `GET /api/portfolio/positions/` (list, computed fields
  included), `GET /api/portfolio/summary/` (aggregate totals +
  allocation list: `[{ticker, value, color}]`).

- [ ] **Step 1: Write the failing test**

```python
# add to backend/portfolio/tests.py
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token


class PortfolioAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        self.token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('150.00'),
            sector='Technology', type='STOCK', color='#76b900',
        )

    def test_positions_list(self):
        response = self.client.get('/api/portfolio/positions/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['weight'], Decimal('100.00'))

    def test_summary(self):
        response = self.client.get('/api/portfolio/summary/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total_value'], Decimal('1500.00'))

    def test_requires_auth(self):
        self.client.credentials()  # clear token
        response = self.client.get('/api/portfolio/positions/')
        self.assertEqual(response.status_code, 401)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test portfolio -v 2`
Expected: FAIL — 404s (no URLs wired yet).

- [ ] **Step 3: Write the views**

```python
# backend/portfolio/views.py
from decimal import Decimal
from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Position
from .serializers import PositionSerializer
from .services import get_positions_total_value


class PositionListView(generics.ListAPIView):
    queryset = Position.objects.all()
    serializer_class = PositionSerializer
    pagination_class = None  # small, fixed-size list — no pagination needed

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['total_value'] = get_positions_total_value()
        return context


class PortfolioSummaryView(APIView):
    def get(self, request):
        positions = Position.objects.all()
        total_value = get_positions_total_value(positions)
        total_cost = sum(
            (p.qty * p.avg_cost for p in positions), Decimal('0')
        )
        total_pnl = total_value - total_cost
        total_pnl_pct = (
            (total_pnl / total_cost) * 100 if total_cost else Decimal('0')
        )
        allocation = [
            {'ticker': p.ticker, 'value': p.qty * p.current_price, 'color': p.color}
            for p in positions
        ]
        return Response({
            'total_value': total_value,
            'total_cost': total_cost,
            'total_pnl': total_pnl,
            'total_pnl_pct': total_pnl_pct,
            'allocation': allocation,
        })
```

- [ ] **Step 4: Wire URLs**

```python
# backend/portfolio/urls.py
from django.urls import path
from .views import PositionListView, PortfolioSummaryView

urlpatterns = [
    path('positions/', PositionListView.as_view(), name='position-list'),
    path('summary/', PortfolioSummaryView.as_view(), name='portfolio-summary'),
]
```

```python
# backend/backend/urls.py
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/portfolio/', include('portfolio.urls')),
]
```

- [ ] **Step 5: Run the test**

Run: `python manage.py test portfolio -v 2`
Expected: PASS (5 tests total).

- [ ] **Step 6: Commit**

```bash
git add backend/portfolio/ backend/backend/urls.py
git commit -m "feat(portfolio): add positions and summary API endpoints"
```

---

### Task 5: `transactions` app — Transaction model

**Files:**
- Modify: `backend/transactions/models.py`
- Test: `backend/transactions/tests.py`

**Interfaces:**
- Produces: `Transaction` model with `date`, `type` (choices: BUY, SELL,
  DIVIDEND, DEPOSIT, FEE), `instrument`, `ticker`, `qty`, `price`,
  `account`, ordered newest-first.

- [ ] **Step 1: Write the failing test**

```python
# backend/transactions/tests.py
from decimal import Decimal
from datetime import date
from django.test import TestCase
from transactions.models import Transaction


class TransactionModelTest(TestCase):
    def test_create_transaction(self):
        tx = Transaction.objects.create(
            date=date(2026, 4, 22), type='BUY', instrument='NVIDIA Corporation',
            ticker='NVDA', qty=Decimal('5'), price=Decimal('870.20'), account='Saxo',
        )
        self.assertEqual(Transaction.objects.count(), 1)
        self.assertEqual(tx.type, 'BUY')

    def test_default_ordering_is_newest_first(self):
        older = Transaction.objects.create(
            date=date(2026, 3, 1), type='BUY', instrument='A', ticker='A',
            qty=Decimal('1'), price=Decimal('1'), account='Saxo',
        )
        newer = Transaction.objects.create(
            date=date(2026, 4, 1), type='BUY', instrument='B', ticker='B',
            qty=Decimal('1'), price=Decimal('1'), account='Saxo',
        )
        self.assertEqual(list(Transaction.objects.all()), [newer, older])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test transactions -v 2`
Expected: FAIL — no `Transaction` model.

- [ ] **Step 3: Write the model**

```python
# backend/transactions/models.py
from django.db import models


class Transaction(models.Model):
    TYPE_CHOICES = [
        ('BUY', 'Buy'), ('SELL', 'Sell'), ('DIVIDEND', 'Dividend'),
        ('DEPOSIT', 'Deposit'), ('FEE', 'Fee'),
    ]

    date = models.DateField()
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    instrument = models.CharField(max_length=100)
    ticker = models.CharField(max_length=10, blank=True, default='—')
    qty = models.DecimalField(max_digits=12, decimal_places=4)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    account = models.CharField(max_length=50, default='Saxo')

    class Meta:
        ordering = ['-date', '-id']

    def __str__(self):
        return f'{self.date} {self.type} {self.ticker}'
```

- [ ] **Step 4: Migrate and run the test**

```bash
python manage.py makemigrations transactions
python manage.py migrate
python manage.py test transactions -v 2
```

Expected: PASS (2 tests).

- [ ] **Step 5: Register with admin**

```python
# backend/transactions/admin.py
from django.contrib import admin
from .models import Transaction

admin.site.register(Transaction)
```

- [ ] **Step 6: Commit**

```bash
git add backend/transactions/
git commit -m "feat(transactions): add Transaction model"
```

---

### Task 6: `transactions` app — serializer, filtered/paginated view, URLs

**Files:**
- Create: `backend/transactions/serializers.py`
- Create: `backend/transactions/views.py`
- Create: `backend/transactions/urls.py`
- Modify: `backend/backend/urls.py`
- Modify: `backend/transactions/tests.py`

**Interfaces:**
- Consumes: `Transaction` model from Task 5.
- Produces: `GET /api/transactions/?type=BUY&date_from=2026-01-01&date_to=2026-12-31`
  — paginated (20/page), each item includes computed `total` (`qty * price`).

- [ ] **Step 1: Write the failing test**

```python
# add to backend/transactions/tests.py
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token


class TransactionAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        Transaction.objects.create(
            date=date(2026, 4, 22), type='BUY', instrument='NVIDIA Corporation',
            ticker='NVDA', qty=Decimal('5'), price=Decimal('870.20'), account='Saxo',
        )
        Transaction.objects.create(
            date=date(2026, 4, 19), type='DIVIDEND', instrument='Apple Inc.',
            ticker='AAPL', qty=Decimal('45'), price=Decimal('0.24'), account='Saxo',
        )

    def test_list_includes_computed_total(self):
        response = self.client.get('/api/transactions/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'][0]['total'], Decimal('4351.00'))

    def test_filter_by_type(self):
        response = self.client.get('/api/transactions/?type=DIVIDEND')
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['ticker'], 'AAPL')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test transactions -v 2`
Expected: FAIL — 404 (no URLs).

- [ ] **Step 3: Write the serializer**

```python
# backend/transactions/serializers.py
from rest_framework import serializers
from .models import Transaction


class TransactionSerializer(serializers.ModelSerializer):
    total = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = [
            'id', 'date', 'type', 'instrument', 'ticker', 'qty', 'price',
            'account', 'total',
        ]

    def get_total(self, obj):
        return obj.qty * obj.price
```

- [ ] **Step 4: Write the view with query-param filtering**

```python
# backend/transactions/views.py
from rest_framework import generics
from .models import Transaction
from .serializers import TransactionSerializer


class TransactionListView(generics.ListAPIView):
    serializer_class = TransactionSerializer

    def get_queryset(self):
        queryset = Transaction.objects.all()
        tx_type = self.request.query_params.get('type')
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if tx_type:
            queryset = queryset.filter(type=tx_type)
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        return queryset
```

- [ ] **Step 5: Wire URLs**

```python
# backend/transactions/urls.py
from django.urls import path
from .views import TransactionListView

urlpatterns = [
    path('', TransactionListView.as_view(), name='transaction-list'),
]
```

```python
# backend/backend/urls.py — add this line to urlpatterns
    path('api/transactions/', include('transactions.urls')),
```

- [ ] **Step 6: Run the test**

Run: `python manage.py test transactions -v 2`
Expected: PASS (4 tests total).

- [ ] **Step 7: Commit**

```bash
git add backend/transactions/ backend/backend/urls.py
git commit -m "feat(transactions): add filtered, paginated transactions endpoint"
```

---

### Task 7: `accounts` app — BankAccount and CashHolding models

**Files:**
- Modify: `backend/accounts/models.py`
- Test: `backend/accounts/tests.py`

**Interfaces:**
- Produces: `BankAccount` (`bank`, `type`, `iban_masked`, `balance`,
  `available`, `accent_color`), `CashHolding` (`amount` — single-row
  table representing uninvested cash sitting in the Saxo account).

- [ ] **Step 1: Write the failing test**

```python
# backend/accounts/tests.py
from decimal import Decimal
from django.test import TestCase
from accounts.models import BankAccount, CashHolding


class AccountModelsTest(TestCase):
    def test_create_bank_account(self):
        acc = BankAccount.objects.create(
            bank='BNP Paribas Fortis', type='Current account',
            iban_masked='BE68 •••• •••• 4821', balance=Decimal('12450.00'),
            available=Decimal('11200.00'), accent_color='#4ade80',
        )
        self.assertEqual(BankAccount.objects.count(), 1)
        self.assertEqual(acc.bank, 'BNP Paribas Fortis')

    def test_create_cash_holding(self):
        cash = CashHolding.objects.create(amount=Decimal('4120.00'))
        self.assertEqual(cash.amount, Decimal('4120.00'))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test accounts -v 2`
Expected: FAIL — no models.

- [ ] **Step 3: Write the models**

```python
# backend/accounts/models.py
from django.db import models


class BankAccount(models.Model):
    bank = models.CharField(max_length=100)
    type = models.CharField(max_length=50)
    iban_masked = models.CharField(max_length=30)
    balance = models.DecimalField(max_digits=12, decimal_places=2)
    available = models.DecimalField(max_digits=12, decimal_places=2)
    accent_color = models.CharField(max_length=7)

    def __str__(self):
        return f'{self.bank} ({self.type})'


class CashHolding(models.Model):
    """Uninvested cash sitting in the brokerage account. Single row."""
    amount = models.DecimalField(max_digits=12, decimal_places=2)
```

- [ ] **Step 4: Migrate and run the test**

```bash
python manage.py makemigrations accounts
python manage.py migrate
python manage.py test accounts -v 2
```

Expected: PASS (2 tests).

- [ ] **Step 5: Register with admin**

```python
# backend/accounts/admin.py
from django.contrib import admin
from .models import BankAccount, CashHolding

admin.site.register(BankAccount)
admin.site.register(CashHolding)
```

- [ ] **Step 6: Commit**

```bash
git add backend/accounts/
git commit -m "feat(accounts): add BankAccount and CashHolding models"
```

---

### Task 8: `accounts` app — serializer, net-worth view, URLs

**Files:**
- Create: `backend/accounts/serializers.py`
- Create: `backend/accounts/views.py`
- Create: `backend/accounts/urls.py`
- Modify: `backend/backend/urls.py`
- Modify: `backend/accounts/tests.py`

**Interfaces:**
- Consumes: `BankAccount`, `CashHolding` from Task 7;
  `get_positions_total_value` from `portfolio.services` (Task 3).
- Produces: `GET /api/accounts/` (list of bank accounts), `GET
  /api/accounts/net-worth/` (`{net_worth, portfolio_value,
  uninvested_cash, bank_total}`).

- [ ] **Step 1: Write the failing test**

```python
# add to backend/accounts/tests.py
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token
from portfolio.models import Position


class AccountsAPITest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alex', password='pw')
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        BankAccount.objects.create(
            bank='BNP Paribas Fortis', type='Current account',
            iban_masked='BE68 •••• •••• 4821', balance=Decimal('12450.00'),
            available=Decimal('11200.00'), accent_color='#4ade80',
        )
        CashHolding.objects.create(amount=Decimal('4120.00'))
        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('150.00'),
            sector='Technology', type='STOCK', color='#76b900',
        )

    def test_accounts_list(self):
        response = self.client.get('/api/accounts/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)

    def test_net_worth(self):
        response = self.client.get('/api/accounts/net-worth/')
        self.assertEqual(response.status_code, 200)
        # 1500 (portfolio) + 4120 (cash) + 12450 (bank) = 18070
        self.assertEqual(response.data['net_worth'], Decimal('18070.00'))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test accounts -v 2`
Expected: FAIL — 404 (no URLs).

- [ ] **Step 3: Write the serializer**

```python
# backend/accounts/serializers.py
from rest_framework import serializers
from .models import BankAccount


class BankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAccount
        fields = ['id', 'bank', 'type', 'iban_masked', 'balance', 'available', 'accent_color']
```

- [ ] **Step 4: Write the views**

```python
# backend/accounts/views.py
from decimal import Decimal
from django.db.models import Sum
from rest_framework import generics
from rest_framework.views import APIView
from rest_framework.response import Response
from portfolio.services import get_positions_total_value
from .models import BankAccount, CashHolding
from .serializers import BankAccountSerializer


class BankAccountListView(generics.ListAPIView):
    queryset = BankAccount.objects.all()
    serializer_class = BankAccountSerializer
    pagination_class = None


class NetWorthView(APIView):
    def get(self, request):
        portfolio_value = get_positions_total_value()
        cash = CashHolding.objects.first()
        uninvested_cash = cash.amount if cash else Decimal('0')
        bank_total = BankAccount.objects.aggregate(total=Sum('balance'))['total'] or Decimal('0')
        net_worth = portfolio_value + uninvested_cash + bank_total
        return Response({
            'net_worth': net_worth,
            'portfolio_value': portfolio_value,
            'uninvested_cash': uninvested_cash,
            'bank_total': bank_total,
        })
```

- [ ] **Step 5: Wire URLs**

```python
# backend/accounts/urls.py
from django.urls import path
from .views import BankAccountListView, NetWorthView

urlpatterns = [
    path('', BankAccountListView.as_view(), name='account-list'),
    path('net-worth/', NetWorthView.as_view(), name='net-worth'),
]
```

```python
# backend/backend/urls.py — add this line to urlpatterns
    path('api/accounts/', include('accounts.urls')),
```

- [ ] **Step 6: Run the test**

Run: `python manage.py test accounts -v 2`
Expected: PASS (4 tests total).

- [ ] **Step 7: Commit**

```bash
git add backend/accounts/ backend/backend/urls.py
git commit -m "feat(accounts): add bank accounts and net-worth endpoints"
```

---

### Task 9: `core` app — token login endpoint

**Files:**
- Modify: `backend/backend/urls.py`
- Test: `backend/core/tests.py`

**Interfaces:**
- Produces: `POST /api/auth/login/` accepting `{username, password}`,
  returning `{token}` on success (DRF's built-in
  `obtain_auth_token` view — no custom code needed, just wiring).

- [ ] **Step 1: Write the failing test**

```python
# backend/core/tests.py
from django.contrib.auth.models import User
from rest_framework.test import APITestCase


class LoginTest(APITestCase):
    def setUp(self):
        User.objects.create_user(username='alex', password='correct-horse')

    def test_login_returns_token(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'alex', 'password': 'correct-horse',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)

    def test_login_rejects_bad_password(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'alex', 'password': 'wrong',
        })
        self.assertEqual(response.status_code, 400)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test core -v 2`
Expected: FAIL — 404 (no URL yet).

- [ ] **Step 3: Wire the built-in view**

```python
# backend/backend/urls.py
from rest_framework.authtoken.views import obtain_auth_token

# add to urlpatterns:
    path('api/auth/login/', obtain_auth_token, name='api-login'),
```

- [ ] **Step 4: Run the test**

Run: `python manage.py test core -v 2`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/backend/urls.py
git commit -m "feat(core): add token login endpoint"
```

---

### Task 10: `core` app — seed_demo_data management command

**Files:**
- Create: `backend/core/management/__init__.py` (empty)
- Create: `backend/core/management/commands/__init__.py` (empty)
- Create: `backend/core/management/commands/seed_demo_data.py`
- Modify: `backend/core/tests.py`

**Interfaces:**
- Consumes: `Position`, `Transaction`, `BankAccount`, `CashHolding`
  models from Tasks 2, 5, 7.
- Produces: `python manage.py seed_demo_data` — idempotent (clears and
  re-creates rows each run), also creates the single superuser `alex`
  (password `changeme123`, printed to console, meant to be changed) if
  it doesn't already exist.

- [ ] **Step 1: Write the failing test**

```python
# add to backend/core/tests.py
from django.core.management import call_command
from django.test import TestCase
from portfolio.models import Position
from transactions.models import Transaction
from accounts.models import BankAccount, CashHolding


class SeedDemoDataTest(TestCase):
    def test_seed_creates_expected_rows(self):
        call_command('seed_demo_data')
        self.assertEqual(Position.objects.count(), 6)
        self.assertTrue(Transaction.objects.count() >= 10)
        self.assertEqual(BankAccount.objects.count(), 3)
        self.assertEqual(CashHolding.objects.count(), 1)

    def test_seed_is_idempotent(self):
        call_command('seed_demo_data')
        call_command('seed_demo_data')
        self.assertEqual(Position.objects.count(), 6)  # not 12
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test core -v 2`
Expected: FAIL — command not found.

- [ ] **Step 3: Create the management command package**

```bash
mkdir -p core/management/commands
touch core/management/__init__.py
touch core/management/commands/__init__.py
```

- [ ] **Step 4: Write the command**

```python
# backend/core/management/commands/seed_demo_data.py
from decimal import Decimal
from datetime import date
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from portfolio.models import Position
from transactions.models import Transaction
from accounts.models import BankAccount, CashHolding

POSITIONS = [
    dict(ticker='NVDA', name='NVIDIA Corporation', qty=15, avg_cost='412.30',
         current_price='875.40', sector='Technology', type='STOCK', color='#76b900'),
    dict(ticker='AAPL', name='Apple Inc.', qty=45, avg_cost='168.50',
         current_price='224.10', sector='Technology', type='STOCK', color='#a3a3a3'),
    dict(ticker='AMZN', name='Amazon.com Inc.', qty=30, avg_cost='142.80',
         current_price='198.60', sector='Consumer', type='STOCK', color='#ff9900'),
    dict(ticker='GOOGL', name='Alphabet Inc. Class A', qty=50, avg_cost='138.20',
         current_price='178.45', sector='Technology', type='STOCK', color='#4285f4'),
    dict(ticker='META', name='Meta Platforms Inc.', qty=20, avg_cost='318.40',
         current_price='512.80', sector='Technology', type='STOCK', color='#0866ff'),
    dict(ticker='XNAS', name='Xtrackers NASDAQ 100 ETF', qty=120, avg_cost='92.50',
         current_price='118.90', sector='Cloud', type='ETF', color='#3b82f6'),
]

TRANSACTIONS = [
    dict(date=date(2026, 4, 22), type='BUY', instrument='NVIDIA Corporation',
         ticker='NVDA', qty='5', price='870.20', account='Saxo'),
    dict(date=date(2026, 4, 19), type='DIVIDEND', instrument='Apple Inc.',
         ticker='AAPL', qty='45', price='0.24', account='Saxo'),
    dict(date=date(2026, 4, 15), type='SELL', instrument='Tesla Inc.',
         ticker='TSLA', qty='8', price='248.40', account='Saxo'),
    dict(date=date(2026, 4, 12), type='BUY', instrument='Meta Platforms',
         ticker='META', qty='4', price='498.10', account='Saxo'),
    dict(date=date(2026, 4, 8), type='BUY', instrument='Xtrackers NASDAQ',
         ticker='XNAS', qty='20', price='116.20', account='Saxo'),
    dict(date=date(2026, 4, 3), type='DEPOSIT', instrument='Bank transfer',
         ticker='—', qty='1', price='2000.00', account='Saxo'),
    dict(date=date(2026, 3, 28), type='BUY', instrument='Alphabet Inc.',
         ticker='GOOGL', qty='12', price='174.80', account='Saxo'),
    dict(date=date(2026, 3, 22), type='FEE', instrument='Custody fee',
         ticker='—', qty='1', price='12.50', account='Saxo'),
    dict(date=date(2026, 3, 18), type='DIVIDEND', instrument='Microsoft Corp.',
         ticker='MSFT', qty='10', price='0.75', account='Saxo'),
    dict(date=date(2026, 3, 12), type='SELL', instrument='Netflix Inc.',
         ticker='NFLX', qty='4', price='612.40', account='Saxo'),
    dict(date=date(2026, 3, 5), type='BUY', instrument='Amazon.com Inc.',
         ticker='AMZN', qty='8', price='195.40', account='Saxo'),
    dict(date=date(2026, 2, 28), type='BUY', instrument='Apple Inc.',
         ticker='AAPL', qty='10', price='218.40', account='Saxo'),
]

BANK_ACCOUNTS = [
    dict(bank='BNP Paribas Fortis', type='Current account',
         iban_masked='BE68 •••• •••• 4821', balance='12450.00',
         available='11200.00', accent_color='#4ade80'),
    dict(bank='KBC', type='Savings account', iban_masked='BE71 •••• •••• 2210',
         balance='18320.00', available='18320.00', accent_color='#60a5fa'),
    dict(bank='ING', type='Current account', iban_masked='BE44 •••• •••• 9034',
         balance='3185.00', available='3185.00', accent_color='#fb923c'),
]


class Command(BaseCommand):
    help = 'Seeds the database with SaxoDash demo data (idempotent).'

    def handle(self, *args, **options):
        Position.objects.all().delete()
        Transaction.objects.all().delete()
        BankAccount.objects.all().delete()
        CashHolding.objects.all().delete()

        for row in POSITIONS:
            Position.objects.create(**{
                **row,
                'avg_cost': Decimal(row['avg_cost']),
                'current_price': Decimal(row['current_price']),
            })

        for row in TRANSACTIONS:
            Transaction.objects.create(**{
                **row,
                'qty': Decimal(row['qty']),
                'price': Decimal(row['price']),
            })

        for row in BANK_ACCOUNTS:
            BankAccount.objects.create(**{
                **row,
                'balance': Decimal(row['balance']),
                'available': Decimal(row['available']),
            })

        CashHolding.objects.create(amount=Decimal('4120.00'))

        if not User.objects.filter(username='alex').exists():
            User.objects.create_superuser('alex', password='changeme123')
            self.stdout.write(self.style.WARNING(
                "Created superuser 'alex' with password 'changeme123' — change it."
            ))

        self.stdout.write(self.style.SUCCESS('Seeded demo data.'))
```

- [ ] **Step 5: Run the test**

Run: `python manage.py test core -v 2`
Expected: PASS (4 tests total).

- [ ] **Step 6: Run the command for real and sanity-check the API**

```bash
python manage.py seed_demo_data
python manage.py runserver
# in another terminal:
curl -X POST http://localhost:8000/api/auth/login/ -d "username=alex&password=changeme123"
# copy the returned token, then:
curl -H "Authorization: Token <token>" http://localhost:8000/api/portfolio/summary/
```

Expected: JSON with `total_value` around `2378.00` (sum of the six
seeded positions' qty × current_price).

- [ ] **Step 7: Commit**

```bash
git add backend/core/
git commit -m "feat(core): add idempotent seed_demo_data command"
```

---

## Definition of done

- `python manage.py test` passes across all four apps.
- `python manage.py seed_demo_data` populates 6 positions, 12
  transactions, 3 bank accounts, 1 cash holding, and a superuser.
- All five endpoints (`positions`, `summary`, `transactions`, `accounts`,
  `net-worth`) return `401` unauthenticated and correct data with a
  valid token.
- Ready for the frontend plan
  (`docs/superpowers/plans/2026-07-13-saxodash-frontend.md`) to consume.
