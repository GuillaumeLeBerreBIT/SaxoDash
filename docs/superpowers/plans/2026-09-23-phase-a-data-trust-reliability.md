# Phase A — Data Trust & Reliability Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the net-worth headline/delta basis mismatch, make background sync failures observable and appropriately resilient, version-control the Celery Beat schedule, give Enable Banking the same sync-freshness visibility Saxo already has, and add a safe local SQLite backup.

**Architecture:** No new subsystems. Every fix extends code that already exists (`core.services`, `portfolio.insights`, `saxo`/`enablebanking` clients+tasks, `SyncRun`/`BankSyncRun`, django-celery-beat). The money-model fix changes what one field means and adds one new field to record how a value was computed; the reliability fixes split one flat exception class into two per integration; the schedule fix adds a declarative source of truth the DB is synced from; the backup is a new, self-contained management command + task.

**Tech Stack:** Django 5 / DRF, Celery + django-celery-beat, SQLite (WAL), React 19 / Vite, Vitest, Django `TestCase`/`APITestCase`.

**Spec:** The user's Phase A brief (2026-09-23, this conversation) plus the prior strategic review's §5 (Data Trustworthiness) and §7 (Infrastructure Health) findings. No separate spec doc — the investigation below (Task 0) *is* the spec, verified directly against current code, not against prior session memory.

## Global Constraints

- No Docker, no PostgreSQL migration, no CI/CD, no Sentry, no cloud deployment, no multi-user architecture, no new generic monitoring dashboard.
- Do not remove django-celery-beat.
- Do not break any currently-scheduled job while moving the schedule into code.
- Every behavior change ships with a regression test; run the full backend suite (`python manage.py test`) and frontend suite (`npm test`) before calling any task done.
- Follow existing code style: short "why" comments only, Money/Decimal for all currency math, `logger.warning`/`logger.info` for degraded-but-handled conditions.

---

## Task 0: Investigation summary (no code changes — reference only)

This section is the "map" the brief asked for. It is already complete; later tasks implement it.

**CONCEPT → SOURCE → CALCULATION → API → UI**

| Concept | Backend source | Formula today | Consumed by |
|---|---|---|---|
| `portfolio_value` | `portfolio/services.py::get_portfolio_value()` | Saxo's `NonMarginPositionsValue` (positions only), or local Position sum if stale/unusable | `NetWorthSnapshot.portfolio_value`, `insights.value.portfolio`, `NetWorthChart` "Investments" line |
| `bank_total` | `accounts/services.py::get_total_bank_balance()` | Sum of `BankAccount.balance` (KBC/Argenta via Enable Banking) | `NetWorthSnapshot.bank_total`, `insights.value.bank`, `NetWorthChart` "Bank" line |
| `saxo_account_value` | `portfolio/services.py::get_saxo_account_value()` | Saxo's own `TotalValue` (cash **+** positions, inside Saxo only), `None` if unusable, **no fallback** | `NetWorthSnapshot.saxo_account_value`, `insights.change.*`/`insights.spark` (via `pairs`), `analytics/views.py::_portfolio_dated_values` |
| `NetWorthSnapshot.net_worth` (today) | `core/services.py::current_net_worth()` | `portfolio_value + bank_total` — **always excludes Saxo's uninvested cash** | `NetWorthHistoryView` → `NetWorthChart` "Total" line, `accounts/views.py::NetWorthView` → `Portfolio.jsx` "Total net worth", `portfolio/insights.py::build_insights()`'s live-recomputed `value.net_worth` |
| `insights.change.day/week/month/ytd/all_time` + `insights.spark` | `portfolio/insights.py::build_insights()` | Deltas of the **`saxo_account_value` series alone** — excludes `bank_total` entirely | `HeroValue` delta pills + (currently-unused) sparkline data |

**The bug, precisely:** `HeroValue` shows one headline ("Net worth" = positions + bank, *excluding* Saxo cash) directly above deltas computed from a *different* series (Saxo cash + positions, *excluding* bank), under the single caption "Change is end-of-day, from the daily net-worth snapshot." Two different quantities, presented as one number's history. A user with idle Saxo cash sees it in neither the headline's "why did this change" story nor counted at all in the "how much do I have" story it's not in.

**Decision — Option B, minimal necessary split, most complete common definition:**
- **Total Net Worth** (Dashboard headline, its deltas, `NetWorthView`, `NetWorthChart`'s "Total" line) = `bank_total + saxo_account_value` when `saxo_account_value` is available (this is *everything the user has*: bank money plus Saxo cash plus Saxo positions, and — because `saxo_account_value` is Saxo's own reconciled cash+positions figure — a BUY/SELL that only reallocates within Saxo still leaves it unchanged, preserving the original 2026-09 net-worth-defects fix). When `saxo_account_value` is unavailable right now, this falls back to `bank_total + portfolio_value` (today's formula) **explicitly flagged** as `basis: 'approximate'` rather than shown as if it were the precise figure.
- **Investment performance / risk** (Analytics) stays exactly as it is today — `saxo_account_value` alone, deliberately excluding bank money, because a paycheck landing in a bank account is not a portfolio return. This is a genuinely different question from "what am I worth," and Analytics already asks it correctly. **No change needed in `analytics/`.**
- **Breakdown figures** (`insights.value.portfolio`, `insights.value.bank`) stay as they are — useful context, not the headline.

This satisfies the requirement exactly: the headline and its adjacent deltas will describe the same quantity, and whenever they don't (approximate fallback), that is stated, not hidden.

---

## CORRECTION (found during Task 6 live verification against the real dev database) — Tasks 1–5 below were superseded

Tasks 1–5 below were written and initially implemented exactly as documented. **Live verification against the real dev database (Task 6) found they introduce a real double-counting bug**, missed by the code-only investigation above: `saxo/tasks.py::sync_account_balance` writes **two** things atomically from the same Saxo balance response - `PortfolioValuation` (which backs `saxo_account_value`) **and** a `BankAccount` row (`external_id='saxo:cash'`, `saxo.mapping.SAXO_CASH_ACCOUNT_ID`) that mirrors the identical cash figure. `accounts.services.get_total_bank_balance()` sums *every* `BankAccount` row with no exclusion, so `bank_total` **already includes Saxo's own cash**. The planned `bank_total + saxo_account_value` formula therefore double-counts that cash - confirmed empirically against the real dev DB, where it inflated net worth from the correct €1,002,831.35 to €1,973,895.99 (nearly 2x).

Working through why revealed the actual, much simpler fix: `portfolio_value + bank_total` (the **original**, pre-Phase-A formula, entirely unchanged) is *already* both complete (idle Saxo cash is counted, via the BankAccount mirror) and trade-neutral (a SELL drops `portfolio_value` and raises that same mirror, atomically, in the same sync) - given the current data model. **No new field, no "basis" concept, and no `core.models`/`core.serializers`/`accounts.views` changes were needed at all.** The only real bug was `portfolio/insights.py::build_insights()`'s `change`/`spark` series reading `saxo_account_value` alone (which excludes bank money entirely) while the headline used `portfolio_value + bank_total` - two different quantities shown together, exactly as originally diagnosed, just with a different (and much smaller) fix than Tasks 1-5 describe.

**What actually shipped, replacing Tasks 1–5:**
- `core/models.py` - **unchanged**, no `net_worth_basis` field.
- `core/services.py::current_net_worth()`/`ensure_todays_snapshot()` - **unchanged** (reverted to the original `portfolio + bank` formula after a brief detour).
- `core/serializers.py` / `accounts/views.py::NetWorthView` - **unchanged** (the `saxo_account_value` exposure and `net_worth_basis` field added then removed).
- `portfolio/insights.py::build_insights()` - the actual fix: `pairs` now reads `NetWorthSnapshot.net_worth` directly (portfolio_value + bank_total, always present, never null) instead of `saxo_account_value` alone; a new `_headline_net_worth(latest, today)` returns `latest.net_worth` when today's snapshot already exists (guaranteeing the headline equals the delta series' last point exactly, by construction) and falls back to a fresh live computation only before today's snapshot exists yet.
- Frontend (`HeroValue.jsx`, `HeroValue.test.jsx`, `NetWorthChart.jsx`, `Portfolio.jsx`, and their tests) - **fully reverted to their pre-Phase-A state**. `insights.py`'s output shape never changed (`value`/`change`/`spark` keep the same keys), so no frontend change was needed at all once the backend fix was corrected.
- A new regression test, `core.tests.CurrentNetWorthDoesNotDoubleCountSaxoCashTest`, guards specifically against reintroducing this double-count.
- The real dev database was affected during the flawed implementation (its `net_worth` migrated to the doubled figure via a data migration's `RunPython` step) and was manually repaired back to the correct `portfolio_value + bank_total` value for the two affected rows before the migration and its file were removed entirely.

**Lesson for future work on this codebase:** `saxo_account_value` and the plain sum of `BankAccount` rows are **not independent** - Saxo's cash appears in both. Any future change combining them must explicitly exclude the `SAXO_CASH_ACCOUNT_ID` mirror from one side, or use only one of the two. This was not discoverable from a code-only read (both functions look independent) - only from live data.

Tasks 1–5's original text is left below **verbatim, as a record of the flawed first design** - do not implement it. Task 6 (live verification) is what caught this, which is exactly why it was in the plan. Tasks 7 onward (Celery schedule, retry/backoff, last-sync parity, backup) are unaffected by this correction and proceed as written.

---

## Task 1 (SUPERSEDED — see correction above, not implemented as written): `NetWorthSnapshot.net_worth_basis` field + corrected `core.services`

**Files:**
- Modify: `backend/core/models.py`
- Create: `backend/core/migrations/0005_networthsnapshot_net_worth_basis.py`
- Modify: `backend/core/services.py`
- Modify: `backend/core/tests.py`

**Interfaces:**
- Produces: `NetWorthSnapshot.Basis` (`TextChoices`: `RECONCILED = 'reconciled'`, `APPROXIMATE = 'approximate'`), `NetWorthSnapshot.net_worth_basis` field (default `'approximate'` for historical-row compatibility — see migration data step). `core.services.NetWorth` namedtuple gains `saxo_account_value: Money | None` and `basis: str` fields (appended, so existing `.portfolio`/`.bank`/`.total` attribute access on all current callers is unaffected). `current_net_worth()` now returns the corrected `.total`/`.basis`.
- Consumes: `portfolio.services.get_portfolio_value()`, `portfolio.services.get_saxo_account_value()`, `accounts.services.get_total_bank_balance()` (all unchanged signatures).

- [ ] **Step 1: Write the failing tests for the corrected `current_net_worth()`**

Add to `backend/core/tests.py` (new class, placed after `MoneyTest`):

```python
class CurrentNetWorthBasisTest(TestCase):
    """The headline total must equal bank + Saxo's own cash+positions figure
    when Saxo has one - not bank + positions-only, which drops idle Saxo
    cash entirely. See docs/superpowers/plans/2026-09-23-phase-a-data-trust-reliability.md."""

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

    def test_total_is_bank_plus_saxo_account_value_when_available(self):
        # Positions alone are worth 1500.00, but 900.00 of Saxo cash is idle -
        # the old formula (portfolio_value + bank) would silently drop it.
        PortfolioValuation.objects.create(
            source=SAXO_SOURCE, currency='EUR',
            cash_balance=Decimal('900.00'),
            positions_value=Decimal('1500.00'),
            total_value=Decimal('2400.00'),
        )
        net_worth = current_net_worth()
        self.assertEqual(net_worth.total, Money(Decimal('4900.00'), 'EUR'))  # 2500 bank + 2400 saxo
        self.assertEqual(net_worth.basis, NetWorthSnapshot.Basis.RECONCILED)

    def test_total_falls_back_to_approximate_when_saxo_value_unusable(self):
        # No PortfolioValuation row at all - first run / demo data / SIM
        # never synced. portfolio_value still falls back to local marks.
        net_worth = current_net_worth()
        self.assertEqual(net_worth.total, Money(Decimal('4000.00'), 'EUR'))  # 2500 bank + 1500 positions
        self.assertEqual(net_worth.basis, NetWorthSnapshot.Basis.APPROXIMATE)

    def test_zero_bank_balance(self):
        BankAccount.objects.all().delete()
        PortfolioValuation.objects.create(
            source=SAXO_SOURCE, currency='EUR',
            cash_balance=Decimal('0'), positions_value=Decimal('1500.00'),
            total_value=Decimal('1500.00'),
        )
        net_worth = current_net_worth()
        self.assertEqual(net_worth.total, Money(Decimal('1500.00'), 'EUR'))
        self.assertEqual(net_worth.basis, NetWorthSnapshot.Basis.RECONCILED)

    def test_zero_portfolio_is_still_reconciled_from_bank_plus_saxo_cash(self):
        # All-cash Saxo account: positions_value 0, cash_balance is the whole total.
        PortfolioValuation.objects.create(
            source=SAXO_SOURCE, currency='EUR',
            cash_balance=Decimal('500.00'), positions_value=Decimal('0'),
            total_value=Decimal('500.00'),
        )
        net_worth = current_net_worth()
        self.assertEqual(net_worth.total, Money(Decimal('3000.00'), 'EUR'))  # 2500 bank + 500 saxo
        self.assertEqual(net_worth.basis, NetWorthSnapshot.Basis.RECONCILED)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python manage.py test core.tests.CurrentNetWorthBasisTest -v 2`
Expected: FAIL (`AttributeError: 'NetWorth' object has no attribute 'basis'` or similar) — `NetWorthSnapshot.Basis` doesn't exist yet either, so this will actually fail at import/collection. That's fine — implement Steps 3-4 first, matching the tests, is expected here.

- [ ] **Step 3: Add `Basis` choices + `net_worth_basis` field to the model**

In `backend/core/models.py`, replace the file with:

```python
from django.db import models


class NetWorthSnapshot(models.Model):
    class Basis(models.TextChoices):
        RECONCILED = 'reconciled', 'Reconciled (bank + Saxo cash+positions)'
        APPROXIMATE = 'approximate', 'Approximate (bank + positions only - Saxo cash unavailable)'

    date = models.DateField(unique=True)
    portfolio_value = models.DecimalField(max_digits=14, decimal_places=2)
    bank_total = models.DecimalField(max_digits=14, decimal_places=2)
    net_worth = models.DecimalField(max_digits=14, decimal_places=2)
    # Which formula produced `net_worth` for this row - RECONCILED means
    # bank_total + saxo_account_value (everything the user has); APPROXIMATE
    # means bank_total + portfolio_value, which silently excludes any idle
    # Saxo cash. Historical rows (before this field existed) default to
    # APPROXIMATE since that is what the old formula actually computed - see
    # the 0005 migration's data step for the one-time reclassification of
    # rows that do have a saxo_account_value.
    net_worth_basis = models.CharField(
        max_length=12, choices=Basis.choices, default=Basis.APPROXIMATE,
    )
    # Saxo's reconciled cash+positions total (portfolio.services.
    # get_saxo_account_value) - the return/performance series should read
    # this, not portfolio_value, which is positions-only and drops every
    # time a position is sold into cash. Null on a day the broker figure
    # wasn't usable - see get_saxo_account_value for why this has no
    # positions-only fallback the way portfolio_value does.
    saxo_account_value = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True, default=None,
    )

    class Meta:
        ordering = ['date']

    def __str__(self):
        return f'{self.date} net_worth={self.net_worth} ({self.net_worth_basis})'
```

Run: `cd backend && python manage.py makemigrations core --name networthsnapshot_net_worth_basis`

Then open the generated migration and add the data step by hand (Django's autogenerated migration only adds the field with the model default; add a second operation that recomputes `net_worth`/`net_worth_basis` for existing rows that already have a `saxo_account_value`, since those rows *can* be exactly reconciled from data already on the row — no guessing needed):

```python
from decimal import Decimal

from django.db import migrations, models


def reclassify_existing_rows(apps, schema_editor):
    NetWorthSnapshot = apps.get_model('core', 'NetWorthSnapshot')
    # Rows with a saxo_account_value can be exactly recomputed as
    # bank_total + saxo_account_value (RECONCILED) - this is not a guess,
    # it uses figures already stored on the row. Rows without one keep
    # their existing net_worth (already portfolio_value + bank_total, i.e.
    # exactly what APPROXIMATE means) and the model default already marks
    # them APPROXIMATE, so nothing to do for those.
    for snap in NetWorthSnapshot.objects.exclude(saxo_account_value__isnull=True):
        snap.net_worth = snap.bank_total + snap.saxo_account_value
        snap.net_worth_basis = 'reconciled'
        snap.save(update_fields=['net_worth', 'net_worth_basis'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_networthsnapshot_saxo_account_value'),
    ]

    operations = [
        migrations.AddField(
            model_name='networthsnapshot',
            name='net_worth_basis',
            field=models.CharField(
                choices=[
                    ('reconciled', 'Reconciled (bank + Saxo cash+positions)'),
                    ('approximate', 'Approximate (bank + positions only - Saxo cash unavailable)'),
                ],
                default='approximate', max_length=12,
            ),
        ),
        migrations.RunPython(reclassify_existing_rows, noop),
    ]
```

Rename the file to `backend/core/migrations/0005_networthsnapshot_net_worth_basis.py` if `makemigrations` picked a different number/name.

- [ ] **Step 4: Rewrite `core/services.py`**

```python
from typing import NamedTuple

from django.utils import timezone

from accounts.services import get_total_bank_balance
from portfolio.services import get_portfolio_value, get_saxo_account_value

from .models import NetWorthSnapshot
from .money import Money


class NetWorth(NamedTuple):
    portfolio: Money
    bank: Money
    saxo_account_value: Money | None
    total: Money
    basis: str


def _total_and_basis(bank, portfolio, saxo_account_value):
    """The one formula both current_net_worth() and ensure_todays_snapshot()
    use, so the live headline and the stored history can never define "total"
    two different ways. RECONCILED (bank + Saxo's own cash+positions) is
    preferred; APPROXIMATE (bank + positions only) is an explicit fallback,
    never presented as if it were the precise figure."""
    if saxo_account_value is not None:
        return bank + saxo_account_value, NetWorthSnapshot.Basis.RECONCILED
    return bank + portfolio, NetWorthSnapshot.Basis.APPROXIMATE


def current_net_worth():
    """Net worth right now, as Money in REPORTING_CURRENCY.

    One definition, shared by the snapshot and the endpoint the dashboard
    reads, so the headline figure and the chart cannot disagree.
    """
    portfolio = get_portfolio_value()
    bank = get_total_bank_balance()
    saxo_account_value = get_saxo_account_value()
    total, basis = _total_and_basis(bank, portfolio, saxo_account_value)
    return NetWorth(portfolio, bank, saxo_account_value, total, basis)


def ensure_todays_snapshot():
    """Record today's net worth, refreshing a row that already exists.

    Not create-if-absent: the day's figure is a running total until the day is
    over, so freezing it at the first call of the day meant a correction
    landing later never reached the chart.
    """
    today = timezone.localdate()
    existing = NetWorthSnapshot.objects.filter(date=today).first()

    portfolio = get_portfolio_value()
    bank = get_total_bank_balance()
    saxo_value = get_saxo_account_value()

    # A None fetch (the Saxo credential is unusable right now) must not blank
    # out a good value this same day already recorded from an earlier,
    # usable sync - a mid-day re-auth lapse should not erase real data, and
    # must not silently downgrade today's total from reconciled to
    # approximate either (see test_a_later_null_fetch_the_same_day_...).
    if saxo_value is not None:
        saxo_account_value = saxo_value
    elif existing and existing.saxo_account_value is not None:
        saxo_account_value = Money(existing.saxo_account_value, bank.currency)
    else:
        saxo_account_value = None

    total, basis = _total_and_basis(bank, portfolio, saxo_account_value)

    snapshot, _ = NetWorthSnapshot.objects.update_or_create(
        date=today,
        defaults={
            'portfolio_value': portfolio.rounded().amount,
            'bank_total': bank.rounded().amount,
            'net_worth': total.rounded().amount,
            'net_worth_basis': basis,
            'saxo_account_value': (
                saxo_account_value.rounded().amount if saxo_account_value is not None else None
            ),
        },
    )
    return snapshot
```

Note: `Money(existing.saxo_account_value, bank.currency)` assumes the snapshot's `saxo_account_value` is already in `REPORTING_CURRENCY` (true — `get_saxo_account_value()` only ever returns a value already in `REPORTING_CURRENCY`, see `portfolio/services.py::_is_usable`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && python manage.py test core.tests.CurrentNetWorthBasisTest -v 2`
Expected: PASS (4 tests)

- [ ] **Step 6: Run the full existing `core` suite to check nothing else broke**

Run: `cd backend && python manage.py test core -v 2`
Expected: some existing tests will now legitimately fail because they assert the *old* `net_worth` formula — that's Task 2's job to fix, not a regression to chase here. Note which ones fail (`EnsureTodaysSnapshotTest.test_creates_snapshot_with_current_totals`, `PortfolioValuationPreferenceTest.test_uses_saxos_own_figure_when_there_is_one`, `SnapshotRefreshesTest.test_a_later_call_the_same_day_updates_the_row`, `RepairNetWorthHistoryTest.*`) and move to Task 2.

- [ ] **Step 7: Commit**

```bash
git add backend/core/models.py backend/core/migrations/0005_networthsnapshot_net_worth_basis.py backend/core/services.py backend/core/tests.py
git commit -m "feat: define net worth as bank + Saxo's reconciled total, not bank + positions"
```

---

## Task 2 (SUPERSEDED — not implemented as written): Fix the pre-existing tests whose assumptions just changed

**Files:**
- Modify: `backend/core/tests.py`

**Why these specific tests, and why the new numbers are correct:**

- [ ] **Step 1: `EnsureTodaysSnapshotTest.test_creates_snapshot_with_current_totals`**

No `PortfolioValuation` row in this test's `setUp` → `saxo_account_value` is `None` → basis is `APPROXIMATE` → the assertion values (`net_worth == 4000.00`) are unchanged, since APPROXIMATE is exactly the old formula. Add one assertion:

```python
    def test_creates_snapshot_with_current_totals(self):
        snap = ensure_todays_snapshot()
        self.assertEqual(snap.date, timezone.localdate())
        self.assertEqual(snap.portfolio_value, Decimal('1500.00'))
        self.assertEqual(snap.bank_total, Decimal('2500.00'))
        self.assertEqual(snap.net_worth, Decimal('4000.00'))
        self.assertEqual(snap.net_worth_basis, NetWorthSnapshot.Basis.APPROXIMATE)
```

Run: `python manage.py test core.tests.EnsureTodaysSnapshotTest -v 2` → expect PASS.

- [ ] **Step 2: `PortfolioValuationPreferenceTest` — replace the misleading "Saxo" `BankAccount` fixture**

This test's `setUp` creates a `BankAccount` literally named `bank='Saxo'` with a balance equal to the `PortfolioValuation.cash_balance` it also sets up later. That is not how the app is ever populated in reality (Saxo cash is never a `BankAccount` row — only KBC/Argenta are, via Enable Banking); it was a pre-`saxo_account_value` test fixture. Under the new formula it would double-count Saxo cash once through this fake "Saxo" bank row and once through `saxo_account_value`. Rewrite using a real external bank name:

```python
class PortfolioValuationPreferenceTest(TestCase):
    def setUp(self):
        Position.objects.create(
            ticker='MSFT', name='Microsoft', qty=Decimal('20'),
            avg_cost=Decimal('494.36'), current_price=Decimal('510.09'),
            sector='Technology', type='STOCK', color='#00a4ef',
            currency='USD', fx_rate=Decimal('0.8600895'),
        )
        # A real external bank, not a synthetic "Saxo" BankAccount - Saxo's
        # own cash is represented by PortfolioValuation.cash_balance /
        # saxo_account_value, never by a BankAccount row, in production.
        BankAccount.objects.create(
            bank='KBC', type='Checking', iban_masked='BE68 1234',
            balance=Decimal('2500.00'), available=Decimal('2500.00'),
        )

    def test_uses_saxos_own_figure_when_there_is_one(self):
        PortfolioValuation.objects.create(
            source=SAXO_SOURCE, currency='EUR',
            cash_balance=Decimal('968435.55'),
            positions_value=Decimal('31571.91'),
            total_value=Decimal('1000007.46'),
        )
        snapshot = ensure_todays_snapshot()

        self.assertEqual(snapshot.portfolio_value, Decimal('31571.91'))
        # bank (2500.00) + saxo_account_value (1000007.46), not
        # portfolio_value (31571.91) + bank - the old formula silently
        # dropped the 968435.55 of idle Saxo cash from the headline.
        self.assertEqual(snapshot.net_worth, Decimal('1002507.46'))
        self.assertEqual(snapshot.net_worth_basis, NetWorthSnapshot.Basis.RECONCILED)

    def test_falls_back_to_our_own_marks_when_unsynced(self):
        snapshot = ensure_todays_snapshot()
        self.assertEqual(snapshot.portfolio_value, Decimal('8774.46'))
        self.assertEqual(snapshot.net_worth, Decimal('11274.46'))  # 8774.46 + 2500.00 bank
        self.assertEqual(snapshot.net_worth_basis, NetWorthSnapshot.Basis.APPROXIMATE)
```

Run: `python manage.py test core.tests.PortfolioValuationPreferenceTest -v 2` → expect PASS.

- [ ] **Step 3: `SnapshotRefreshesTest` — unaffected by basis, but assert it explicitly**

No `PortfolioValuation` in this test either, so it stays APPROXIMATE and values are unchanged. Add the basis assertion for completeness:

```python
    def test_a_later_call_the_same_day_updates_the_row(self):
        first = ensure_todays_snapshot()
        self.assertEqual(first.net_worth, Decimal('1000.00'))
        self.assertEqual(first.net_worth_basis, NetWorthSnapshot.Basis.APPROXIMATE)

        BankAccount.objects.update(balance=Decimal('1500.00'))
        second = ensure_todays_snapshot()

        self.assertEqual(NetWorthSnapshot.objects.count(), 1)
        self.assertEqual(second.pk, first.pk)
        self.assertEqual(second.net_worth, Decimal('1500.00'))
```

Run: `python manage.py test core.tests.SnapshotRefreshesTest -v 2` → expect PASS (should already pass unmodified; the added assertion just documents the basis).

- [ ] **Step 4: `RepairNetWorthHistoryTest` — no assertion changes needed, verify only**

This command only ever touches `portfolio_value`/`net_worth` for a currency restatement; it doesn't read `saxo_account_value` and none of its fixture rows have one, so every row stays `APPROXIMATE` (the model default) and the command's own arithmetic (`portfolio + bank_total`) is unaffected. Run as-is:

Run: `python manage.py test core.tests.RepairNetWorthHistoryTest -v 2` → expect PASS with zero edits. If any fail, the repair command's `_restate` also needs to preserve `net_worth_basis` — inspect the failure before changing anything.

- [ ] **Step 5: Run the whole `core` suite**

Run: `cd backend && python manage.py test core -v 2`
Expected: PASS, all tests.

- [ ] **Step 6: Commit**

```bash
git add backend/core/tests.py
git commit -m "test: update net-worth fixtures for the bank+Saxo-total definition"
```

---

## Task 3 (SUPERSEDED — not implemented as written): Serializer + `NetWorthView` expose the new fields

**Files:**
- Modify: `backend/core/serializers.py`
- Modify: `backend/accounts/views.py`
- Modify: `backend/core/tests.py` (API test class)
- Modify: `backend/accounts/tests.py` (find/extend the `NetWorthView` test — search first)

- [ ] **Step 1: Find the existing `NetWorthView` test**

Run: `grep -n "class.*NetWorth\|def test_" backend/accounts/tests.py`

Read whatever comes back before editing — the exact test class name isn't guessed here on purpose; match its existing style.

- [ ] **Step 2: Write the failing test for `NetWorthView`'s new fields**

Add a test (in whichever class the grep above found, following its existing `setUp` conventions) asserting the response now includes `saxo_account_value` and `net_worth_basis`:

```python
    def test_response_includes_basis_and_saxo_account_value(self):
        response = self.client.get('/api/accounts/net-worth/')
        self.assertIn('net_worth_basis', response.data)
        self.assertIn('saxo_account_value', response.data)
```

(Adjust the URL path to whatever `grep -rn "NetWorthView" backend/accounts/urls.py` shows — verify before writing.)

- [ ] **Step 3: Run it to verify it fails**

Run: `cd backend && python manage.py test accounts -k test_response_includes_basis_and_saxo_account_value -v 2` (or the equivalent test-selection syntax this repo's `manage.py test` supports — confirm via `python manage.py test --help` if `-k` isn't supported; Django's default is `python manage.py test accounts.tests.ClassName.test_response_includes_basis_and_saxo_account_value`)
Expected: FAIL (`KeyError`/`AssertionError`, field missing).

- [ ] **Step 4: Update `NetWorthView`**

In `backend/accounts/views.py`:

```python
class NetWorthView(APIView):

    def get(self, request):
        # Refusing to add USD to EUR is deliberate, but it is the user's
        # problem to fix, not a server error: name the account and the currency
        # instead of a 500 they cannot act on.
        try:
            net_worth = current_net_worth()
        except CurrencyMismatch as exc:
            return Response(
                {'detail': f'Cannot total your accounts: {exc}'},
                status=status.HTTP_409_CONFLICT,
            )

        return Response({
            'portfolio_value': net_worth.portfolio.rounded().amount,
            'bank_total': net_worth.bank.rounded().amount,
            'saxo_account_value': (
                net_worth.saxo_account_value.rounded().amount
                if net_worth.saxo_account_value is not None else None
            ),
            'net_worth': net_worth.total.rounded().amount,
            'net_worth_basis': net_worth.basis,
        })
```

- [ ] **Step 5: Run the test to verify it passes**

Run the same command as Step 3. Expected: PASS.

- [ ] **Step 6: Update `NetWorthSnapshotSerializer`**

In `backend/core/serializers.py`:

```python
from rest_framework import serializers

from .models import NetWorthSnapshot


class NetWorthSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = NetWorthSnapshot
        fields = ['date', 'portfolio_value', 'bank_total', 'saxo_account_value', 'net_worth', 'net_worth_basis']
```

- [ ] **Step 7: Add/adjust the `NetWorthHistoryAPITest` assertions**

In `backend/core/tests.py`, `NetWorthHistoryAPITest` currently creates rows without `saxo_account_value`/`net_worth_basis` — that's fine, they'll default to `None`/`'approximate'`. Add one assertion to `test_all_range_returns_every_snapshot`:

```python
    def test_all_range_returns_every_snapshot(self):
        response = self.client.get('/api/core/net-worth-history/?range=ALL')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 5)
        self.assertIn('net_worth_basis', response.data[0])
        self.assertIn('saxo_account_value', response.data[0])
```

- [ ] **Step 8: Run the full `core` and `accounts` suites**

Run: `cd backend && python manage.py test core accounts -v 2`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/core/serializers.py backend/accounts/views.py backend/core/tests.py backend/accounts/tests.py
git commit -m "feat: expose net_worth_basis and saxo_account_value on the net-worth APIs"
```

---

## Task 4 (SUPERSEDED — the actual, corrected fix is described above; this text is the flawed original): Fix `portfolio/insights.py::build_insights()` — headline and deltas from one series

**Files:**
- Modify: `backend/portfolio/insights.py`
- Modify: `backend/portfolio/tests.py`

**Interfaces:**
- Produces: `insights['value']['net_worth_basis']` (new key), `insights['value']['net_worth']` and `insights['change'].*`/`insights['spark']` now share one definition (`bank_total + saxo_account_value` per day).
- Consumes: `core.services.current_net_worth` (new import), `core.models.NetWorthSnapshot`.

- [ ] **Step 1: Find the existing insights test coverage**

Run: `grep -n "class.*Insight\|def test_" backend/portfolio/tests.py | head -60`

Read the matching test class(es) in full before editing (there will be an existing class covering `value`/`change`/`spark` — locate it exactly rather than guessing its name).

- [ ] **Step 2: Write the failing tests**

Add a new test class to `backend/portfolio/tests.py` (adjust imports at the top of the file to include `NetWorthSnapshot` from `core.models` if not already imported — check first):

```python
class BuildInsightsNetWorthBasisTest(TestCase):
    """insights.value.net_worth and insights.change.* must describe the same
    quantity - see docs/superpowers/plans/2026-09-23-phase-a-data-trust-reliability.md."""

    def setUp(self):
        Position.objects.create(
            ticker='NVDA', name='NVIDIA', qty=10,
            avg_cost=Decimal('100.00'), current_price=Decimal('150.00'),
            sector='Technology', type='STOCK', color='#76b900',
        )

    def _snapshot(self, date, bank_total, saxo_account_value, portfolio_value=Decimal('1500.00')):
        basis = (
            NetWorthSnapshot.Basis.RECONCILED if saxo_account_value is not None
            else NetWorthSnapshot.Basis.APPROXIMATE
        )
        net_worth = (
            bank_total + saxo_account_value if saxo_account_value is not None
            else bank_total + portfolio_value
        )
        return NetWorthSnapshot.objects.create(
            date=date, portfolio_value=portfolio_value, bank_total=bank_total,
            net_worth=net_worth, net_worth_basis=basis,
            saxo_account_value=saxo_account_value,
        )

    def test_headline_matches_todays_snapshot_when_reconciled(self):
        today = date.today()
        self._snapshot(today - timedelta(days=1), Decimal('2000.00'), Decimal('2000.00'))
        self._snapshot(today, Decimal('2500.00'), Decimal('2400.00'))

        insights = build_insights()

        # 2500 bank + 2400 saxo, matching the stored row exactly - not
        # portfolio_value (1500) + bank, which would drop the 900 idle cash.
        self.assertEqual(insights['value']['net_worth'], Decimal('4900.00'))
        self.assertEqual(insights['value']['net_worth_basis'], 'reconciled')
        # Day-over-day delta computed from the SAME series the headline came
        # from: (2500+2400) - (2000+2000) = 900.
        self.assertEqual(insights['change']['day']['abs'], Decimal('900.00'))

    def test_a_buy_sell_does_not_read_as_a_change_in_net_worth(self):
        # A BUY only reallocates Saxo cash into a position - saxo_account_value
        # is unchanged, so total net worth must not move either.
        today = date.today()
        self._snapshot(today - timedelta(days=1), Decimal('2500.00'), Decimal('2400.00'),
                        portfolio_value=Decimal('1500.00'))
        self._snapshot(today, Decimal('2500.00'), Decimal('2400.00'),
                        portfolio_value=Decimal('2400.00'))  # bought more, same total

        insights = build_insights()
        self.assertEqual(insights['change']['day']['abs'], Decimal('0.00'))

    def test_headline_falls_back_to_approximate_when_saxo_unavailable_today(self):
        today = date.today()
        self._snapshot(today, Decimal('2500.00'), None, portfolio_value=Decimal('1500.00'))

        insights = build_insights()
        self.assertEqual(insights['value']['net_worth'], Decimal('4000.00'))  # 2500 + 1500
        self.assertEqual(insights['value']['net_worth_basis'], 'approximate')

    def test_days_without_a_usable_saxo_value_are_excluded_from_the_series(self):
        today = date.today()
        self._snapshot(today - timedelta(days=2), Decimal('2000.00'), Decimal('2000.00'))
        self._snapshot(today - timedelta(days=1), Decimal('2000.00'), None)  # outage day
        self._snapshot(today, Decimal('2500.00'), Decimal('2400.00'))

        insights = build_insights()
        # Only the two reconciled days are in the series - the outage day
        # would poison a delta with an approximate (missing-cash) value.
        self.assertEqual(insights['change']['day']['abs'], Decimal('900.00'))
```

Check the top of `backend/portfolio/tests.py` for existing imports of `date`, `timedelta`, `Decimal`, `TestCase`, `build_insights`, `Position` — add any missing ones (`from datetime import date, timedelta` and `from core.models import NetWorthSnapshot` most likely need adding; confirm by reading the file's import block first).

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && python manage.py test portfolio.tests.BuildInsightsNetWorthBasisTest -v 2`
Expected: FAIL (`net_worth_basis` KeyError, and wrong `net_worth`/`change` values against the old formula).

- [ ] **Step 4: Rewrite the relevant part of `build_insights()`**

In `backend/portfolio/insights.py`, add the import and replace the value/pairs computation:

```python
from core.models import NetWorthSnapshot
from core.services import current_net_worth
from portfolio.models import SAXO_SOURCE, PortfolioValuation, Position
from portfolio.services import get_portfolio_value
```

Replace the `pairs`/`portfolio_value`/`bank` computation and the `value`/`change`/`spark` block inside `build_insights()`:

```python
def _headline_net_worth(latest, today):
    """The live 'right now' total, kept identical to the historical series'
    last point whenever today's snapshot is already reconciled - same
    source, so the headline and its own deltas cannot describe two
    different quantities. Falls back to a fresh live computation (with an
    explicit 'approximate' basis) before today's snapshot exists yet, or
    when it exists but Saxo's figure wasn't usable when it was written."""
    if latest and latest.date == today and latest.net_worth_basis == NetWorthSnapshot.Basis.RECONCILED:
        return latest.net_worth, latest.net_worth_basis
    net_worth = current_net_worth()
    return net_worth.total.rounded().amount, net_worth.basis


def build_insights():
    positions = list(Position.objects.all())
    # bank_total + saxo_account_value (everything the user has), not
    # saxo_account_value alone - the old series excluded bank money
    # entirely, which the headline above never claimed to do. Excluding
    # null-saxo days rather than falling back to portfolio_value here too:
    # a delta computed against an approximate (missing-cash) value would
    # reintroduce a false swing on exactly the kind of day this guards
    # against. See portfolio.services.get_saxo_account_value.
    pairs = list(
        NetWorthSnapshot.objects
        .exclude(saxo_account_value__isnull=True)
        .order_by('date')
        .annotate(total=F('bank_total') + F('saxo_account_value'))
        .values_list('date', 'total')
    )
    latest = NetWorthSnapshot.objects.order_by('date').last()
    today = date.today()

    total = sum((p.value for p in positions), Decimal('0'))
    total_cost = sum((p.cost for p in positions), Decimal('0'))
    total_pnl = total - total_cost

    portfolio_value = get_portfolio_value().rounded().amount
    bank = latest.bank_total if latest else Decimal('0')
    net_worth_value, net_worth_basis = _headline_net_worth(latest, today)

    concentration = _concentration(positions, total)
    held_upper = {p.ticker.upper() for p in positions if p.ticker}
    upcoming = _upcoming_earnings(held_upper, today)
    idle_cash_pct = _idle_cash_pct()

    return {
        'as_of': pairs[-1][0].isoformat() if pairs else None,
        'stale': bool(pairs) and (today - pairs[-1][0]).days > STALE_DAYS,
        'value': {
            'net_worth': net_worth_value,
            'net_worth_basis': net_worth_basis,
            'portfolio': portfolio_value,
            'bank': bank,
        },
        'change': {
            'day': _day(pairs),
            'week': _trailing(pairs, 7),
            'month': _trailing(pairs, 30),
            'ytd': _ytd(pairs),
            'all_time': _all_time(pairs),
        },
        'spark': [{'date': d.isoformat(), 'value': float(v)} for d, v in pairs[-SPARK_POINTS:]],
        'concentration': concentration,
        'sector_exposure': _exposure(positions, total, 'sector', 'name'),
        'currency_exposure': _exposure(positions, total, 'currency', 'currency'),
        'movers': _movers(positions),
        'contributors': _contributors(positions, total_cost, total_pnl),
        'attention': _attention(positions, pairs, today, concentration, upcoming, idle_cash_pct),
        'upcoming_earnings': upcoming,
    }
```

Add `from django.db.models import F` to the top imports.

- [ ] **Step 5: Run the new tests**

Run: `cd backend && python manage.py test portfolio.tests.BuildInsightsNetWorthBasisTest -v 2`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full `portfolio` suite and fix any pre-existing `build_insights` tests that assumed the old `saxo_account_value`-only series**

Run: `cd backend && python manage.py test portfolio -v 2`

Any pre-existing test asserting `insights['change']` or `insights['spark']` against a fixture that set `saxo_account_value` but a *different* `bank_total` than expected in the old assertion needs its expected numbers updated the same way Task 2 did — read each failure's assertion and fixture before changing it; do not change values you can't derive from the fixture. Also check the `_attention`/`no_history` test still holds (it depends on `len(pairs) < 2`, which is unaffected by this change since `pairs` is still one row per day, just a different value column).

- [ ] **Step 7: Commit**

```bash
git add backend/portfolio/insights.py backend/portfolio/tests.py
git commit -m "fix: compute the Dashboard headline and its deltas from one net-worth series"
```

---

## Task 5 (SUPERSEDED — not implemented; frontend was reverted to its pre-Phase-A state instead): Frontend — `HeroValue`, `NetWorthChart`, `Portfolio.jsx` reflect the corrected/labeled total

**Files:**
- Modify: `frontend/src/components/dashboard/HeroValue.jsx`
- Modify: `frontend/src/components/dashboard/HeroValue.test.jsx`
- Modify: `frontend/src/components/NetWorthChart.jsx`
- Modify: `frontend/src/pages/Portfolio.jsx`
- Check/modify: `frontend/src/pages/Portfolio.test.jsx`, `frontend/src/pages/Dashboard.test.jsx`, `frontend/src/pages/Accounts.test.jsx` (all three import fixtures shaped like the old `net_worth`/`insights` payload — grep first)

**Why `NetWorthChart` changes too:** with the backend fix, `net_worth` can now exceed `portfolio_value + bank_total` on a day with idle Saxo cash — the chart's own "Total" line would stop equalling the sum of its own "Investments" + "Bank" lines, which is exactly the kind of internal contradiction this whole task exists to remove. Swap the "Investments" line to plot `saxo_account_value` (Saxo cash + positions) instead of `portfolio_value` (positions only), relabelled, so `Total = (this line) + Bank` holds by construction, matching the backend's own definition.

- [ ] **Step 1: Update `HeroValue.jsx` to show the approximate-basis caveat**

```jsx
import { fmtEur, fmtPct } from '../../lib/format'
import { Card } from '../ui'

const PERIODS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['ytd', 'YTD'],
]

function DeltaPill({ label, delta }) {
  const known = delta && delta.pct != null
  const up = known && Number(delta.pct) >= 0
  return (
    <div className="flex flex-col">
      <span className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-600">{label}</span>
      <span
        className={`text-[var(--fig-sm)] num font-mono ${
          !known ? 'text-zinc-500' : up ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {!known ? '—' : fmtPct(delta.pct, { decimals: 2 })}
      </span>
      {known && (
        <span className="text-[var(--fig-2xs)] num font-mono text-zinc-600">
          {fmtEur(delta.abs, { sign: true, decimals: 0 })}
        </span>
      )}
    </div>
  )
}

function FlatStat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-600">{label}</span>
      <span className="text-[var(--fig-sm)] num font-mono text-zinc-300">{value}</span>
    </div>
  )
}

export default function HeroValue({ value, change, spendingThisMonth }) {
  const approximate = value.net_worth_basis === 'approximate'
  return (
    <Card className="h-full flex flex-col">
      <div className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 font-medium">Net worth</div>
      <div className="mt-1 text-[clamp(22px,2.4vw,30px)] font-semibold tracking-tight num font-mono text-zinc-50">
        {approximate && <span title="Saxo's cash balance is unavailable right now, so this excludes any uninvested Saxo cash">≈ </span>}
        {fmtEur(value.net_worth)}
      </div>
      <div className="mt-1 text-[var(--fig-xs)] text-zinc-500 num font-mono">
        {fmtEur(value.portfolio)} invested · {fmtEur(value.bank)} bank
      </div>
      <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-2 gap-3">
        {PERIODS.map(([key, label]) => (
          <DeltaPill key={key} label={label} delta={change?.[key]} />
        ))}
        {spendingThisMonth != null && <FlatStat label="Spent MTD" value={fmtEur(spendingThisMonth)} />}
      </div>
      <p className="mt-auto pt-3 text-[var(--fig-2xs)] text-zinc-600">
        {approximate
          ? "Saxo's cash balance is unavailable right now - this total excludes any uninvested Saxo cash until it reconnects."
          : 'Change is end-of-day, from the daily net-worth snapshot.'}
      </p>
    </Card>
  )
}
```

- [ ] **Step 2: Update `HeroValue.test.jsx`'s fixture and add the new case**

```jsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import HeroValue from './HeroValue'

const base = {
  value: { net_worth: '10000.00', portfolio: '9000.00', bank: '1000.00', net_worth_basis: 'reconciled' },
  change: {
    day: { abs: '50.00', pct: 0.56 },
    week: { abs: '-120.00', pct: -1.3 },
    month: null,
    ytd: { abs: '800.00', pct: 9.0 },
  },
  spark: [{ date: '2026-09-08', value: 9900 }, { date: '2026-09-09', value: 10000 }],
}

describe('HeroValue', () => {
  it('shows the net worth and a green and a red delta', () => {
    render(<HeroValue {...base} />)
    expect(screen.getByText('€10,000.00')).toBeInTheDocument()
    expect(screen.getByText(/\+0\.56%/)).toBeInTheDocument()
    expect(screen.getByText(/-1\.30%/)).toBeInTheDocument()
  })

  it('renders an em dash for a null delta', () => {
    render(<HeroValue {...base} />)
    expect(screen.getByText('Month').closest('div')).toHaveTextContent('—')
  })

  it('shows spent-this-month as a flat figure alongside the delta pills', () => {
    render(<HeroValue {...base} spendingThisMonth="342.10" />)
    expect(screen.getByText('Spent MTD')).toBeInTheDocument()
    expect(screen.getByText('€342.10')).toBeInTheDocument()
  })

  it('omits the spent-this-month figure when not provided', () => {
    render(<HeroValue {...base} />)
    expect(screen.queryByText('Spent MTD')).not.toBeInTheDocument()
  })

  it('flags an approximate total with a caveat instead of the usual footer', () => {
    render(<HeroValue {...base} value={{ ...base.value, net_worth_basis: 'approximate' }} />)
    expect(screen.getByText(/excludes any uninvested Saxo cash/)).toBeInTheDocument()
  })

  it('does not show the approximate caveat for a reconciled total', () => {
    render(<HeroValue {...base} />)
    expect(screen.queryByText(/excludes any uninvested Saxo cash/)).not.toBeInTheDocument()
  })
})
```

(The old "omits the sparkline when there is no series" test is removed here — `HeroValue` never accepted or rendered a `spark` prop in the first place; it was a stale assertion that happened to pass vacuously. Leaving `spark` in the `base` fixture as unused, harmless extra data, matching what `Dashboard.jsx` actually passes today. Flag this in the final report; do not chase it further in Phase A.)

- [ ] **Step 3: Run the frontend test**

Run: `cd frontend && npx vitest run src/components/dashboard/HeroValue.test.jsx`
Expected: PASS (6 tests).

- [ ] **Step 4: Update `NetWorthChart.jsx`**

```jsx
import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useNetWorthHistory } from '../api/queries'
import { fmtEur } from '../lib/format'
import {
  chartTooltipProps, dateAxisProps, gridProps, moneyAxisProps, formatAxisDate,
  SERIES_BANK, SERIES_INVESTMENTS, SERIES_TOTAL,
} from '../lib/charts'
import { Pill, RangePills } from './RangePills'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'

const VIEWS = [
  { key: 'ALL', label: 'All' },
  { key: 'INVESTMENTS', label: 'Saxo' },
  { key: 'BANK', label: 'Bank' },
]

export default function NetWorthChart() {
  const [range, setRange] = useState('6M')
  const [view, setView] = useState('ALL')
  const { data, isLoading, error } = useNetWorthHistory(range)

  const placeholder = chartPlaceholderFor({ isLoading, error, data, minPoints: 2 })

  const showInvestments = view === 'ALL' || view === 'INVESTMENTS'
  const showBank = view === 'ALL' || view === 'BANK'
  const showTotal = view === 'ALL'

  return (
    <Card>
      <CardHeader
        title="Net worth history"
        subtitle="Saxo account (cash + positions) and bank accounts over time"
        right={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-zinc-900/60 rounded-md p-0.5 border border-white/[0.06]">
              {VIEWS.map((v) => (
                <Pill key={v.key} active={view === v.key} onClick={() => setView(v.key)}>
                  {v.label}
                </Pill>
              ))}
            </div>
            <RangePills value={range} onChange={setRange} />
          </div>
        }
      />
      <div className="mt-4 h-[var(--chart-h-lg)]">
        {placeholder ?? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid {...gridProps} />
            <XAxis {...dateAxisProps} />
            <YAxis {...moneyAxisProps} />
            <Tooltip {...chartTooltipProps} labelFormatter={formatAxisDate} formatter={(v, n) => [fmtEur(v), n]} />
            {showInvestments && (
              <Line
                type="monotone"
                dataKey="saxo_account_value"
                name="Saxo (cash + positions)"
                stroke={SERIES_INVESTMENTS}
                strokeWidth={showTotal ? 1.5 : 2}
                strokeOpacity={showTotal ? 0.5 : 1}
                strokeDasharray={showTotal ? '4 3' : undefined}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            )}
            {showBank && (
              <Line
                type="monotone"
                dataKey="bank_total"
                name="Bank"
                stroke={SERIES_BANK}
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
                stroke={SERIES_TOTAL}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
```

Note `connectNulls={false}` on the "Saxo" line (rows before `saxo_account_value` existed are `null` — an honest gap, not a value pretending to connect across it) and `connectNulls` (true, the default is actually `false` in Recharts — pass it explicitly) on "Total" since `net_worth` itself is never null (every row has a computed value, reconciled or approximate).

- [ ] **Step 5: Find and update `NetWorthChart`'s existing test, if any**

Run: `find frontend/src -iname "NetWorthChart*"`

If a test file exists, read it and update any fixture/assertion referencing `portfolio_value`/"Investments" the same way Step 4 changed the component (dataKey → `saxo_account_value`, label → "Saxo (cash + positions)"). If none exists, skip — do not add new test infrastructure for a component with no prior coverage as part of this task (out of scope; note it in the final report's remaining risks instead).

- [ ] **Step 6: Update `Portfolio.jsx`'s "Total net worth" row**

In `frontend/src/pages/Portfolio.jsx`, the `StatRow` block:

```jsx
        <StatStrip vertical>
          <StatRow
            label="Total net worth"
            value={`${netWorth.net_worth_basis === 'approximate' ? '≈ ' : ''}${fmtEur(netWorth.net_worth)}`}
            note={netWorth.net_worth_basis === 'approximate'
              ? "Saxo cash unavailable right now - excludes it"
              : 'Portfolio + bank + Saxo cash'}
            tone="text-blue-400"
            lead
          />
```

(Leave the other three `StatRow`s unchanged.)

- [ ] **Step 7: Update `Portfolio.test.jsx`, `Dashboard.test.jsx`, `Accounts.test.jsx` fixtures**

Run: `grep -rn "net_worth:" frontend/src/pages/Portfolio.test.jsx frontend/src/pages/Dashboard.test.jsx frontend/src/pages/Accounts.test.jsx`

For each fixture object found, add `net_worth_basis: 'reconciled'` and `saxo_account_value: <same as portfolio + something reasonable>` alongside the existing `net_worth`/`portfolio_value`/`bank_total` keys, matching whatever numeric values that fixture already uses (do not invent numbers that contradict an existing assertion in the same test — read the assertions first).

- [ ] **Step 8: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: PASS, all suites, including lint (`npm run lint`) and build (`npm run build`) if those are part of the repo's definition of "green" — check `package.json` scripts and run whichever this repo's other recent commits ran (its own commit history shows "gates: backend N, frontend N, lint, build" every time — replicate that here).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/dashboard/HeroValue.jsx frontend/src/components/dashboard/HeroValue.test.jsx frontend/src/components/NetWorthChart.jsx frontend/src/pages/Portfolio.jsx frontend/src/pages/Portfolio.test.jsx frontend/src/pages/Dashboard.test.jsx frontend/src/pages/Accounts.test.jsx
git commit -m "fix: show the net-worth basis caveat and plot Saxo's full cash+positions total"
```

---

## Task 6: Manually verify Dashboard + Portfolio in the running app (THIS is the step that caught the double-counting bug — see the correction above)

**Files:** none (manual verification step, per the user's explicit implementation order Step 4 "Verify Dashboard behavior").

- [ ] **Step 1: Start the dev stack**

Run: `./scripts/dev.sh` (or `--reclaim` if a stale instance is already running — check `ps`/the script's own status output first per the FortiClient/stale-server lesson in project memory; do not `kill` a raw PID directly).

- [ ] **Step 2: Open the Dashboard in a browser**

Confirm: the "Net worth" headline and the Day/Week/Month/YTD pills read as one coherent story (no `≈` prefix if Saxo is connected and synced recently); if Saxo is currently disconnected/stale in this dev environment, confirm the `≈` prefix and caveat footer text actually appear instead of the normal footer.

- [ ] **Step 3: Open the Portfolio page**

Confirm "Total net worth" matches the Dashboard headline exactly (same basis, same figure) and the note text changes appropriately if approximate.

- [ ] **Step 4: Open the Dashboard's "Net worth history" chart**

Confirm the "Saxo" and "Bank" lines plus the "Total" line render without console errors, and that "Total" visually sits at or above "Saxo" + "Bank" (it should equal their sum whenever both are non-null for a given day).

- [ ] **Step 5: Note the outcome**

Record (for the final report) whether the live app currently shows `reconciled` or `approximate` for today's snapshot, and why (Saxo connection state).

---

## Task 7: Version-control the Celery Beat schedule

**Files:**
- Create: `backend/core/scheduling.py`
- Create: `backend/core/management/commands/sync_periodic_tasks.py`
- Create: `backend/core/migrations/0006_seed_periodic_tasks.py`
- Create: `backend/core/test_scheduling.py`

**The exact current schedule (read directly from the dev DB on 2026-09-23 — this is the canonical list to preserve, not a guess):**

| Name | Task | Schedule | Enabled |
|---|---|---|---|
| Refresh Saxo token | `saxo.tasks.refresh_saxo_token` | every 10 minutes | yes |
| Sync Saxo positions | `saxo.tasks.sync_positions` | every 30 minutes | yes |
| Sync Saxo account balance | `saxo.tasks.sync_account_balance` | every 30 minutes | yes |
| Sync Saxo closed positions | `saxo.tasks.sync_closed_positions` | every 30 minutes | yes |
| Sync watchlists | `research.tasks.sync_watchlists` | every 30 minutes | yes |
| Sync Enable Banking balances | `enablebanking.tasks.sync_enablebanking_balances` | every 3 hours | yes |
| Sync Enable Banking transactions | `enablebanking.tasks.sync_enablebanking_transactions` | every 3 hours | yes |
| Detect subscriptions | `enablebanking.tasks.detect_enablebanking_subscriptions` | every 3 hours | yes |
| Snapshot net worth | `core.tasks.snapshot_net_worth` | daily at 23:40 UTC | yes |
| Backfill position sectors | `portfolio.tasks.backfill_position_sectors` | daily at 04:00 UTC | yes |
| Sync Saxo transactions | `saxo.tasks.sync_transactions` | daily at 01:00 UTC | **disabled, and the task no longer exists in code** (superseded by `sync_closed_positions`) - dropped, not carried forward |
| `celery.backend_cleanup` | built-in | daily at 04:00 UTC | yes — untouched, not managed by this module |

- [ ] **Step 1: Write the failing test**

Create `backend/core/test_scheduling.py`:

```python
from django.test import TestCase
from django_celery_beat.models import IntervalSchedule, PeriodicTask

from core.scheduling import PERIODIC_TASKS, sync_periodic_tasks


class SyncPeriodicTasksTest(TestCase):
    def test_creates_every_declared_task(self):
        sync_periodic_tasks()
        self.assertEqual(
            PeriodicTask.objects.filter(name__in=PERIODIC_TASKS).count(),
            len(PERIODIC_TASKS),
        )

    def test_is_idempotent(self):
        sync_periodic_tasks()
        sync_periodic_tasks()
        self.assertEqual(
            PeriodicTask.objects.filter(name__in=PERIODIC_TASKS).count(),
            len(PERIODIC_TASKS),
        )

    def test_sync_positions_runs_every_30_minutes(self):
        sync_periodic_tasks()
        task = PeriodicTask.objects.get(name='Sync Saxo positions')
        self.assertEqual(task.task, 'saxo.tasks.sync_positions')
        self.assertEqual(task.interval.every, 30)
        self.assertEqual(task.interval.period, IntervalSchedule.MINUTES)
        self.assertTrue(task.enabled)

    def test_snapshot_net_worth_runs_at_2340_utc(self):
        sync_periodic_tasks()
        task = PeriodicTask.objects.get(name='Snapshot net worth')
        self.assertEqual(task.crontab.minute, '40')
        self.assertEqual(task.crontab.hour, '23')

    def test_reusing_an_existing_matching_schedule_does_not_duplicate_it(self):
        sync_periodic_tasks()
        sync_periodic_tasks()
        # sync_positions, sync_account_balance, sync_closed_positions and
        # sync_watchlists all share the same 30-minute interval - confirm
        # they share one IntervalSchedule row, not four.
        thirty_min_schedules = IntervalSchedule.objects.filter(
            every=30, period=IntervalSchedule.MINUTES)
        self.assertEqual(thirty_min_schedules.count(), 1)

    def test_removes_the_dead_sync_transactions_row(self):
        PeriodicTask.objects.create(
            name='Sync Saxo transactions', task='saxo.tasks.sync_transactions',
            enabled=False,
        )
        sync_periodic_tasks()
        self.assertFalse(
            PeriodicTask.objects.filter(task='saxo.tasks.sync_transactions').exists()
        )

    def test_warns_about_an_enabled_task_not_in_the_canonical_list(self):
        PeriodicTask.objects.create(
            name='Some ad-hoc admin edit', task='some.app.tasks.mystery', enabled=True,
        )
        warnings = []

        class Stdout:
            def write(self, msg):
                warnings.append(msg)

        sync_periodic_tasks(stdout=Stdout())
        self.assertTrue(any('mystery' in w for w in warnings))
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test core.test_scheduling -v 2`
Expected: FAIL (`ModuleNotFoundError: No module named 'core.scheduling'`).

- [ ] **Step 3: Write `core/scheduling.py`**

```python
"""The canonical Celery Beat schedule, version-controlled here instead of
living only in django_celery_beat's database tables (DatabaseScheduler still
reads from the DB at runtime - this module is the source of truth a fresh
environment or a reviewable PR can see, and sync_periodic_tasks() is what
writes it into the DB, idempotently, from a migration or a management
command). See docs/superpowers/plans/2026-09-23-phase-a-data-trust-reliability.md.

To change a schedule: edit PERIODIC_TASKS here, then run
`python manage.py sync_periodic_tasks` (or add a migration that calls
sync_periodic_tasks() for existing environments to pick it up automatically).
"""
from django_celery_beat.models import CrontabSchedule, IntervalSchedule, PeriodicTask

# Name -> {task, and either 'interval': (every, period) or 'crontab': {...}}.
# Every entry here is exactly what was live in the dev database on
# 2026-09-23 - see the plan doc's schedule table for the audit this came from.
PERIODIC_TASKS = {
    'Refresh Saxo token': {
        'task': 'saxo.tasks.refresh_saxo_token',
        'interval': (10, IntervalSchedule.MINUTES),
    },
    'Sync Saxo positions': {
        'task': 'saxo.tasks.sync_positions',
        'interval': (30, IntervalSchedule.MINUTES),
    },
    'Sync Saxo account balance': {
        'task': 'saxo.tasks.sync_account_balance',
        'interval': (30, IntervalSchedule.MINUTES),
    },
    'Sync Saxo closed positions': {
        'task': 'saxo.tasks.sync_closed_positions',
        'interval': (30, IntervalSchedule.MINUTES),
    },
    'Sync watchlists': {
        'task': 'research.tasks.sync_watchlists',
        'interval': (30, IntervalSchedule.MINUTES),
    },
    'Sync Enable Banking balances': {
        'task': 'enablebanking.tasks.sync_enablebanking_balances',
        'interval': (3, IntervalSchedule.HOURS),
    },
    'Sync Enable Banking transactions': {
        'task': 'enablebanking.tasks.sync_enablebanking_transactions',
        'interval': (3, IntervalSchedule.HOURS),
    },
    'Detect subscriptions': {
        'task': 'enablebanking.tasks.detect_enablebanking_subscriptions',
        'interval': (3, IntervalSchedule.HOURS),
    },
    'Snapshot net worth': {
        'task': 'core.tasks.snapshot_net_worth',
        'crontab': {'minute': '40', 'hour': '23'},
    },
    'Backfill position sectors': {
        'task': 'portfolio.tasks.backfill_position_sectors',
        'crontab': {'minute': '0', 'hour': '4'},
    },
}

# Not declared above and never touched by sync_periodic_tasks - Celery's own
# built-in, registered by django-celery-beat itself, not this app's code.
_UNMANAGED_TASK_PREFIXES = ('celery.',)

# Dead as of this plan: the task this pointed at (saxo.tasks.sync_transactions)
# no longer exists in code, superseded by sync_closed_positions. Was already
# disabled everywhere seen - removed outright rather than carried forward.
_DEAD_TASKS = ('saxo.tasks.sync_transactions',)


def sync_periodic_tasks(stdout=None):
    """Create/update every task in PERIODIC_TASKS, remove the one named dead
    task, and warn (never silently delete) about anything else enabled in
    the DB that this module doesn't recognize - most likely drift from an
    ad-hoc admin edit that was never added here."""
    def log(msg):
        if stdout is not None:
            stdout.write(msg)

    for name, spec in PERIODIC_TASKS.items():
        defaults = {'task': spec['task'], 'enabled': True}
        if 'interval' in spec:
            every, period = spec['interval']
            schedule, _ = IntervalSchedule.objects.get_or_create(every=every, period=period)
            defaults['interval'] = schedule
            defaults['crontab'] = None
        else:
            crontab = spec['crontab']
            schedule, _ = CrontabSchedule.objects.get_or_create(
                minute=crontab['minute'], hour=crontab['hour'],
                day_of_week='*', day_of_month='*', month_of_year='*',
            )
            defaults['crontab'] = schedule
            defaults['interval'] = None
        PeriodicTask.objects.update_or_create(name=name, defaults=defaults)
        log(f'  {name}: ok')

    removed, _ = PeriodicTask.objects.filter(task__in=_DEAD_TASKS).delete()
    if removed:
        log(f'  removed {removed} stale row(s) for {", ".join(_DEAD_TASKS)}')

    orphans = (
        PeriodicTask.objects.exclude(name__in=PERIODIC_TASKS)
        .filter(enabled=True)
    )
    for orphan in orphans:
        if orphan.task.startswith(_UNMANAGED_TASK_PREFIXES):
            continue
        log(f'  WARNING: enabled periodic task "{orphan.name}" ({orphan.task}) is not '
            f'declared in core.scheduling.PERIODIC_TASKS - drifted from an admin edit? '
            f'Add it there or disable it.')
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && python manage.py test core.test_scheduling -v 2`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the management command**

`backend/core/management/commands/sync_periodic_tasks.py`:

```python
from django.core.management.base import BaseCommand

from core.scheduling import sync_periodic_tasks


class Command(BaseCommand):
    help = 'Create/update the canonical Celery Beat schedule from core.scheduling.PERIODIC_TASKS.'

    def handle(self, *args, **options):
        sync_periodic_tasks(stdout=self.stdout)
        self.stdout.write(self.style.SUCCESS('Schedule synced.'))
```

- [ ] **Step 6: Write the data migration**

Run: `cd backend && python manage.py makemigrations core --empty --name seed_periodic_tasks`

Edit the generated file:

```python
from django.db import migrations


def seed(apps, schema_editor):
    from core.scheduling import sync_periodic_tasks
    sync_periodic_tasks()


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_networthsnapshot_net_worth_basis'),
        ('django_celery_beat', '0019_alter_periodictasks_options'),
    ]

    operations = [
        migrations.RunPython(seed, noop),
    ]
```

Rename to `0006_seed_periodic_tasks.py` if `makemigrations` chose differently.

- [ ] **Step 7: Run the migration against the real dev database and verify**

Run: `cd backend && python manage.py migrate core`

Then verify the dead row is gone and nothing else was disturbed:

```bash
python3 -c "
import sqlite3
con = sqlite3.connect('db.sqlite3')
cur = con.cursor()
cur.execute(\"SELECT name, task, enabled FROM django_celery_beat_periodictask ORDER BY name\")
for row in cur.fetchall():
    print(row)
"
```

Expected: the same 10 managed rows plus `celery.backend_cleanup`, no `Sync Saxo transactions` row.

- [ ] **Step 8: Run the full `core` suite**

Run: `cd backend && python manage.py test core -v 2`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/core/scheduling.py backend/core/management/commands/sync_periodic_tasks.py backend/core/migrations/0006_seed_periodic_tasks.py backend/core/test_scheduling.py
git commit -m "feat: version-control the Celery Beat schedule and drop the dead sync_transactions row"
```

---

## Task 8: Retry/backoff — split transient from permanent failures (Saxo)

**Files:**
- Modify: `backend/saxo/client.py`
- Modify: `backend/saxo/tasks.py`
- Modify: `backend/saxo/tests.py` (or the relevant split-out `test_client.py` if the earlier test-file split created one — check first)

**What's already true (verified in code, correcting the prior review's "no retry exists" claim):** `sync_positions`, `sync_account_balance`, and `sync_closed_positions` already carry `autoretry_for=(client.SaxoAPIError,), retry_backoff=True, max_retries=3`. The gap is that `SaxoAPIError` is currently one flat class covering *every* failure mode (network error, any HTTP status, a non-JSON body) — so a permanent 400/404 (a code bug or a Saxo contract change) gets retried 3 times with backoff exactly like a transient 503 would, wasting the retry budget on something retrying can't fix.

- [ ] **Step 1: Find the current client test file**

Run: `grep -rln "SaxoAPIError\|def _request\|def _get" backend/saxo/*.py`

Read whichever test file already covers `_request`/`_get`/`SaxoAPIError` in full before writing new tests into it (this repo split `saxo/tests.py` into per-concern files in an earlier session — confirm the exact current filename rather than assuming `tests.py`).

- [ ] **Step 2: Write the failing tests**

Add to that file (adjust the class/import style to match what's already there — this is illustrative content, not a literal drop-in if the surrounding file uses e.g. `responses` or a different mocking approach; check the file's existing Saxo-API-error tests for the established mocking pattern first):

```python
class SaxoAPIErrorClassificationTest(TestCase):
    """Only network failures, timeouts, 429, and 5xx should be retried by
    Celery - a 4xx means the request itself is wrong and retrying cannot
    help. See docs/superpowers/plans/2026-09-23-phase-a-data-trust-reliability.md."""

    @patch('saxo.client.requests.get')
    def test_a_500_response_is_transient(self, mock_get):
        mock_get.return_value = MagicMock(ok=False, status_code=500, text='Internal error')
        with self.assertRaises(client.SaxoTransientError):
            client.get_positions('token')

    @patch('saxo.client.requests.get')
    def test_a_429_response_is_transient(self, mock_get):
        mock_get.return_value = MagicMock(ok=False, status_code=429, text='Rate limited')
        with self.assertRaises(client.SaxoTransientError):
            client.get_positions('token')

    @patch('saxo.client.requests.get')
    def test_a_400_response_is_permanent(self, mock_get):
        mock_get.return_value = MagicMock(ok=False, status_code=400, text='Bad request')
        with self.assertRaises(client.SaxoPermanentError):
            client.get_positions('token')

    @patch('saxo.client.requests.get')
    def test_a_404_response_is_permanent(self, mock_get):
        mock_get.return_value = MagicMock(ok=False, status_code=404, text='Not found')
        with self.assertRaises(client.SaxoPermanentError):
            client.get_positions('token')

    @patch('saxo.client.requests.get', side_effect=requests.ConnectionError('refused'))
    def test_a_network_error_is_transient(self, mock_get):
        with self.assertRaises(client.SaxoTransientError):
            client.get_positions('token')

    @patch('saxo.client.requests.get')
    def test_a_non_json_body_is_permanent(self, mock_get):
        response = MagicMock(ok=True)
        response.json.side_effect = ValueError('not json')
        mock_get.return_value = response
        with self.assertRaises(client.SaxoPermanentError):
            client.get_positions('token')

    def test_both_are_still_saxo_api_errors(self):
        # research/market.py::_cached does `except client.SaxoAPIError` - both
        # subclasses must still be caught by that.
        self.assertTrue(issubclass(client.SaxoTransientError, client.SaxoAPIError))
        self.assertTrue(issubclass(client.SaxoPermanentError, client.SaxoAPIError))
```

Add `import requests`, `from unittest.mock import MagicMock, patch`, and `from saxo import client` to the file's imports if not already present (check first — don't duplicate).

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && python manage.py test saxo -k SaxoAPIErrorClassification -v 2` (or the exact `ClassName` path this repo's test runner needs if `-k` isn't wired — confirm with `python manage.py test --help`)
Expected: FAIL (`AttributeError: module 'saxo.client' has no attribute 'SaxoTransientError'`).

- [ ] **Step 4: Split the exception hierarchy in `saxo/client.py`**

Replace the top of `backend/saxo/client.py`:

```python
class SaxoAuthError(Exception):
    """Raised when the OAuth token exchange or refresh fails."""


class SaxoAPIError(Exception):
    """Raised when a Saxo OpenAPI request fails."""


class SaxoTransientError(SaxoAPIError):
    """A network failure, timeout, rate limit (429), or Saxo-side (5xx)
    error - worth Celery's automatic retry, since the same request is
    likely to succeed on its own shortly."""


class SaxoPermanentError(SaxoAPIError):
    """A 4xx response (other than 429) or an unparsable body - the request
    itself is wrong or Saxo's contract changed, so retrying immediately
    would not help; needs a code fix or user action instead."""


_TRANSIENT_STATUSES = {408, 425, 429, 500, 502, 503, 504}
```

Replace `_request`:

```python
def _request(send, url, error_class, label, **kwargs):
    try:
        response = send(url, timeout=REQUEST_TIMEOUT, **kwargs)
    except requests.RequestException as exc:
        raise (SaxoTransientError if error_class is SaxoAPIError else error_class)(
            f'{label} failed: {exc}'
        ) from exc

    if not response.ok:
        body = response.text[:ERROR_BODY_LIMIT]
        if error_class is SaxoAPIError:
            cls = SaxoTransientError if response.status_code in _TRANSIENT_STATUSES else SaxoPermanentError
        else:
            cls = error_class
        raise cls(f'{label} failed: {response.status_code} {body}')

    try:
        return response.json()
    except ValueError as exc:
        raise (SaxoPermanentError if error_class is SaxoAPIError else error_class)(
            f'{label} returned a non-JSON body'
        ) from exc
```

This keeps `_token_request`'s call (`_request(..., SaxoAuthError, ...)`) behaving exactly as before (network/JSON errors there still raise `SaxoAuthError`, unchanged), while `_get`'s call (`_request(..., SaxoAPIError, ...)`) now yields the transient/permanent split. No other call site of `_request` exists other than `_token_request` and `_get` — confirm with `grep -n "_request(" backend/saxo/client.py` before relying on this.

- [ ] **Step 5: Run the tests**

Run the same command as Step 3. Expected: PASS (7 tests).

- [ ] **Step 6: Update `SYNC_TASK` in `saxo/tasks.py`**

```python
SYNC_TASK = {
    'autoretry_for': (client.SaxoTransientError,),
    'retry_backoff': True,
    'max_retries': 3,
}
```

- [ ] **Step 7: Run the full `saxo` suite**

Run: `cd backend && python manage.py test saxo -v 2`
Expected: PASS. (`except client.SaxoAPIError`/`except client.SaxoNotConnected` elsewhere in the codebase, e.g. `research/market.py`, still catch both new subclasses since they inherit from `SaxoAPIError` — confirm with `grep -rn "SaxoAPIError" backend --include="*.py"` that every catch site uses the base class, not something narrower that would now miss a case.)

- [ ] **Step 8: Commit**

```bash
git add backend/saxo/client.py backend/saxo/tasks.py backend/saxo/tests.py
git commit -m "fix: retry only transient Saxo failures, not every 4xx or malformed response"
```

(Adjust the last file in `git add` to whichever file Step 1 actually found.)

---

## Task 9: Retry/backoff — same split for Enable Banking, plus visible total-outage detection

**Files:**
- Modify: `backend/enablebanking/client.py`
- Modify: `backend/enablebanking/tasks.py`
- Modify: `backend/enablebanking/tests.py` (or the relevant split file — check first, this app already has an 11-file test convention per project memory)

**Second, independent finding here:** `_sync_one_bank` currently catches `EnableBankingAPIError` *per account*, logs a warning, and `continue`s — so if every linked account for a bank fails (a total provider outage), the function still returns `('ok', '', 0)`. `BankSyncRun` records `outcome='ok', rows=0`, which is indistinguishable from "nothing changed since last sync," a normal and frequent state. This is fixed here too, since it's the same "make failures observable" goal as the retry work.

- [ ] **Step 1: Find the current client/task test files**

Run: `ls backend/enablebanking/test_*.py backend/enablebanking/tests.py 2>/dev/null` and `grep -ln "EnableBankingAPIError" backend/enablebanking/test_*.py backend/enablebanking/tests.py 2>/dev/null`

Read the matching file(s) fully before editing.

- [ ] **Step 2: Write the failing client tests** (mirror Task 8 Step 2's structure, adjusted for this client's shape)

```python
class EnableBankingAPIErrorClassificationTest(TestCase):
    @patch('enablebanking.client.requests.get')
    def test_a_500_response_is_transient(self, mock_get):
        mock_get.return_value = MagicMock(ok=False, status_code=500, text='Internal error')
        with self.assertRaises(client.EnableBankingTransientError):
            client.get_balances('session', 'account-uid')

    @patch('enablebanking.client.requests.get')
    def test_a_429_response_is_transient(self, mock_get):
        mock_get.return_value = MagicMock(ok=False, status_code=429, text='Rate limited')
        with self.assertRaises(client.EnableBankingTransientError):
            client.get_balances('session', 'account-uid')

    @patch('enablebanking.client.requests.get')
    def test_a_400_response_is_permanent(self, mock_get):
        mock_get.return_value = MagicMock(ok=False, status_code=400, text='Bad request')
        with self.assertRaises(client.EnableBankingPermanentError):
            client.get_balances('session', 'account-uid')

    @patch('enablebanking.client.requests.get', side_effect=requests.ConnectionError('refused'))
    def test_a_network_error_is_transient(self, mock_get):
        with self.assertRaises(client.EnableBankingTransientError):
            client.get_balances('session', 'account-uid')

    def test_both_are_still_enablebanking_api_errors(self):
        self.assertTrue(issubclass(client.EnableBankingTransientError, client.EnableBankingAPIError))
        self.assertTrue(issubclass(client.EnableBankingPermanentError, client.EnableBankingAPIError))
```

Check the exact call signature of `client.get_balances` (`session_id, account_uid` per `enablebanking/tasks.py`'s existing call) before finalizing the mock target/args — confirm via `grep -n "def get_balances" backend/enablebanking/client.py`.

- [ ] **Step 3: Run to verify failure, then implement, mirroring Task 8 Step 4 exactly**

`backend/enablebanking/client.py`:

```python
class EnableBankingAuthError(Exception):
    """Raised when JWT signing or authentication fails."""


class EnableBankingAPIError(Exception):
    """Raised when an Enable Banking API request fails."""


class EnableBankingTransientError(EnableBankingAPIError):
    """A network failure, timeout, rate limit, or Enable Banking-side (5xx)
    error - worth an automatic retry."""


class EnableBankingPermanentError(EnableBankingAPIError):
    """A 4xx response - the request itself is wrong or the session needs
    re-authentication, so an immediate retry would not help."""


_TRANSIENT_STATUSES = {408, 425, 429, 500, 502, 503, 504}


def _raise_for_status(response, label):
    if not response.ok:
        body = response.text[:ERROR_BODY_LIMIT]
        cls = (
            EnableBankingTransientError if response.status_code in _TRANSIENT_STATUSES
            else EnableBankingPermanentError
        )
        raise cls(f'{label} failed: {response.status_code} {body}')


def _call(fn, *args, **kwargs):
    """Wraps a requests call so a network-level failure (timeout, DNS,
    connection reset) raises EnableBankingTransientError like a 5xx/429
    already does via _raise_for_status - callers (task retry logic,
    per-account skip-and-continue) only need to handle one base class."""
    try:
        return fn(*args, **kwargs)
    except requests.exceptions.RequestException as exc:
        raise EnableBankingTransientError(f'Request failed: {exc}') from exc
```

Run the Step 2 tests, expect PASS.

- [ ] **Step 4: Update `enablebanking/tasks.py`'s `autoretry_for`**

Both decorators:

```python
@shared_task(autoretry_for=(client.EnableBankingTransientError,), retry_backoff=True, max_retries=3)
def sync_enablebanking_balances():
    ...

@shared_task(autoretry_for=(client.EnableBankingTransientError,), retry_backoff=True, max_retries=3)
def sync_enablebanking_transactions():
    ...
```

- [ ] **Step 5: Write the failing test for total-outage visibility**

```python
class SyncOneBankTotalOutageTest(TestCase):
    """A BankSyncRun of outcome='ok', rows=0 must mean 'nothing new', not
    'every account failed' - those need to look different so a real outage
    doesn't hide as an ordinary quiet sync."""

    @patch('enablebanking.tasks.client.get_balances', side_effect=client.EnableBankingAPIError('down'))
    @patch('enablebanking.tasks.credentials.connection_state')
    def test_every_account_failing_is_recorded_as_failed_not_ok(self, mock_state, mock_get_balances):
        mock_state.return_value = MagicMock(
            connected=True, needs_reauth=False,
            credential=MagicMock(linked_accounts=[{'uid': 'acc-1'}, {'uid': 'acc-2'}]),
        )
        outcome, detail, rows = tasks._sync_one_bank('kbc')
        self.assertEqual(outcome, 'failed')
        self.assertEqual(rows, 0)
        self.assertIn('down', detail)

    @patch('enablebanking.tasks.client.get_balances')
    @patch('enablebanking.tasks.mapping.to_account_fields', return_value={'balance': '1.00'})
    @patch('enablebanking.tasks.credentials.connection_state')
    def test_one_of_two_accounts_failing_is_still_ok_with_a_note(
        self, mock_state, mock_to_fields, mock_get_balances
    ):
        mock_state.return_value = MagicMock(
            connected=True, needs_reauth=False,
            credential=MagicMock(linked_accounts=[{'uid': 'acc-1'}, {'uid': 'acc-2'}]),
        )
        mock_get_balances.side_effect = [client.EnableBankingAPIError('down'), {'ok': True}]
        outcome, detail, rows = tasks._sync_one_bank('kbc')
        self.assertEqual(outcome, 'ok')
        self.assertEqual(rows, 1)
        self.assertIn('1 account(s) failed', detail)
```

Check `BankAccount.objects.update_or_create`'s call inside `_sync_one_bank` against what needs mocking here (it writes to the real test DB, which is fine under `TestCase`; only `client.get_balances` and `mapping.to_account_fields` need mocking, plus `credentials.connection_state`). Adjust mock targets to match `enablebanking/tasks.py`'s actual import style (`from . import categorization, client, credentials, mapping, subscriptions, transfers` — so patch targets are `enablebanking.tasks.client.get_balances`, `enablebanking.tasks.credentials.connection_state`, `enablebanking.tasks.mapping.to_account_fields`, confirmed against the file read earlier in this plan).

- [ ] **Step 6: Run to verify failure**

Run: `cd backend && python manage.py test enablebanking -k SyncOneBankTotalOutage -v 2` (or the full dotted path if `-k` isn't available)
Expected: FAIL (`outcome == 'ok'`, not `'failed'`).

- [ ] **Step 7: Fix `_sync_one_bank`**

```python
def _sync_one_bank(bank):
    state = credentials.connection_state(bank)

    if not state.connected:
        return 'skipped', state.reason, 0

    if state.needs_reauth:
        if not state.credential.needs_reauth:
            state.credential.needs_reauth = True
            state.credential.save(update_fields=['needs_reauth'])
        return 'skipped', state.reason, 0

    credential = state.credential
    rows = 0
    errors = []
    for account in credential.linked_accounts:
        try:
            balance_response = client.get_balances(credential.session_id, account['uid'])
        except client.EnableBankingAPIError as exc:
            logger.warning('Skipping %s account %s: %s', bank, account['uid'], exc)
            errors.append(str(exc))
            continue

        fields = mapping.to_account_fields(bank, account, balance_response)
        BankAccount.objects.update_or_create(
            external_id=f'enablebanking:{bank}:{account["uid"]}', defaults=fields,
        )
        rows += 1

    if errors and rows == 0:
        # Every account failed - a real outage, not "nothing new since last
        # sync". Must not read as 'ok' or the next silent-lapse incident
        # looks exactly like a healthy quiet day.
        return 'failed', '; '.join(errors)[:200], 0
    if errors:
        return 'ok', f'{len(errors)} account(s) failed: ' + '; '.join(errors)[:150], rows
    return 'ok', '', rows
```

- [ ] **Step 8: Run the tests**

Run the Step 6 command again. Expected: PASS (2 tests).

- [ ] **Step 9: Run the full `enablebanking` suite**

Run: `cd backend && python manage.py test enablebanking -v 2`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/enablebanking/client.py backend/enablebanking/tasks.py backend/enablebanking/tests.py
git commit -m "fix: retry only transient Enable Banking failures, and record a total outage as failed"
```

(Adjust the test file path in `git add` to whichever Step 1 found.)

---

## Task 10: Last-successful-sync parity for Enable Banking (backend)

**Files:**
- Modify: `backend/enablebanking/credentials.py`
- Modify: `backend/enablebanking/views.py`
- Modify: `backend/enablebanking/tests.py` (or split file — check first)

**Goal:** `EnableBankingStatusView` gets the same `worst_recent_outcome`/`failing` signal `SaxoStatusView` already has, reusing `BankSyncRun` — no new model.

- [ ] **Step 1: Check `enablebanking/credentials.py`'s current contents**

Run: `cat backend/enablebanking/credentials.py`

(Not read yet in this plan's research — read it now before writing to it, to match its existing style for `connection_state`/`last_successful_sync` exactly.)

- [ ] **Step 2: Write the failing tests**

Add to the relevant existing test file:

```python
class WorstRecentOutcomePerBankTest(TestCase):
    def test_none_when_nothing_has_run(self):
        self.assertIsNone(credentials.worst_recent_outcome('kbc'))

    def test_ok_when_the_latest_run_per_kind_succeeded(self):
        BankSyncRun.objects.create(bank='kbc', kind='balances', outcome='ok')
        BankSyncRun.objects.create(bank='kbc', kind='transactions', outcome='ok')
        self.assertEqual(credentials.worst_recent_outcome('kbc'), 'ok')

    def test_failed_beats_ok_even_if_it_ran_earlier(self):
        BankSyncRun.objects.create(bank='kbc', kind='transactions', outcome='ok')
        BankSyncRun.objects.create(bank='kbc', kind='balances', outcome='failed')
        self.assertEqual(credentials.worst_recent_outcome('kbc'), 'failed')

    def test_scoped_to_one_bank(self):
        BankSyncRun.objects.create(bank='kbc', kind='balances', outcome='ok')
        BankSyncRun.objects.create(bank='argenta', kind='balances', outcome='failed')
        self.assertEqual(credentials.worst_recent_outcome('kbc'), 'ok')
        self.assertEqual(credentials.worst_recent_outcome('argenta'), 'failed')


class EnableBankingStatusViewOutcomeTest(APITestCase):
    def setUp(self):
        user = User.objects.create_user(username='alex', password='pw')
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        EnableBankingCredential.objects.create(
            bank='kbc', session_id='s', valid_until=timezone.now() + timedelta(days=1),
            linked_accounts=[{'uid': 'a1'}],
        )

    def test_status_includes_last_sync_outcome_and_failing_kinds(self):
        BankSyncRun.objects.create(bank='kbc', kind='balances', outcome='failed', detail='down')

        response = self.client.get('/api/enablebanking/status/')

        self.assertEqual(response.data['kbc']['last_sync_outcome'], 'failed')
        self.assertEqual(response.data['kbc']['failing_syncs'], ['balances'])
```

Check the exact status URL path (`grep -n "EnableBankingStatusView" backend/enablebanking/urls.py`) and adjust imports (`User`, `RefreshToken`, `timezone`, `timedelta`, `APITestCase`, `EnableBankingCredential`, `BankSyncRun`) to whatever the target test file already has or needs adding — check before writing.

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && python manage.py test enablebanking -k WorstRecentOutcome -v 2` (or full dotted path)
Expected: FAIL (`AttributeError: module 'enablebanking.credentials' has no attribute 'worst_recent_outcome'`).

- [ ] **Step 4: Add `worst_recent_outcome` and `latest_run_per_kind` to `enablebanking/credentials.py`**

Mirror `saxo/credentials.py`'s pattern exactly, scoped per bank:

```python
from .models import BankSyncRun

_OUTCOME_RANK = ['failed', 'skipped', 'ok']


def latest_run_per_kind(bank):
    """The newest run of each sync kind (balances, transactions) for one
    bank - same reasoning as saxo.credentials.latest_run_per_task: the
    newest run overall answers 'what ran last', not 'is anything broken'."""
    latest = {}
    for run in BankSyncRun.objects.filter(bank=bank):
        latest.setdefault(run.kind, run)
    return list(latest.values())


def worst_recent_outcome(bank):
    outcomes = {run.outcome for run in latest_run_per_kind(bank)}
    return next((outcome for outcome in _OUTCOME_RANK if outcome in outcomes), None)
```

(Add this alongside whatever `connection_state`/`last_successful_sync` already exist in that file — do not duplicate the `_OUTCOME_RANK` list if the file already imports it from somewhere shared; if `saxo/credentials.py`'s `_OUTCOME_RANK` should be shared instead of duplicated, that's a fine small dedup to make here since both are now the same three-item list — extract to `core/sync_status.py` only if it's a trivial no-risk move; otherwise duplication of one three-item list is acceptable and not worth a cross-app import for.)

- [ ] **Step 5: Update `EnableBankingStatusView`**

```python
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
                'last_sync_outcome': credentials.worst_recent_outcome(bank),
                'failing_syncs': [
                    run.kind for run in credentials.latest_run_per_kind(bank) if run.outcome != 'ok'
                ],
            }
        return Response(result)
```

- [ ] **Step 6: Run the tests**

Run the Step 3 command again. Expected: PASS.

- [ ] **Step 7: Run the full `enablebanking` suite**

Run: `cd backend && python manage.py test enablebanking -v 2`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/enablebanking/credentials.py backend/enablebanking/views.py backend/enablebanking/tests.py
git commit -m "feat: give Enable Banking the same last-sync-outcome visibility Saxo already has"
```

---

## Task 11: Last-successful-sync parity for Enable Banking (frontend)

**Files:**
- Modify: `frontend/src/components/EnableBankingConnectionStatus.jsx`
- Modify: `frontend/src/components/EnableBankingConnectionStatus.test.jsx`

- [ ] **Step 1: Read the existing test file in full**

Already located via the earlier grep; read it now (`frontend/src/components/EnableBankingConnectionStatus.test.jsx`) to match its fixture shape exactly before editing.

- [ ] **Step 2: Write the failing test**

Add a case mirroring `SaxoConnectionStatus`'s equivalent test (find it via `grep -n "Sync failed\|Sync skipped\|SYNC_OUTCOME" frontend/src/components/SaxoConnectionStatus.test.jsx` if that test file exists, and match its assertion style):

```jsx
  it('shows a sync-failed badge when a bank is connected but its last sync failed', () => {
    const status = {
      kbc: {
        connected: true, needs_reauth: false, usable: true, unusable_reason: null,
        last_synced_at: '2026-09-20T10:00:00Z',
        last_sync_outcome: 'failed', failing_syncs: ['balances'],
      },
    }
    // however this test file mocks useEnableBankingStatus - match its existing pattern
  })
```

(This is illustrative; read the file's existing mocking approach — likely `vi.mock('../api/queries', ...)` or a query-client test wrapper — and write the actual test in that established style, not the sketch above verbatim.)

- [ ] **Step 3: Run to verify failure**

Run: `cd frontend && npx vitest run src/components/EnableBankingConnectionStatus.test.jsx`
Expected: FAIL (badge not found).

- [ ] **Step 4: Update the component to mirror `SaxoConnectionStatus`'s pattern**

```jsx
import { useEffect, useState } from 'react'
import { connectEnableBanking } from '../api/client'
import { useEnableBankingStatus } from '../api/queries'
import { Badge } from './ui'

const BANK_LABELS = { kbc: 'KBC', argenta: 'Argenta' }

// Same note as SaxoConnectionStatus - a connected bank whose sync is
// quietly skipping or failing looks healthy otherwise.
const SYNC_OUTCOME_NOTE = {
  skipped: 'The last sync could not run, so this data may be stale',
  failed: 'The last sync failed, so this data may be stale',
}

function OneBank({ bank, state, failed }) {
  const label = BANK_LABELS[bank]

  if (!state.connected) {
    return (
      <div className="flex items-center gap-2">
        {failed && <Badge tone="red">{label} connection failed</Badge>}
        <button
          onClick={() => connectEnableBanking(bank)}
          className="text-[var(--fig-xs)] px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Connect {label}
        </button>
      </div>
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
    <span className="flex items-center gap-2">
      {state.last_sync_outcome && state.last_sync_outcome !== 'ok' && (
        <Badge tone="amber">
          <span title={SYNC_OUTCOME_NOTE[state.last_sync_outcome]}>
            {label} sync {state.last_sync_outcome}
          </span>
        </Badge>
      )}
      <Badge tone="emerald">
        <span title={state.last_synced_at ? `Last synced ${state.last_synced_at}` : 'Never synced'}>
          {label} connected
        </span>
      </Badge>
    </span>
  )
}

export default function EnableBankingConnectionStatus() {
  const { data: status } = useEnableBankingStatus()
  const [failedBank] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('enablebanking') === 'error' ? params.get('bank') : null
  })

  useEffect(() => {
    if (failedBank) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [failedBank])

  if (!status) return null

  return (
    <span className="flex items-center gap-2">
      {Object.entries(status).map(([bank, state]) => (
        <OneBank key={bank} bank={bank} state={state} failed={bank === failedBank} />
      ))}
    </span>
  )
}
```

- [ ] **Step 5: Run the test**

Run the Step 3 command again. Expected: PASS.

- [ ] **Step 6: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/EnableBankingConnectionStatus.jsx frontend/src/components/EnableBankingConnectionStatus.test.jsx
git commit -m "feat: show a sync-failed badge for Enable Banking, matching Saxo's existing one"
```

---

## Task 12: SQLite backup

**Files:**
- Create: `backend/core/backup.py`
- Create: `backend/core/management/commands/backup_database.py`
- Modify: `backend/core/tasks.py`
- Modify: `backend/backend/settings.py`
- Modify: `backend/.env.example`
- Modify: `backend/core/scheduling.py` (register the new periodic task)
- Modify: `backend/core/test_scheduling.py` (update the count assertions)
- Create: `backend/core/test_backup.py`
- Modify: `.gitignore`

- [ ] **Step 1: Add settings**

In `backend/backend/settings.py`, near the `DATABASES` block:

```python
# Local SQLite backups (core.backup) - a plain file copy via SQLite's own
# online backup API (safe under WAL with concurrent writers), not a
# database-agnostic abstraction, since this app only ever runs on SQLite.
DB_BACKUP_DIR = Path(os.environ.get('DB_BACKUP_DIR', BASE_DIR / 'backups'))
DB_BACKUP_RETAIN = int(os.environ.get('DB_BACKUP_RETAIN', '14'))
```

Add to `backend/.env.example`, in a new section after `--- Celery ---`:

```
# --- Local database backups (core.backup) ---
# Where timestamped db-*.sqlite3 backups are written. Defaults to backend/backups/.
DB_BACKUP_DIR=
# How many timestamped backups to keep before pruning the oldest.
DB_BACKUP_RETAIN=14
```

- [ ] **Step 2: Add `backend/backups/` to `.gitignore` for clarity**

In `.gitignore`, under the `# Python / Django (backend/)` section, add a line: `backend/backups/` (the existing `*.sqlite3` pattern already matches backup filenames, but this makes the intent explicit for a human reading the file).

- [ ] **Step 3: Write the failing tests**

`backend/core/test_backup.py`:

```python
import sqlite3
from pathlib import Path

from django.test import TestCase, override_settings

from core.backup import backup_database


class BackupDatabaseTest(TestCase):
    def setUp(self):
        self.tmp_dir = Path(self.settings_override_dir()) if False else None

    def _backup_dir(self, tmp_path):
        return tmp_path

    @override_settings()
    def test_creates_a_timestamped_copy_of_the_live_database(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            with override_settings(DB_BACKUP_DIR=Path(tmp), DB_BACKUP_RETAIN=14):
                path = backup_database()
                self.assertTrue(path.exists())
                self.assertTrue(path.name.startswith('db-'))
                self.assertTrue(path.name.endswith('.sqlite3'))

    def test_the_copy_is_a_valid_readable_sqlite_database(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            with override_settings(DB_BACKUP_DIR=Path(tmp), DB_BACKUP_RETAIN=14):
                path = backup_database()
                con = sqlite3.connect(str(path))
                cur = con.cursor()
                cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
                tables = {row[0] for row in cur.fetchall()}
                con.close()
                self.assertIn('core_networthsnapshot', tables)

    def test_prunes_old_backups_beyond_the_retention_count(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            with override_settings(DB_BACKUP_DIR=Path(tmp), DB_BACKUP_RETAIN=2):
                first = backup_database()
                second = backup_database()
                third = backup_database()
                remaining = sorted(Path(tmp).glob('db-*.sqlite3'))
                self.assertEqual(len(remaining), 2)
                self.assertNotIn(first, remaining)
                self.assertIn(second, remaining)
                self.assertIn(third, remaining)

    def test_never_prunes_down_to_zero_even_if_retain_is_misconfigured(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            with override_settings(DB_BACKUP_DIR=Path(tmp), DB_BACKUP_RETAIN=0):
                backup_database()
                backup_database()
                remaining = list(Path(tmp).glob('db-*.sqlite3'))
                self.assertEqual(len(remaining), 1)

    def test_creates_the_backup_directory_if_missing(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / 'nested' / 'backups'
            with override_settings(DB_BACKUP_DIR=target, DB_BACKUP_RETAIN=14):
                path = backup_database()
                self.assertTrue(path.exists())
```

(Remove the unused `setUp`/`_backup_dir` scaffolding above before finalizing — it was left in mid-draft; every test should use its own `tempfile.TemporaryDirectory()` + `override_settings` block as shown, so tests never touch the real `backend/backups/` directory or leak state between tests.)

- [ ] **Step 4: Run to verify failure**

Run: `cd backend && python manage.py test core.test_backup -v 2`
Expected: FAIL (`ModuleNotFoundError: No module named 'core.backup'`).

- [ ] **Step 5: Write `core/backup.py`**

```python
"""Local SQLite backups.

Uses sqlite3's own online backup API (Connection.backup), not a raw file
copy - a file copy taken while WAL-mode Django is mid-write can capture a
torn, unreadable snapshot; the backup API is SQLite's own answer to backing
up a live database safely, copying page-by-page under a lock it manages
itself.

The Fernet key that encrypts SaxoCredential/EnableBankingCredential tokens
(SAXO_TOKEN_ENCRYPTION_KEY) lives in backend/.env, not the database, and is
deliberately NOT backed up here - copying .env would also copy every other
secret in it (SAXO_SECRET, FINNHUB_API_KEY, ENABLE_BANKING_PRIVATE_KEY).
Losing that key only forces reconnecting Saxo/Enable Banking - low stakes -
so keep .env's own values written down somewhere durable yourself (a
password manager); restoring a database backup without it is still fully
usable, just re-authenticate the two integrations afterwards.

Restoring: stop the app and any Celery worker/beat process, then
    cp backend/backups/db-<timestamp>.sqlite3 backend/db.sqlite3
and restart. There is no in-app restore command deliberately - this is a
rare, high-stakes action better done as a conscious, explicit file copy.
"""
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)


def backup_database():
    """Writes a new timestamped backup and prunes old ones. Returns the
    Path of the backup just written."""
    backup_dir = Path(settings.DB_BACKUP_DIR)
    backup_dir.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')
    dest_path = backup_dir / f'db-{stamp}.sqlite3'

    source = sqlite3.connect(str(settings.DATABASES['default']['NAME']))
    dest = sqlite3.connect(str(dest_path))
    try:
        source.backup(dest)
    finally:
        dest.close()
        source.close()

    logger.info('Database backed up to %s', dest_path)
    _prune(backup_dir)
    return dest_path


def _prune(backup_dir):
    retain = max(settings.DB_BACKUP_RETAIN, 1)  # never prune to zero
    backups = sorted(backup_dir.glob('db-*.sqlite3'))
    for stale in backups[:-retain] if len(backups) > retain else []:
        stale.unlink()
        logger.info('Pruned old backup %s', stale)
```

- [ ] **Step 6: Run the tests**

Run: `cd backend && python manage.py test core.test_backup -v 2`
Expected: PASS (5 tests).

- [ ] **Step 7: Write the management command**

`backend/core/management/commands/backup_database.py`:

```python
from django.core.management.base import BaseCommand

from core.backup import backup_database


class Command(BaseCommand):
    help = 'Write a timestamped SQLite backup and prune old ones. See core.backup for restore instructions.'

    def handle(self, *args, **options):
        try:
            path = backup_database()
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f'Backup failed: {exc}'))
            raise
        self.stdout.write(self.style.SUCCESS(f'Backed up to {path}'))
```

- [ ] **Step 8: Add the Celery task**

In `backend/core/tasks.py`:

```python
from celery import shared_task

from .backup import backup_database
from .services import ensure_todays_snapshot


@shared_task
def snapshot_net_worth():
    """Record today's net worth on a schedule rather than on page load.

    `ensure_todays_snapshot` is also called by NetWorthHistoryView, but a view
    only runs when somebody opens the app - so any day nobody visited left a
    permanent hole in the history (2026-08-28 is one such hole). Scheduling it
    makes the series depend on the app running, not on being looked at.

    Idempotent: `ensure_todays_snapshot` returns the existing row if today's
    snapshot already exists, so overlapping with the view call is harmless.
    """
    return ensure_todays_snapshot().pk


@shared_task
def backup_database_task():
    """Thin wrapper so a backup failure shows up as a failed Celery task
    (visible the same way any other scheduled job's failure is) rather than
    only in a log file nobody is tailing."""
    return str(backup_database())
```

- [ ] **Step 9: Register the periodic task**

In `backend/core/scheduling.py`, add to `PERIODIC_TASKS`:

```python
    'Backup database': {
        'task': 'core.tasks.backup_database_task',
        'crontab': {'minute': '30', 'hour': '4'},  # after the 04:00 sector backfill, before nothing else is scheduled near it
    },
```

- [ ] **Step 10: Update `core/test_scheduling.py`'s count-based assertions**

The `test_creates_every_declared_task`/`test_is_idempotent` tests already assert `len(PERIODIC_TASKS)`, so they need no numeric literal changes - just re-run them to confirm. Add one new targeted test:

```python
    def test_backup_runs_daily_at_0430_utc(self):
        sync_periodic_tasks()
        task = PeriodicTask.objects.get(name='Backup database')
        self.assertEqual(task.task, 'core.tasks.backup_database_task')
        self.assertEqual(task.crontab.minute, '30')
        self.assertEqual(task.crontab.hour, '4')
```

- [ ] **Step 11: Run the full `core` suite**

Run: `cd backend && python manage.py test core -v 2`
Expected: PASS.

- [ ] **Step 12: Manually verify the command against the real dev database (read-only check, safe)**

Run: `cd backend && python manage.py backup_database`

Then confirm: `ls -la backend/backups/` shows one new `db-<timestamp>.sqlite3` file, and re-run `python manage.py migrate core` once more (harmless, already-applied) is unaffected — this step only proves the command works end-to-end against the real file, it does not touch the live `db.sqlite3`.

- [ ] **Step 13: Commit**

```bash
git add backend/core/backup.py backend/core/management/commands/backup_database.py backend/core/tasks.py backend/backend/settings.py backend/.env.example backend/core/scheduling.py backend/core/test_scheduling.py backend/core/test_backup.py .gitignore
git commit -m "feat: add a scheduled, rotated local SQLite backup"
```

---

## Task 13: Full-suite verification + final targeted review

- [ ] **Step 1: Run the entire backend suite**

Run: `cd backend && python manage.py test -v 2`
Expected: PASS, 0 failures. Record the total test count for the final report.

- [ ] **Step 2: Run the entire frontend suite, lint, and build**

Run: `cd frontend && npm test && npm run lint && npm run build`
Expected: PASS, all three. Record the total test count.

- [ ] **Step 3: Re-read every file this plan touched, end to end, in one pass**

Files: `core/models.py`, `core/services.py`, `core/serializers.py`, `core/scheduling.py`, `core/backup.py`, `core/tasks.py`, `accounts/views.py`, `portfolio/insights.py`, `saxo/client.py`, `saxo/tasks.py`, `enablebanking/client.py`, `enablebanking/tasks.py`, `enablebanking/credentials.py`, `enablebanking/views.py`, plus the frontend files from Tasks 5 and 11. Check specifically for: any place still reading `NetWorthSnapshot.net_worth` and assuming the old formula (grep `\.net_worth\b` across `backend/` and `frontend/src/` for anything this plan didn't already touch), any leftover reference to `client.SaxoAPIError`/`client.EnableBankingAPIError` in an `autoretry_for` that should have moved to the transient subclass, and any test file left asserting the pre-fix numbers.

- [ ] **Step 4: Confirm no `PeriodicTask` schedule changed unexpectedly**

Run the same DB dump command from Task 7 Step 7 again and diff it by eye against that step's recorded expectation.

- [ ] **Step 5: Write the final report** (see the brief's §9 FINAL VERIFICATION structure — produced in chat after this plan finishes, not as a repo file).
