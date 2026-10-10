# Investors Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/investors` into a TrueWallet-style hub: shelves of cross-fund signals, ~88 style-tagged funds, follow, a portfolio-story profile, and add-any-13F-filer.

**Architecture:** A derived `PositionMove` table (one row per investor × quarter × holding, classified once by `changes.py`) is rebuilt by `moves.rebuild(investor)` whenever the importer stores a filing. `signals.py` reads it to answer the hub shelves and the Stocks table; `summaries.cards()` reads it for the directory. `tracking.py` owns search/add/stop. The frontend gets one `hub/` request for all shelves, a directory filtered by URL params, and a single-scroll profile.

**Tech Stack:** Django + DRF, SQLite, Celery; Vite + React 19 (JS), React Router, TanStack Query, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-investors-hub-design.md`

## Global Constraints

- Branch: `feat/investors-hub` (already exists, spec committed).
- **Zero comments in generated code** (AGENTS.md). Leave existing comments untouched.
- Test-first. Backend: `cd backend && .venv/bin/python manage.py test investors`. Frontend: `cd frontend && npx vitest run <path>`.
- A migration is not done until `cd backend && .venv/bin/python manage.py migrate` ran against the dev DB.
- Nothing under `/api/investors/` calls EDGAR at request time **except** `search/` and `POST /` (explicit user actions).
- `changes.position_change` / `changes.compare` stay the only definition of new / added / trimmed / sold out.
- Stored `Filing` / `Holding` rows are never rewritten; `PositionMove` is a rebuildable cache.
- Option rows (`put_call != ''`) are excluded from every stock signal.
- Styles are exactly: `Value, Growth, Activist, Macro, Tech, Concentrated, Contrarian, Quant`.
- Reserved slugs: `hub`, `stocks`, `search`.
- Use the existing design system (`docs/design-system.md`, `components/ui.jsx`); no new visual language, no new dependencies.
- No return/performance UI. Sub-project 3 adds it; do not render a placeholder.
- Money in these pages is USD as filed: use `fmtUsdCompact`, never `fmtEur`.

## Review Focus

1. **A fund with only one stored quarter.** Its moves have `kind=None`; it must count as an owner but never as a buyer, and its card shows `—` for changes (Task 2, 3, 6 tests).
2. **An amendment arriving after moves were built.** Signals must follow the restated holdings (Task 2 test).
3. **A stock and its options under one CUSIP.** A fund holding NVDA shares and NVDA calls is one owner, and a new call is not a "new position" (Task 6 test).
4. **Adding a filer whose name slugs to a reserved or taken slug** ("Hub Capital" → `hub`). The route must not be shadowed (Task 7 test).
5. **EDGAR being down or the search query containing `&`.** `search/` answers 502 with a message, never 500, and the query is URL-encoded (Task 7 tests).

---

## File Structure

Backend (`backend/investors/`):

| File | Responsibility |
|---|---|
| `models.py` (modify) | `STYLES`, `Investor.styles`, `Investor.followed`, `PositionMove` |
| `moves.py` (create) | Only writer of `PositionMove`: `rebuild`, `rebuild_all` |
| `signals.py` (create) | Signal quarter, hub shelves, stock activity |
| `tracking.py` (create) | `search`, `add`, `stop` and their errors |
| `summaries.py` (modify) | `cards()` from moves; detail gains moves/sectors/top5 |
| `edgar.py` (modify) | `search_filers`, `filer` |
| `curated.py`, `curated.csv` (modify) | styles column, 88 funds |
| `tasks.py` (modify) | `backfill_investor` |
| `views.py`, `urls.py` (modify) | hub, stocks, search, PATCH, POST, DELETE |
| `management/commands/rebuild_moves.py` (create) | regenerate every move |

Frontend (`frontend/src/`):

| File | Responsibility |
|---|---|
| `api/client/investors.js`, `api/queries/investors.js` (modify) | new endpoints, optimistic follow |
| `lib/investorHub.js` (create) | chips, move sentences, signal sentences, see-all targets |
| `components/ShelfCards.jsx` (create) | generic shelf card layout, extracted from Discover's `ShelfRow` |
| `components/investors/ImportProgress.jsx` (create) | moved out of `SnapshotPanel` |
| `components/investors/{InvestorAvatar,StyleChips,FollowButton,InvestorCard,StockSignalCard,Shelf,InvestorDirectory}.jsx` (create) | hub pieces |
| `components/investors/{InvestorHero,LatestMoves,ConcentrationPanel}.jsx` (create) | profile pieces |
| `components/investors/AddInvestorDialog.jsx` (create) | search + add |
| `pages/Investors.jsx`, `pages/Investor.jsx` (rewrite) | hub, profile |
| `pages/InvestorStocks.jsx` (create) | Stocks table |
| `components/investors/{SnapshotPanel,ChangesTab}.jsx` (delete) | retired |

---

### Task 1: Schema — styles, followed, PositionMove

**Files:**
- Modify: `backend/investors/models.py`
- Create: `backend/investors/migrations/0002_investor_hub.py` (generated)
- Test: `backend/investors/test_models.py`

**Interfaces:**
- Produces: `models.STYLES` (tuple of str); `Investor.styles: list[str]`, `Investor.followed: bool`; `PositionMove` with fields `investor, quarter_end, cusip, put_call, issuer, kind, shares, previous_shares, value, previous_value, weight_pct, previous_weight_pct, change_pct`; reverse accessor `investor.moves`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/investors/test_models.py`:

```python
from datetime import date

from django.db import IntegrityError, transaction
from django.test import TestCase

from .factories import make_investor
from .models import STYLES, PositionMove


class InvestorHubFieldsTest(TestCase):
    def test_a_new_investor_has_no_styles_and_is_not_followed(self):
        investor = make_investor()
        self.assertEqual((investor.styles, investor.followed), ([], False))

    def test_the_style_vocabulary_is_fixed(self):
        self.assertEqual(
            STYLES, ('Value', 'Growth', 'Activist', 'Macro', 'Tech', 'Concentrated', 'Contrarian', 'Quant'),
        )


class PositionMoveTest(TestCase):
    def move(self, investor, **over):
        fields = {
            'investor': investor, 'quarter_end': date(2026, 6, 30), 'cusip': '037833100', 'put_call': '',
            'issuer': 'APPLE INC', 'kind': 'new', 'shares': 10, 'value': 100, 'weight_pct': 100.0,
        }
        fields.update(over)
        return PositionMove.objects.create(**fields)

    def test_one_row_per_investor_quarter_and_holding_side(self):
        investor = make_investor()
        self.move(investor)
        self.move(investor, put_call='CALL')
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.move(investor)

    def test_comparison_fields_are_optional(self):
        move = self.move(make_investor(), kind=None)
        self.assertEqual(
            (move.kind, move.previous_shares, move.previous_value, move.previous_weight_pct, move.change_pct),
            (None, None, None, None, None),
        )

    def test_deleting_an_investor_deletes_its_moves(self):
        investor = make_investor()
        self.move(investor)
        investor.delete()
        self.assertEqual(PositionMove.objects.count(), 0)
```

(If `test_models.py` already imports some of these names, merge the imports instead of duplicating them.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python manage.py test investors.test_models`
Expected: FAIL with `ImportError: cannot import name 'STYLES'`.

- [ ] **Step 3: Implement**

In `backend/investors/models.py`, add above `class Investor`:

```python
STYLES = ('Value', 'Growth', 'Activist', 'Macro', 'Tech', 'Concentrated', 'Contrarian', 'Quant')
```

Add to `Investor` after `quarters_expected`:

```python
    styles = models.JSONField(default=list, blank=True)
    followed = models.BooleanField(default=False)
```

Append to the file:

```python
class PositionMove(models.Model):
    investor = models.ForeignKey(Investor, related_name='moves', on_delete=models.CASCADE)
    quarter_end = models.DateField()
    cusip = models.CharField(max_length=9)
    put_call = models.CharField(max_length=4, blank=True, default='')
    issuer = models.CharField(max_length=200)
    kind = models.CharField(max_length=10, null=True, blank=True)
    shares = models.BigIntegerField()
    previous_shares = models.BigIntegerField(null=True, blank=True)
    value = models.BigIntegerField()
    previous_value = models.BigIntegerField(null=True, blank=True)
    weight_pct = models.FloatField()
    previous_weight_pct = models.FloatField(null=True, blank=True)
    change_pct = models.FloatField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['investor', 'quarter_end', 'cusip', 'put_call'], name='move_investor_quarter_holding',
            ),
        ]
        indexes = [
            models.Index(fields=['quarter_end', 'kind'], name='move_quarter_kind_idx'),
            models.Index(fields=['cusip'], name='move_cusip_idx'),
        ]

    def __str__(self):
        return f'{self.investor.slug} {self.quarter_end} {self.cusip} {self.kind}'
```

- [ ] **Step 4: Generate and apply the migration**

Run:
```bash
cd backend && .venv/bin/python manage.py makemigrations investors -n investor_hub
.venv/bin/python manage.py migrate
```
Expected: `0002_investor_hub.py` created with two `AddField`s and `CreateModel PositionMove`; `migrate` prints `Applying investors.0002_investor_hub... OK`.

- [ ] **Step 5: Run tests**

Run: `cd backend && .venv/bin/python manage.py test investors`
Expected: PASS (all existing tests plus the five new ones).

- [ ] **Step 6: Commit**

```bash
git add backend/investors/models.py backend/investors/migrations/0002_investor_hub.py backend/investors/test_models.py
git commit -m "feat(investors): styles, followed and the PositionMove table"
```

---

### Task 2: `moves.rebuild` — the only writer of PositionMove

**Files:**
- Create: `backend/investors/moves.py`, `backend/investors/test_moves.py`, `backend/investors/management/commands/rebuild_moves.py`
- Modify: `backend/investors/importer.py` (`sync_investor`), `backend/investors/factories.py` (`store_quarter`)
- Test: `backend/investors/test_moves.py`, `backend/investors/test_importer.py`

**Interfaces:**
- Consumes: `quarters.quarter_ends(investor)`, `quarters.snapshot(investor, quarter_end) -> {(cusip, put_call): {'cusip','put_call','issuer','shares','value',...}}`, `changes.compare(current_shares, previous_shares) -> (per_key, sold_out)`.
- Produces: `moves.rebuild(investor) -> int` (rows written), `moves.rebuild_all() -> int`. `factories.store_quarter(..., rebuild=True)` now rebuilds moves, so tests that store quarters get moves for free.

- [ ] **Step 1: Write the failing tests**

Create `backend/investors/test_moves.py`:

```python
from datetime import date
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from . import moves
from .factories import make_investor, store_quarter
from .models import Filing, PositionMove

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)
AAPL, NVDA, ALLY, TSLA = '037833100', '67066G104', '02005N100', '88160R101'


def kinds(investor, quarter_end):
    rows = PositionMove.objects.filter(investor=investor, quarter_end=quarter_end)
    return {(row.cusip, row.put_call): row.kind for row in rows}


class RebuildTest(TestCase):
    def setUp(self):
        self.investor = make_investor()

    def test_the_first_stored_quarter_has_no_classification(self):
        store_quarter(self.investor, Q1, [(AAPL, 'APPLE INC', 100, 600)], rebuild=False)

        self.assertEqual(moves.rebuild(self.investor), 1)

        row = PositionMove.objects.get()
        self.assertEqual((row.kind, row.previous_shares, row.change_pct, row.weight_pct), (None, None, None, 100.0))

    def test_classifies_each_holding_against_the_previous_quarter(self):
        store_quarter(self.investor, Q1, [
            (AAPL, 'APPLE INC', 100, 600), (ALLY, 'ALLY FINL INC', 50, 300), (TSLA, 'TESLA INC', 10, 100),
        ], rebuild=False)
        store_quarter(self.investor, Q2, [
            (AAPL, 'APPLE INC', 150, 900), (TSLA, 'TESLA INC', 5, 40), (NVDA, 'NVIDIA CORP', 1, 60),
        ], rebuild=False)

        moves.rebuild(self.investor)

        self.assertEqual(kinds(self.investor, Q2), {
            (AAPL, ''): 'added', (TSLA, ''): 'trimmed', (NVDA, ''): 'new', (ALLY, ''): 'sold_out',
        })
        added = PositionMove.objects.get(quarter_end=Q2, cusip=AAPL)
        self.assertEqual(
            (added.shares, added.previous_shares, added.value, added.previous_value, added.change_pct),
            (150, 100, 900, 600, 50.0),
        )
        self.assertEqual((added.weight_pct, added.previous_weight_pct), (90.0, 60.0))
        sold = PositionMove.objects.get(quarter_end=Q2, cusip=ALLY)
        self.assertEqual(
            (sold.shares, sold.value, sold.weight_pct, sold.previous_weight_pct, sold.change_pct, sold.issuer),
            (0, 0, 0.0, 30.0, -100.0, 'ALLY FINL INC'),
        )

    def test_options_are_kept_apart_from_the_stock(self):
        store_quarter(self.investor, Q1, [(NVDA, 'NVIDIA CORP', 10, 100)], rebuild=False)
        store_quarter(self.investor, Q2, [
            (NVDA, 'NVIDIA CORP', 10, 100), (NVDA, 'NVIDIA CORP', 5, 20, 'CALL'),
        ], rebuild=False)

        moves.rebuild(self.investor)

        self.assertEqual(kinds(self.investor, Q2), {(NVDA, ''): 'unchanged', (NVDA, 'CALL'): 'new'})

    def test_a_later_restatement_changes_the_moves(self):
        store_quarter(self.investor, Q1, [(AAPL, 'APPLE INC', 100, 600)], rebuild=False)
        store_quarter(self.investor, Q2, [(AAPL, 'APPLE INC', 100, 600)], rebuild=False)
        moves.rebuild(self.investor)
        self.assertEqual(kinds(self.investor, Q2), {(AAPL, ''): 'unchanged'})

        store_quarter(
            self.investor, Q2, [(AAPL, 'APPLE INC', 40, 240), (NVDA, 'NVIDIA CORP', 1, 60)],
            filed_on=date(2026, 9, 1), amendment_type=Filing.RESTATEMENT, rebuild=False,
        )
        moves.rebuild(self.investor)

        self.assertEqual(kinds(self.investor, Q2), {(AAPL, ''): 'trimmed', (NVDA, ''): 'new'})

    def test_rebuilding_twice_leaves_the_same_rows(self):
        store_quarter(self.investor, Q1, [(AAPL, 'APPLE INC', 100, 600)], rebuild=False)
        store_quarter(self.investor, Q2, [(AAPL, 'APPLE INC', 150, 900)], rebuild=False)

        self.assertEqual(moves.rebuild(self.investor), moves.rebuild(self.investor))
        self.assertEqual(PositionMove.objects.count(), 2)

    def test_only_that_investors_rows_are_replaced(self):
        other = make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')
        store_quarter(other, Q1, [(AAPL, 'APPLE INC', 1, 1)], rebuild=False)
        moves.rebuild(other)
        store_quarter(self.investor, Q1, [(AAPL, 'APPLE INC', 1, 1)], rebuild=False)

        moves.rebuild(self.investor)

        self.assertEqual(PositionMove.objects.filter(investor=other).count(), 1)

    def test_an_investor_without_filings_has_no_moves(self):
        self.assertEqual(moves.rebuild(self.investor), 0)


class StoreQuarterFactoryTest(TestCase):
    def test_storing_a_quarter_rebuilds_moves_by_default(self):
        investor = make_investor()
        store_quarter(investor, Q1, [(AAPL, 'APPLE INC', 100, 600)])
        self.assertEqual(PositionMove.objects.filter(investor=investor).count(), 1)


class RebuildMovesCommandTest(TestCase):
    def test_rebuilds_every_investor_and_reports_the_row_count(self):
        investor = make_investor()
        store_quarter(investor, Q1, [(AAPL, 'APPLE INC', 100, 600)], rebuild=False)
        out = StringIO()

        call_command('rebuild_moves', stdout=out)

        self.assertEqual(PositionMove.objects.count(), 1)
        self.assertIn('1 moves', out.getvalue())
```

Append to `backend/investors/test_importer.py` (add `from unittest.mock import patch` and `from . import importer` if not already imported there):

```python
class SyncRebuildsMovesTest(TestCase):
    ENTRY = {
        'accession': 'A-1', 'form': '13F-HR', 'filed_on': date(2026, 8, 14), 'quarter_end': date(2026, 6, 30),
    }

    def run_sync(self, stored_now):
        investor = make_investor()
        with patch('investors.importer.edgar.filings', return_value=[self.ENTRY]), \
                patch('investors.importer._import_filing', return_value=stored_now), \
                patch('investors.importer.moves.rebuild') as rebuild:
            importer.sync_investor(investor, date(2021, 1, 1), resolve=False)
        return investor, rebuild

    def test_a_stored_filing_rebuilds_that_investors_moves(self):
        investor, rebuild = self.run_sync(True)
        rebuild.assert_called_once_with(investor)

    def test_nothing_new_leaves_the_moves_alone(self):
        _, rebuild = self.run_sync(False)
        rebuild.assert_not_called()
```

(Ensure `date`, `TestCase` and `make_investor` are imported at the top of `test_importer.py`; add any that are missing.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python manage.py test investors.test_moves investors.test_importer`
Expected: FAIL with `ImportError: cannot import name 'moves'`.

- [ ] **Step 3: Implement `moves.py`**

Create `backend/investors/moves.py`:

```python
from django.db import transaction

from . import changes, quarters
from .models import Investor, PositionMove

BATCH = 500


def _weight(value, total):
    return round(value / total * 100, 2) if total else 0.0


def _shares(snap):
    return {key: row['shares'] for key, row in snap.items()}


def _total(snap):
    return sum(row['value'] for row in snap.values())


def _first_quarter(investor, quarter_end, snap):
    total = _total(snap)
    for (cusip, put_call), row in snap.items():
        yield PositionMove(
            investor=investor, quarter_end=quarter_end, cusip=cusip, put_call=put_call, issuer=row['issuer'],
            kind=None, shares=row['shares'], value=row['value'], weight_pct=_weight(row['value'], total),
        )


def _compared_quarter(investor, quarter_end, snap, previous_snap):
    total, previous_total = _total(snap), _total(previous_snap)
    per_key, sold_out = changes.compare(_shares(snap), _shares(previous_snap))
    for key, row in snap.items():
        kind, pct = per_key[key]
        before = previous_snap.get(key)
        yield PositionMove(
            investor=investor, quarter_end=quarter_end, cusip=key[0], put_call=key[1], issuer=row['issuer'],
            kind=kind, shares=row['shares'], previous_shares=before['shares'] if before else None,
            value=row['value'], previous_value=before['value'] if before else None,
            weight_pct=_weight(row['value'], total),
            previous_weight_pct=_weight(before['value'], previous_total) if before else None,
            change_pct=pct,
        )
    for key in sold_out:
        before = previous_snap[key]
        yield PositionMove(
            investor=investor, quarter_end=quarter_end, cusip=key[0], put_call=key[1], issuer=before['issuer'],
            kind=changes.SOLD_OUT, shares=0, previous_shares=before['shares'],
            value=0, previous_value=before['value'], weight_pct=0.0,
            previous_weight_pct=_weight(before['value'], previous_total), change_pct=-100.0,
        )


@transaction.atomic
def rebuild(investor):
    rows = []
    previous_snap = None
    for quarter_end in sorted(quarters.quarter_ends(investor)):
        snap = quarters.snapshot(investor, quarter_end)
        if previous_snap is None:
            rows.extend(_first_quarter(investor, quarter_end, snap))
        else:
            rows.extend(_compared_quarter(investor, quarter_end, snap, previous_snap))
        previous_snap = snap
    PositionMove.objects.filter(investor=investor).delete()
    PositionMove.objects.bulk_create(rows, batch_size=BATCH)
    return len(rows)


def rebuild_all():
    return sum(rebuild(investor) for investor in Investor.objects.all())
```

- [ ] **Step 4: Hook the importer and the factory, add the command**

In `backend/investors/importer.py` change the import line to:

```python
from . import edgar, figi, moves, parse
```

and in `sync_investor`, between the `finally:` block and `if resolve:`, add:

```python
    if result.imported:
        moves.rebuild(investor)
```

In `backend/investors/factories.py` add `from . import moves` under the existing imports, change the signature to

```python
def store_quarter(investor, quarter_end, holdings, *, filed_on=None, amendment_type='', form=None, rebuild=True):
```

and replace its last line `return filing` with:

```python
    if rebuild:
        moves.rebuild(investor)
    return filing
```

Create `backend/investors/management/commands/rebuild_moves.py`:

```python
from django.core.management.base import BaseCommand

from investors import moves


class Command(BaseCommand):
    help = 'Regenerate every PositionMove from the stored filings.'

    def handle(self, *args, **options):
        self.stdout.write(f'{moves.rebuild_all()} moves')
```

- [ ] **Step 5: Run tests**

Run: `cd backend && .venv/bin/python manage.py test investors`
Expected: PASS.

- [ ] **Step 6: Build moves for the dev database**

Run: `cd backend && .venv/bin/python manage.py rebuild_moves`
Expected: prints `<N> moves` with N > 0 (the 19 already-imported funds).

- [ ] **Step 7: Commit**

```bash
git add backend/investors/moves.py backend/investors/test_moves.py backend/investors/importer.py backend/investors/test_importer.py backend/investors/factories.py backend/investors/management/commands/rebuild_moves.py
git commit -m "feat(investors): materialise position moves on import"
```

---

### Task 3: Directory cards read from moves

**Files:**
- Modify: `backend/investors/summaries.py` (`_header`, `holds_ticker`, `card`), `backend/investors/views.py` (`InvestorListView.get`)
- Test: `backend/investors/test_list_api.py`

**Interfaces:**
- Consumes: `PositionMove` rows from Task 2.
- Produces: `summaries.cards(investors, today) -> list[dict]` (same keys as today's card plus `styles`, `followed`), `summaries.card(investor, today) -> dict`, `summaries.holder_ids(ticker) -> set[int]`. `holds_ticker` is removed.

- [ ] **Step 1: Write the failing tests**

Append inside `InvestorListApiTest` in `backend/investors/test_list_api.py`:

```python
    def test_a_card_carries_styles_and_followed(self):
        make_investor(styles=['Value', 'Concentrated'], followed=True)
        card = self.card('berkshire-hathaway')
        self.assertEqual((card['styles'], card['followed']), (['Value', 'Concentrated'], True))

    def test_cards_cost_the_same_number_of_queries_for_one_or_many_investors(self):
        for index in range(6):
            investor = make_investor(name=f'M{index}', firm=f'F{index}', cik=index + 1, slug=f'f{index}')
            store_quarter(investor, Q1, [('037833100', 'APPLE INC', 10, 600)])
            store_quarter(investor, Q2, [('037833100', 'APPLE INC', 12, 700)])
        with self.assertNumQueries(4):
            self.client.get(self.url)

    def test_an_investor_still_importing_has_an_empty_card(self):
        make_investor(quarters_expected=0)
        card = self.card('berkshire-hathaway')
        self.assertEqual((card['latest_quarter'], card['total_value'], card['new_count']), (None, None, None))
        self.assertEqual(card['import']['quarters_expected'], 0)

    def test_holds_matches_only_the_latest_quarter(self):
        seller = make_investor()
        store_quarter(seller, Q1, [('037833100', 'APPLE INC', 10, 600)])
        store_quarter(seller, Q2, [('67066G104', 'NVIDIA CORP', 1, 300)])
        holder = make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')
        store_quarter(holder, Q2, [('037833100', 'APPLE INC', 10, 600)])
        Security.objects.create(cusip='037833100', ticker='AAPL')

        response = self.client.get(self.url, {'holds': 'aapl'})

        self.assertEqual([card['slug'] for card in response.data], ['pershing-square'])
```

The query count of 4 is: investors, latest quarter per investor, moves for that quarter, tickers. `importer.progress` runs no query while `quarters_expected` is `None`. If the count differs by a fixed amount for a reason you can name (for example an auth query), set the number to what one investor costs and keep the assertion that six cost the same.

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python manage.py test investors.test_list_api`
Expected: FAIL (`KeyError: 'styles'`, and the query-count test fails with a count that grows per investor).

- [ ] **Step 3: Implement**

In `backend/investors/summaries.py`:

Add imports at the top (merge with the existing ones):

```python
from collections import defaultdict

from .models import Investor, PositionMove, Security
```

Add two keys to `_header`'s dict:

```python
        'styles': investor.styles,
        'followed': investor.followed,
```

Delete `holds_ticker` and the old `card`, and add in their place:

```python
def _latest_quarters(investor_ids):
    rows = (
        PositionMove.objects.filter(investor_id__in=investor_ids)
        .values('investor_id').annotate(latest=Max('quarter_end'))
    )
    return {row['investor_id']: row['latest'] for row in rows}


def _moves_by_investor(latest):
    grouped = defaultdict(list)
    for quarter_end in set(latest.values()):
        ids = [pk for pk, quarter in latest.items() if quarter == quarter_end]
        for move in PositionMove.objects.filter(quarter_end=quarter_end, investor_id__in=ids):
            grouped[move.investor_id].append(move)
    return grouped


def _held(moves):
    held = [move for move in moves if move.kind != changes.SOLD_OUT]
    return sorted(held, key=lambda move: (-move.value, move.cusip, move.put_call))


def _card(investor, today, quarter_end, moves, held, tickers):
    base = {
        **_header(investor, today),
        'latest_quarter': None,
        'total_value': None,
        'positions': None,
        'top10_weight': None,
        'top_holdings': [],
        'new_count': None,
        'exited_count': None,
    }
    if quarter_end is None:
        return base
    compared = any(move.kind is not None for move in moves)
    base.update({
        'latest_quarter': quarter_end.isoformat(),
        'total_value': sum(move.value for move in held),
        'positions': len(held),
        'top10_weight': round(sum(move.weight_pct for move in held[:TOP_TEN]), 2),
        'top_holdings': [
            {'cusip': move.cusip, 'ticker': tickers.get(move.cusip), 'issuer': move.issuer, 'weight': move.weight_pct}
            for move in held[:TOP_HOLDINGS]
        ],
        'new_count': sum(1 for move in held if move.kind == changes.NEW) if compared else None,
        'exited_count': len(moves) - len(held) if compared else None,
    })
    return base


def cards(investors, today):
    investors = list(investors)
    latest = _latest_quarters([investor.pk for investor in investors])
    grouped = _moves_by_investor(latest)
    held = {pk: _held(moves) for pk, moves in grouped.items()}
    tickers = tickers_for({move.cusip for rows in held.values() for move in rows[:TOP_HOLDINGS]})
    return [
        _card(investor, today, latest.get(investor.pk), grouped.get(investor.pk, []), held.get(investor.pk, []), tickers)
        for investor in investors
    ]


def card(investor, today):
    return cards([investor], today)[0]


def holder_ids(ticker):
    cusips = list(Security.objects.filter(ticker__iexact=ticker).values_list('cusip', flat=True))
    rows = (
        PositionMove.objects.filter(cusip__in=cusips).exclude(kind=changes.SOLD_OUT)
        .values_list('investor_id', 'quarter_end')
    )
    rows = list(rows)
    latest = _latest_quarters({investor_id for investor_id, _ in rows})
    return {investor_id for investor_id, quarter_end in rows if latest.get(investor_id) == quarter_end}
```

In `backend/investors/views.py` replace `InvestorListView.get` with:

```python
    def get(self, request):
        investors = Investor.objects.all()
        holds = request.query_params.get('holds', '').strip()
        if holds:
            investors = investors.filter(pk__in=summaries.holder_ids(holds))
        return Response(summaries.cards(investors, date.today()))
```

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv/bin/python manage.py test investors`
Expected: PASS. Existing card tests keep passing because `store_quarter` now builds moves.

- [ ] **Step 5: Commit**

```bash
git add backend/investors/summaries.py backend/investors/views.py backend/investors/test_list_api.py
git commit -m "feat(investors): directory cards read position moves in a fixed number of queries"
```

---

### Task 4: Profile payload and follow

**Files:**
- Modify: `backend/investors/summaries.py` (`detail`), `backend/investors/views.py` (`InvestorDetailView`)
- Test: `backend/investors/test_detail_api.py`

**Interfaces:**
- Consumes: `investor.moves`, `summaries.card`.
- Produces: detail payload gains `top5_weight: float`, `sectors: [{sector, weight}]`, `moves: [{cusip, put_call, ticker, issuer, kind, weight, previous_weight, shares_change_pct, value, previous_value}]` (plus `styles`, `followed` from `_header`). `PATCH /api/investors/<slug>/` with `{"followed": bool}` → 200 card.

- [ ] **Step 1: Write the failing tests**

Append inside `InvestorDetailApiTest` in `backend/investors/test_detail_api.py` (its `setUp` already stores Q1 and Q2 for `self.investor`; Q2 holds AAPL 700, NVDA 200, NVDA CALL 50, BRK 50 → total 1000):

```python
    def detail(self, **params):
        response = self.client.get(reverse('investor-detail', args=['berkshire-hathaway']), params)
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_the_story_moves_are_ordered_new_added_trimmed_sold_out(self):
        moves = self.detail()['moves']
        self.assertEqual(
            [(move['kind'], move['ticker'] or move['issuer'], move['put_call']) for move in moves],
            [('new', 'NVDA', ''), ('new', 'NVDA', 'CALL'), ('added', 'AAPL', ''), ('sold_out', 'ALLY FINL INC', '')],
        )
        added = moves[2]
        self.assertEqual((added['weight'], added['previous_weight'], added['shares_change_pct']), (70.0, 54.55, 10.0))
        self.assertEqual((moves[3]['weight'], moves[3]['previous_weight']), (0.0, 36.36))

    def test_unchanged_positions_are_not_moves(self):
        self.assertNotIn('BERKSHIRE HATHAWAY INC', [move['issuer'] for move in self.detail()['moves']])

    def test_the_first_stored_quarter_has_no_moves(self):
        self.assertEqual(self.detail(quarter='2026-03-31')['moves'], [])

    def test_concentration_is_the_top_five_weight(self):
        self.assertEqual(self.detail()['top5_weight'], 100.0)

    def test_sectors_sum_weights_and_group_the_unknown_as_other(self):
        with patch('investors.summaries.sectors.sector_for', side_effect=lambda t: {'AAPL': 'Technology'}.get(t)):
            sectors = self.detail()['sectors']
        self.assertEqual(sectors, [{'sector': 'Technology', 'weight': 70.0}, {'sector': 'Other', 'weight': 30.0}])

    def test_following_is_a_patch_that_answers_the_card(self):
        url = reverse('investor-detail', args=['berkshire-hathaway'])

        response = self.client.patch(url, {'followed': True}, format='json')

        self.assertEqual((response.status_code, response.data['followed'], response.data['slug']), (200, True, 'berkshire-hathaway'))
        self.investor.refresh_from_db()
        self.assertTrue(self.investor.followed)

    def test_following_needs_a_boolean(self):
        url = reverse('investor-detail', args=['berkshire-hathaway'])
        self.assertEqual(self.client.patch(url, {'followed': 'yes'}, format='json').status_code, 400)
```

Add `from unittest.mock import patch` to the file's imports.

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python manage.py test investors.test_detail_api`
Expected: FAIL with `KeyError: 'moves'` and `405` on PATCH.

- [ ] **Step 3: Implement**

In `backend/investors/summaries.py` add constants near the top:

```python
TOP_FIVE = 5
OTHER_SECTOR = 'Other'
MOVE_ORDER = {changes.NEW: 0, changes.ADDED: 1, changes.TRIMMED: 2, changes.SOLD_OUT: 3}
```

Add these functions above `detail`:

```python
def _sectors(holdings):
    weights = defaultdict(float)
    for holding in holdings:
        weights[holding['sector'] or OTHER_SECTOR] += holding['weight']
    ranked = sorted(weights.items(), key=lambda pair: (-pair[1], pair[0]))
    return [{'sector': sector, 'weight': round(weight, 2)} for sector, weight in ranked]


def _story_moves(investor, quarter_end):
    rows = list(investor.moves.filter(quarter_end=quarter_end, kind__in=MOVE_ORDER))
    tickers = tickers_for({row.cusip for row in rows})
    rows.sort(key=lambda row: (
        MOVE_ORDER[row.kind], -max(row.weight_pct, row.previous_weight_pct or 0.0), row.cusip, row.put_call,
    ))
    return [
        {
            'cusip': row.cusip,
            'put_call': row.put_call,
            'ticker': tickers.get(row.cusip),
            'issuer': row.issuer,
            'kind': row.kind,
            'weight': row.weight_pct,
            'previous_weight': row.previous_weight_pct,
            'shares_change_pct': row.change_pct,
            'value': row.value,
            'previous_value': row.previous_value,
        }
        for row in rows
    ]
```

In `detail`, add to the `base` dict:

```python
        'top5_weight': None,
        'sectors': [],
        'moves': [],
```

and to the final `base.update({...})`:

```python
        'top5_weight': round(sum(row['weight'] for row in rows[:TOP_FIVE]), 2),
        'sectors': _sectors(holdings),
        'moves': _story_moves(investor, quarter_end),
```

In `backend/investors/views.py` add to `InvestorDetailView`:

```python
    def patch(self, request, slug):
        investor = get_object_or_404(Investor, slug=slug)
        followed = request.data.get('followed')
        if not isinstance(followed, bool):
            raise ValidationError({'followed': 'Send true or false.'})
        Investor.objects.filter(pk=investor.pk).update(followed=followed)
        investor.followed = followed
        return Response(summaries.card(investor, date.today()))
```

- [ ] **Step 4: Run tests**

Run: `cd backend && .venv/bin/python manage.py test investors`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/investors/summaries.py backend/investors/views.py backend/investors/test_detail_api.py
git commit -m "feat(investors): profile payload carries moves, sectors and follow"
```

---

### Task 5: Coverage — 88 style-tagged funds

**Files:**
- Modify: `backend/investors/curated.csv`, `backend/investors/curated.py`
- Test: `backend/investors/test_curated.py`

**Interfaces:**
- Consumes: `models.STYLES`.
- Produces: `curated.csv` columns `name,firm,cik,styles,blurb` (`styles` is `|`-separated); `load_curated()` upserts `styles` and `blurb`.

Every CIK below was resolved against EDGAR on 2026-10-07 and has a 13F-HR filed in 2026. Funds holding thousands of positions (Citadel, Millennium, Point72, Two Sigma, D. E. Shaw, AQR, Renaissance, Tudor, GMO, Gotham) are deliberately left out: they buy nearly everything, which would drown the convergent-buy signal and multiply the table size.

- [ ] **Step 1: Write the failing tests**

In `backend/investors/test_curated.py`:

Change the expected count in `test_loads_the_shipped_list` from `{'created': 19, 'updated': 0}` to `{'created': 88, 'updated': 0}`.

Append inside `LoadCuratedTest`:

```python
    def test_every_shipped_row_has_known_styles_and_a_blurb(self):
        from .models import STYLES

        load_curated()
        for investor in Investor.objects.all():
            self.assertTrue(investor.styles, investor.slug)
            self.assertTrue(set(investor.styles) <= set(STYLES), investor.slug)
            self.assertTrue(investor.blurb, investor.slug)

    def test_shipped_slugs_are_unique_and_none_is_reserved(self):
        load_curated()
        slugs = list(Investor.objects.values_list('slug', flat=True))
        self.assertEqual(len(slugs), len(set(slugs)))
        self.assertFalse({'hub', 'stocks', 'search'} & set(slugs))

    def test_styles_are_read_from_the_pipe_separated_column(self):
        load_curated()
        self.assertEqual(Investor.objects.get(cik=1336528).styles, ['Activist', 'Concentrated'])

    def test_reloading_updates_styles_without_touching_history(self):
        load_curated()
        berkshire = Investor.objects.get(cik=1067983)
        Investor.objects.filter(pk=berkshire.pk).update(styles=[], followed=True)

        self.assertEqual(load_curated(), {'created': 0, 'updated': 1})

        berkshire.refresh_from_db()
        self.assertEqual((berkshire.styles, berkshire.followed), (['Value', 'Concentrated'], True))

    def test_an_unknown_style_is_refused(self):
        import tempfile

        with tempfile.NamedTemporaryFile('w', suffix='.csv', newline='') as handle:
            handle.write('name,firm,cik,styles,blurb\nA,B Fund,7,Momentum,x\n')
            handle.flush()
            with self.assertRaisesMessage(ValueError, 'Momentum'):
                load_curated(handle.name)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python manage.py test investors.test_curated`
Expected: FAIL (`{'created': 19...} != {'created': 88...}`).

- [ ] **Step 3: Replace `backend/investors/curated.csv`**

```csv
name,firm,cik,styles,blurb
Warren Buffett,Berkshire Hathaway,1067983,Value|Concentrated,Buys wonderful businesses at fair prices and holds them for decades.
Bill Ackman,Pershing Square Capital Management,1336528,Activist|Concentrated,Eight to twelve large positions held for years with public activist campaigns.
Michael Burry,Scion Asset Management,1649339,Contrarian|Concentrated,Deep-value contrarian known for the 2008 housing short; the portfolio turns over fast.
Seth Klarman,Baupost Group,1061768,Value,Margin-of-safety value investor who is comfortable holding cash.
Stanley Druckenmiller,Duquesne Family Office,1536411,Macro,Top-down macro investor who sizes up aggressively when conviction is high.
David Tepper,Appaloosa,1656456,Macro|Contrarian,Distressed-debt roots; buys what others are forced to sell.
Li Lu,Himalaya Capital Management,1709323,Value|Concentrated,Munger-backed value investor with a handful of long-held positions.
Mohnish Pabrai,"Dalal Street, LLC",1549575,Value|Concentrated,Few bets and big bets; openly clones other great investors.
Carl Icahn,Icahn Carl C,921669,Activist|Concentrated,The original corporate raider; takes large stakes and pushes for change.
Dan Loeb,Third Point,1040273,Activist,Event-driven activist known for sharply worded letters to boards.
Chase Coleman,Tiger Global Management,1167483,Tech|Growth,Tiger cub focused on internet and software growth companies.
Ray Dalio,Bridgewater Associates,1350694,Macro|Quant,Systematic global macro; hundreds of positions sized by rules.
Howard Marks,Oaktree Capital Management,949509,Value|Contrarian,Credit and distressed specialist who writes the memos everyone reads.
Bill & Melinda Gates Foundation Trust,Gates Foundation Trust,1166559,Concentrated,The foundation's endowment: a few very large long-term holdings.
Cathie Wood,ARK Investment Management,1697748,Tech|Growth,Disruptive-innovation growth investor with high turnover.
Terry Smith,Fundsmith,1569205,Growth|Concentrated,"Buy good companies, don't overpay, do nothing."
Chuck Akre,Akre Capital Management,1112520,Growth|Concentrated,Compounding machines held for a very long time.
Stephen Mandel,Lone Pine Capital,1061165,Growth|Tech,Tiger cub running a fundamental long-biased growth book.
Philippe Laffont,Coatue Management,1135730,Tech|Growth,Technology specialist across public and private markets.
David Einhorn,Greenlight Capital,1489933,Value|Contrarian,Value long-short investor known for forensic short theses.
Richard Pzena,Pzena Investment Management,1027796,Value,Deep value: good businesses bought at depressed earnings.
Tweedy Browne,Tweedy Browne,732905,Value,One of the oldest Graham-style value shops.
Chris Davis,Davis Selected Advisers,1036325,Value,Third-generation value investor with a heavy financials weighting.
Bill Nygren,Harris Associates,813917,Value,Oakmark's value manager: buys at a discount to private-market value.
Mason Hawkins,Southeastern Asset Management,807985,Value|Concentrated,The concentrated value portfolios behind the Longleaf funds.
Bruce Berkowitz,Fairholme Capital Management,1056831,Value|Concentrated,Ignores the crowd and holds a few very large positions.
Tom Gayner,Markel Group,1096343,Value,Insurance float invested Buffett-style in durable compounders.
Ruane Cunniff,"Ruane, Cunniff & Goldfarb",1720792,Value|Concentrated,The managers of the Sequoia Fund.
Donald Yacktman,Yacktman Asset Management,905567,Value,Patient buyer of high-quality businesses at low prices.
Wally Weitz,Weitz Investment Management,883965,Value,Omaha value investor in the Buffett tradition.
Polen Capital,Polen Capital Management,1034524,Growth|Concentrated,Concentrated quality-growth portfolios.
François Rochon,Giverny Capital,1641864,Growth,Owner-mindset investor in quality compounders.
Tom Russo,Gardner Russo & Quinn,860643,Value|Concentrated,Global consumer brands held for decades.
Nick Train,Lindsell Train,1484150,Growth|Concentrated,Very low turnover in durable brand franchises.
Guy Spier,Aquamarine Capital,1953324,Value|Concentrated,Buffett and Pabrai disciple with a small long-held portfolio.
Chris Bloomstran,Semper Augustus,1115373,Value,Quality-value investor known for his Berkshire deep dives.
Norbert Lou,Punch Card Management,1631664,Value|Concentrated,Takes the punch-card idea literally: a handful of holdings.
David Abrams,Abrams Capital Management,1358706,Value|Concentrated,Klarman protégé; concentrated and unlevered.
Mason Morfit,ValueAct Capital,1418814,Activist|Concentrated,Constructive activist that usually takes board seats.
Nelson Peltz,Trian Fund Management,1345471,Activist|Concentrated,Operational activist in consumer and industrial companies.
Paul Singer,Elliott Investment Management,1791786,Activist,One of the largest and most persistent activist funds.
Jeff Smith,Starboard Value,1517137,Activist,Activist focused on margins and capital allocation.
Barry Rosenstein,JANA Partners,1998597,Activist|Concentrated,Event-driven activist campaigns.
Keith Meister,Corvex Management,1535472,Activist,Icahn alumnus running an activist and event-driven book.
Scott Ferguson,Sachem Head Capital Management,1582090,Activist|Concentrated,Pershing Square alumnus practising concentrated activism.
Glenn Welling,Engaged Capital,1559771,Activist|Concentrated,Small- and mid-cap activist.
George Soros,Soros Fund Management,1029160,Macro,The family office of the man who broke the Bank of England.
John Paulson,Paulson & Co.,1035674,Contrarian|Concentrated,Made the 2007 subprime trade; now a concentrated family office.
Andreas Halvorsen,Viking Global Investors,1103804,Growth,Tiger cub running a large fundamental long-short book.
Lee Ainslie,Maverick Capital,934639,Growth|Tech,Tiger cub with a diversified long-short equity book.
Dan Sundheim,D1 Capital Partners,1747057,Growth,Viking alumnus investing across public and private growth.
Alex Sacerdote,Whale Rock Capital Management,1387322,Tech|Growth,Technology-focused long-short fund.
Brad Gerstner,Altimeter Capital Management,1541617,Tech|Concentrated,Concentrated technology bets.
Marc Stad,Dragoneer Investment Group,1602189,Tech|Growth,Growth investor in public and late-stage technology.
Baillie Gifford,Baillie Gifford,1088875,Growth,Edinburgh partnership making long-horizon growth bets.
Frank Sands,Sands Capital Management,1020066,Growth|Concentrated,Concentrated positions in secular growth leaders.
Henry Ellenbogen,Durable Capital Partners,1798849,Growth,Looks for small companies that can compound into large ones.
Gavin Baker,Atreides Management,1777813,Tech|Growth,Technology and consumer growth crossover investor.
Leopold Aschenbrenner,Situational Awareness,2045724,Tech|Concentrated,AI-thesis fund built around compute and power.
Chris Hohn,TCI Fund Management,1647251,Activist|Concentrated,Very concentrated; turns activist when owners are ignored.
John Armitage,Egerton Capital,1581811,Growth,London long-biased stock picker.
Julian and Felix Baker,Baker Bros. Advisors,1263508,Concentrated,Biotech specialists with long-held stakes.
Bill Miller,Miller Value Partners,1135778,Value|Contrarian,Contrarian value investor who beat the S&P 500 fifteen years running.
Larry Robbins,Glenview Capital Management,1138995,Value,Healthcare-heavy fundamental investor.
Edgar Wachenheim,Greenhaven Associates,846222,Value|Concentrated,Author of Common Stocks and Common Sense.
Duan Yongping,H&H International Investment,1759760,Value|Concentrated,Chinese entrepreneur-investor with a few very large positions.
Zhang Lei,HHLR Advisors,1762304,Growth,The public-equity arm of Hillhouse.
Daily Journal,Daily Journal Corp,783412,Value|Concentrated,The portfolio Charlie Munger built.
David Rolfe,Wedgewood Partners,859804,Growth|Concentrated,Focused quality-growth portfolio.
Pat Dorsey,Dorsey Asset Management,1671657,Growth|Concentrated,Moat-focused investing by Morningstar's former research head.
William von Mueffling,Cantillon Capital Management,1279936,Growth,Quality global equities.
Prem Watsa,Fairfax Financial Holdings,915191,Value|Contrarian,Canada's Buffett: insurance float invested in deep value.
John Rogers,Ariel Investments,936753,Value|Contrarian,Patient small- and mid-cap value.
Glenn Greenberg,Brave Warrior Advisors,1553733,Value|Concentrated,Concentrated portfolio of businesses he understands well.
Francis Chou,Chou Associates Management,1389403,Value|Contrarian,Bargain hunter who holds cash when nothing is cheap.
David Goel,Matrix Capital Management,1410830,Tech|Concentrated,Concentrated technology investor.
Jonathan Auerbach,Hound Partners,1353316,Value|Concentrated,Tiger-seeded concentrated value.
Ravenel Curry,Eagle Capital Management,945631,Value,Long-term owner of undervalued large caps.
Thomas Kahn,Kahn Brothers Group,1039565,Value,Graham-and-Dodd deep value.
Dennis Hong,ShawSpring Partners,1766908,Growth|Concentrated,Concentrated global internet and software.
Bryan Lawrence,Oakcliff Capital,1657335,Value|Concentrated,Very few positions and long holding periods.
Triple Frond Partners,Triple Frond Partners,1454502,Value|Concentrated,Low-profile concentrated compounder portfolio.
Tom Bancroft,Makaira Partners,1540866,Value|Concentrated,Concentrated value.
Alex Roepers,Atlantic Investment Management,1063296,Value|Activist,Concentrated industrial value with constructive activism.
Glen Kacher,Light Street Capital Management,1569049,Tech|Growth,Tiger cub in technology growth.
Josh Tarasoff,Greenlea Lane Capital Management,1766504,Growth|Concentrated,Very long-term owner of a few great businesses.
First Eagle,First Eagle Investment Management,1325447,Value,Global value with a gold hedge.
Dodge & Cox,Dodge & Cox,200217,Value,"Team-managed, low-turnover value."
```

- [ ] **Step 4: Teach `load_curated` the styles column**

In `backend/investors/curated.py` change the model import to `from .models import STYLES, Investor`, add:

```python
def _styles(raw):
    styles = [style.strip() for style in (raw or '').split('|') if style.strip()]
    unknown = [style for style in styles if style not in STYLES]
    if unknown:
        raise ValueError(f'Unknown style(s): {", ".join(unknown)}')
    return styles
```

and add one entry to the `values` dict inside the loop:

```python
            'styles': _styles(entry.get('styles')),
```

- [ ] **Step 5: Run tests**

Run: `cd backend && .venv/bin/python manage.py test investors.test_curated`
Expected: PASS. If the count assertion fails, count the data rows in the CSV (`tail -n +2 backend/investors/curated.csv | wc -l` must print 88) before touching the test.

- [ ] **Step 6: Load and backfill the dev database**

Run:
```bash
cd backend && .venv/bin/python manage.py load_investors
.venv/bin/python manage.py backfill_investors
```
Expected: `created 69, updated 19`, then one `<slug>: imported N, skipped M` line per fund. This takes roughly 15–30 minutes (EDGAR pacing plus OpenFIGI). A fund that fails is listed at the end; re-run with `--slug <slug>`. Moves are rebuilt by the importer hook.

Verify: `.venv/bin/python manage.py shell -c "from investors.models import *; print(Investor.objects.count(), PositionMove.objects.values('investor').distinct().count())"` prints `88` and a number close to 88.

- [ ] **Step 7: Commit**

```bash
git add backend/investors/curated.csv backend/investors/curated.py backend/investors/test_curated.py
git commit -m "feat(investors): 88 curated funds tagged by style"
```

---

### Task 6: Signals — hub shelves and stock activity

**Files:**
- Create: `backend/investors/signals.py`, `backend/investors/test_signals.py`, `backend/investors/test_hub_api.py`
- Modify: `backend/investors/views.py`, `backend/investors/urls.py`

**Interfaces:**
- Consumes: `PositionMove`, `summaries.cards`, `summaries.tickers_for`, `sectors.sector_for`.
- Produces:
  - `signals.signal_quarter() -> {'quarter': date, 'filed': int, 'tracked': int, 'newest_quarter': date, 'newest_filed': int} | None`
  - `signals.hub(today) -> {'quarter', 'filed', 'tracked', 'newest_quarter', 'newest_filed', 'shelves': [{'key','title','kind','total','items'}]}` (dates as ISO strings or `None`)
  - `signals.stock_activity(view, quarter_end=None) -> {'quarter','signal_quarter','quarters','view','rows'}`; raises `signals.UnknownView`
  - Stock item: `{'cusip','ticker','issuer','sector','owners','bought','sold','new','value','investors': [{'slug','name'}]}`; new-bets item: `{'cusip','ticker','issuer','sector','weight','value','investors': [one]}`
  - Shelf keys: `following`, `convergent-buys`, `most-sold`, `new-bets`, `just-filed`
  - Routes `investor-hub` (`hub/`), `investor-stocks` (`stocks/`)

- [ ] **Step 1: Write the failing unit tests**

Create `backend/investors/test_signals.py`:

```python
from datetime import date

from django.test import TestCase

from . import signals
from .factories import make_investor, store_quarter
from .models import Security

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)
TODAY = date(2026, 10, 5)
AAPL, NVDA, TSLA = '037833100', '67066G104', '88160R101'
BEFORE = [(AAPL, 'APPLE INC', 100, 500), (TSLA, 'TESLA INC', 100, 500)]


def fund(index, **over):
    return make_investor(name=f'Manager {index}', firm=f'Fund {index}', cik=index, slug=f'fund-{index}', **over)


def shelf(payload, key):
    return next((s for s in payload['shelves'] if s['key'] == key), None)


class SignalQuarterTest(TestCase):
    def test_no_moves_means_no_signal_quarter(self):
        fund(1)
        self.assertIsNone(signals.signal_quarter())

    def test_the_newest_quarter_counts_once_half_have_filed_it(self):
        for index in (1, 2):
            store_quarter(fund(index), Q1, BEFORE)
        store_quarter(signals.Investor.objects.get(slug='fund-1'), Q2, BEFORE)

        self.assertEqual(signals.signal_quarter(), {
            'quarter': Q2, 'filed': 1, 'tracked': 2, 'newest_quarter': Q2, 'newest_filed': 1,
        })

    def test_an_early_filing_window_falls_back_to_the_previous_quarter(self):
        for index in (1, 2, 3):
            store_quarter(fund(index), Q1, BEFORE)
        store_quarter(signals.Investor.objects.get(slug='fund-1'), Q2, BEFORE)

        self.assertEqual(signals.signal_quarter(), {
            'quarter': Q1, 'filed': 3, 'tracked': 3, 'newest_quarter': Q2, 'newest_filed': 1,
        })


class HubShelvesTest(TestCase):
    def setUp(self):
        Security.objects.create(cusip=NVDA, ticker='NVDA')
        self.funds = [fund(index) for index in (1, 2, 3, 4)]
        for investor in self.funds:
            store_quarter(investor, Q1, BEFORE)

    def after(self, investor, holdings):
        store_quarter(investor, Q2, holdings)

    def test_three_buyers_make_a_convergent_buy(self):
        for investor in self.funds[:3]:
            self.after(investor, [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250)])
        self.after(self.funds[3], BEFORE)

        buys = shelf(signals.hub(TODAY), 'convergent-buys')

        self.assertEqual((buys['kind'], buys['total']), ('stocks', 1))
        item = buys['items'][0]
        self.assertEqual(
            (item['ticker'], item['issuer'], item['bought'], item['new'], item['owners'], item['sold']),
            ('NVDA', 'NVIDIA CORP', 3, 3, 3, 0),
        )
        self.assertEqual([face['slug'] for face in item['investors']], ['fund-1', 'fund-2', 'fund-3'])

    def test_two_buyers_are_not_convergent(self):
        for investor in self.funds[:2]:
            self.after(investor, [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250)])
        for investor in self.funds[2:]:
            self.after(investor, BEFORE)

        self.assertIsNone(shelf(signals.hub(TODAY), 'convergent-buys'))

    def test_options_never_count_as_a_stock_signal(self):
        for investor in self.funds:
            self.after(investor, [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250, 'CALL')])

        payload = signals.hub(TODAY)

        self.assertIsNone(shelf(payload, 'convergent-buys'))
        self.assertIsNone(shelf(payload, 'new-bets'))

    def test_a_fund_with_one_stored_quarter_owns_but_did_not_buy(self):
        for investor in self.funds[:2]:
            self.after(investor, [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250)])
        for investor in self.funds[2:]:
            self.after(investor, BEFORE)
        store_quarter(fund(9), Q2, [(NVDA, 'NVIDIA CORP', 10, 250)])

        self.assertIsNone(shelf(signals.hub(TODAY), 'convergent-buys'))
        owned = signals.stock_activity('owned', Q2)['rows']
        self.assertEqual(next(row for row in owned if row['cusip'] == NVDA)['owners'], 3)

    def test_most_sold_counts_trims_and_exits(self):
        self.after(self.funds[0], [(AAPL, 'APPLE INC', 100, 500)])
        self.after(self.funds[1], [(AAPL, 'APPLE INC', 100, 500)])
        self.after(self.funds[2], [(AAPL, 'APPLE INC', 100, 500), (TSLA, 'TESLA INC', 40, 200)])
        self.after(self.funds[3], BEFORE)

        sold = shelf(signals.hub(TODAY), 'most-sold')

        self.assertEqual((sold['total'], sold['items'][0]['issuer'], sold['items'][0]['sold']), (1, 'TESLA INC', 3))

    def test_new_bets_rank_by_weight_and_name_the_investor(self):
        self.after(self.funds[0], [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 1000)])
        self.after(self.funds[1], [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250)])
        for investor in self.funds[2:]:
            self.after(investor, BEFORE)

        bets = shelf(signals.hub(TODAY), 'new-bets')

        self.assertEqual(bets['total'], 2)
        self.assertEqual(
            [(item['weight'], item['investors'][0]['slug']) for item in bets['items']],
            [(50.0, 'fund-1'), (20.0, 'fund-2')],
        )

    def test_following_and_just_filed_are_investor_shelves(self):
        self.funds[1].followed = True
        self.funds[1].last_filing_at = date(2026, 8, 14)
        self.funds[1].save()
        self.funds[0].last_filing_at = date(2026, 8, 20)
        self.funds[0].save()

        payload = signals.hub(TODAY)

        self.assertEqual([card['slug'] for card in shelf(payload, 'following')['items']], ['fund-2'])
        self.assertEqual([card['slug'] for card in shelf(payload, 'just-filed')['items']], ['fund-1', 'fund-2'])
        self.assertEqual(shelf(payload, 'following')['kind'], 'investors')

    def test_empty_shelves_are_left_out_and_dates_are_iso(self):
        payload = signals.hub(TODAY)

        self.assertEqual(payload['shelves'], [])
        self.assertEqual((payload['quarter'], payload['filed'], payload['tracked']), ('2026-03-31', 4, 4))

    def test_no_data_at_all_answers_an_empty_hub(self):
        signals.Investor.objects.all().delete()
        fund(1)
        self.assertEqual(signals.hub(TODAY), {
            'quarter': None, 'filed': 0, 'tracked': 1, 'newest_quarter': None, 'newest_filed': 0, 'shelves': [],
        })


class StockActivityTest(TestCase):
    def setUp(self):
        self.funds = [fund(index) for index in (1, 2)]
        for investor in self.funds:
            store_quarter(investor, Q1, BEFORE)
        store_quarter(self.funds[0], Q2, [*BEFORE, (NVDA, 'NVIDIA CORP', 10, 250)])
        store_quarter(self.funds[1], Q2, [(AAPL, 'APPLE INC', 100, 500)])

    def test_each_view_ranks_and_keeps_only_stocks_with_that_activity(self):
        self.assertEqual([row['issuer'] for row in signals.stock_activity('bought')['rows']], ['NVIDIA CORP'])
        self.assertEqual([row['issuer'] for row in signals.stock_activity('sold')['rows']], ['TESLA INC'])
        self.assertEqual([row['issuer'] for row in signals.stock_activity('new')['rows']], ['NVIDIA CORP'])
        self.assertEqual(
            [(row['issuer'], row['owners']) for row in signals.stock_activity('owned')['rows']],
            [('APPLE INC', 2), ('TESLA INC', 1), ('NVIDIA CORP', 1)],
        )

    def test_defaults_to_the_signal_quarter_and_lists_the_quarters(self):
        payload = signals.stock_activity('owned')
        self.assertEqual((payload['quarter'], payload['quarters'], payload['view']), ('2026-06-30', ['2026-06-30', '2026-03-31'], 'owned'))
        self.assertEqual(payload['signal_quarter'], '2026-06-30')

    def test_an_asked_quarter_still_reports_the_signal_quarter(self):
        payload = signals.stock_activity('owned', Q1)
        self.assertEqual((payload['quarter'], payload['signal_quarter']), ('2026-03-31', '2026-06-30'))

    def test_an_unknown_view_is_refused(self):
        with self.assertRaises(signals.UnknownView):
            signals.stock_activity('hot')
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && .venv/bin/python manage.py test investors.test_signals`
Expected: FAIL with `ImportError: cannot import name 'signals'`.

- [ ] **Step 3: Implement `signals.py`**

Create `backend/investors/signals.py`:

```python
from django.db.models import Count

from . import changes, sectors, summaries
from .models import Investor, PositionMove

MIN_FUNDS = 3
SHELF_LIMIT = 12
FACES = 5
TABLE_LIMIT = 200
QUARTER_CHOICES = 8
BUYS = (changes.NEW, changes.ADDED)
SELLS = (changes.TRIMMED, changes.SOLD_OUT)


class UnknownView(Exception):
    pass


VIEWS = {
    'bought': ('bought', lambda stock: (-len(stock['bought']), -stock['bought_value'], stock['cusip'])),
    'sold': ('sold', lambda stock: (-len(stock['sold']), -stock['sold_value'], stock['cusip'])),
    'owned': ('owners', lambda stock: (-len(stock['owners']), -stock['value'], stock['cusip'])),
    'new': ('new', lambda stock: (-len(stock['new']), -stock['value'], stock['cusip'])),
}

STOCK_SHELVES = (
    ('convergent-buys', 'Convergent buys', 'bought'),
    ('most-sold', 'Most sold', 'sold'),
)


def signal_quarter():
    tracked = Investor.objects.count()
    filed = list(
        PositionMove.objects.values('quarter_end')
        .annotate(filed=Count('investor', distinct=True)).order_by('-quarter_end')[:2]
    )
    if not filed:
        return None
    newest = filed[0]
    chosen = newest if len(filed) == 1 or newest['filed'] * 2 >= tracked else filed[1]
    return {
        'quarter': chosen['quarter_end'],
        'filed': chosen['filed'],
        'tracked': tracked,
        'newest_quarter': newest['quarter_end'],
        'newest_filed': newest['filed'],
    }


def _blank(cusip, issuer):
    return {
        'cusip': cusip, 'issuer': issuer, 'owners': [], 'bought': [], 'sold': [], 'new': [],
        'value': 0, 'bought_value': 0, 'sold_value': 0,
    }


def _stocks(quarter_end):
    stocks = {}
    rows = PositionMove.objects.filter(quarter_end=quarter_end, put_call='').values_list(
        'cusip', 'issuer', 'investor_id', 'kind', 'value', 'previous_value', 'weight_pct', 'previous_weight_pct',
    )
    for cusip, issuer, investor_id, kind, value, previous_value, weight, previous_weight in rows:
        stock = stocks.setdefault(cusip, _blank(cusip, issuer))
        delta = value - (previous_value or 0)
        if kind != changes.SOLD_OUT:
            stock['owners'].append((weight, investor_id))
            stock['value'] += value
        if kind in BUYS:
            stock['bought'].append((weight, investor_id))
            stock['bought_value'] += delta
        if kind == changes.NEW:
            stock['new'].append((weight, investor_id))
        if kind in SELLS:
            stock['sold'].append((previous_weight or 0.0, investor_id))
            stock['sold_value'] -= delta
    return stocks


def _face(investor):
    return {'slug': investor.slug, 'name': investor.name}


def _faces(pairs, investors):
    ranked = sorted(pairs, key=lambda pair: (-pair[0], pair[1]))[:FACES]
    return [_face(investors[investor_id]) for _, investor_id in ranked]


def _item(stock, side, investors, tickers):
    ticker = tickers.get(stock['cusip'])
    return {
        'cusip': stock['cusip'],
        'ticker': ticker,
        'issuer': stock['issuer'],
        'sector': sectors.sector_for(ticker),
        'owners': len(stock['owners']),
        'bought': len(stock['bought']),
        'sold': len(stock['sold']),
        'new': len(stock['new']),
        'value': stock['value'],
        'investors': _faces(stock[side], investors),
    }


def _items(stocks, view, investors, minimum, limit):
    side, key = VIEWS[view]
    ranked = sorted((stock for stock in stocks.values() if len(stock[side]) >= minimum), key=key)
    tickers = summaries.tickers_for(stock['cusip'] for stock in ranked[:limit])
    return len(ranked), [_item(stock, side, investors, tickers) for stock in ranked[:limit]]


def _new_bets(quarter_end, investors):
    found = PositionMove.objects.filter(quarter_end=quarter_end, put_call='', kind=changes.NEW)
    rows = list(found.order_by('-weight_pct', 'cusip', 'investor_id')[:SHELF_LIMIT])
    tickers = summaries.tickers_for(row.cusip for row in rows)
    items = [
        {
            'cusip': row.cusip,
            'ticker': tickers.get(row.cusip),
            'issuer': row.issuer,
            'sector': sectors.sector_for(tickers.get(row.cusip)),
            'weight': row.weight_pct,
            'value': row.value,
            'investors': [_face(investors[row.investor_id])],
        }
        for row in rows
    ]
    return found.count(), items


def _shelf(key, title, kind, total, items):
    return {'key': key, 'title': title, 'kind': kind, 'total': total, 'items': items}


def _investor_shelf(key, title, members, today):
    ordered = sorted(
        members,
        key=lambda investor: (-(investor.last_filing_at.toordinal() if investor.last_filing_at else 0), investor.name),
    )
    return _shelf(key, title, 'investors', len(ordered), summaries.cards(ordered[:SHELF_LIMIT], today))


def hub(today):
    everyone = list(Investor.objects.all())
    signal = signal_quarter()
    if signal is None:
        return {
            'quarter': None, 'filed': 0, 'tracked': len(everyone),
            'newest_quarter': None, 'newest_filed': 0, 'shelves': [],
        }
    investors = {investor.pk: investor for investor in everyone}
    stocks = _stocks(signal['quarter'])
    shelves = [_investor_shelf('following', 'Following', [i for i in everyone if i.followed], today)]
    for key, title, view in STOCK_SHELVES:
        shelves.append(_shelf(key, title, 'stocks', *_items(stocks, view, investors, MIN_FUNDS, SHELF_LIMIT)))
    shelves.append(_shelf('new-bets', 'Biggest new bets', 'stocks', *_new_bets(signal['quarter'], investors)))
    shelves.append(_investor_shelf('just-filed', 'Just filed', [i for i in everyone if i.last_filing_at], today))
    return {
        'quarter': signal['quarter'].isoformat(),
        'filed': signal['filed'],
        'tracked': signal['tracked'],
        'newest_quarter': signal['newest_quarter'].isoformat(),
        'newest_filed': signal['newest_filed'],
        'shelves': [shelf for shelf in shelves if shelf['items']],
    }


def stock_activity(view, quarter_end=None):
    if view not in VIEWS:
        raise UnknownView(view)
    signal = signal_quarter()
    quarter_end = quarter_end or (signal['quarter'] if signal else None)
    quarters = list(
        PositionMove.objects.values_list('quarter_end', flat=True).distinct().order_by('-quarter_end')[:QUARTER_CHOICES]
    )
    rows = []
    if quarter_end is not None:
        investors = {investor.pk: investor for investor in Investor.objects.all()}
        _, rows = _items(_stocks(quarter_end), view, investors, 1, TABLE_LIMIT)
    return {
        'quarter': quarter_end.isoformat() if quarter_end else None,
        'signal_quarter': signal['quarter'].isoformat() if signal else None,
        'quarters': [quarter.isoformat() for quarter in quarters],
        'view': view,
        'rows': rows,
    }
```

- [ ] **Step 4: Run unit tests**

Run: `cd backend && .venv/bin/python manage.py test investors.test_signals`
Expected: PASS.

- [ ] **Step 5: Write the failing API tests**

Create `backend/investors/test_hub_api.py`:

```python
from datetime import date

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from .factories import make_investor, store_quarter

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)


class HubApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        investor = make_investor(followed=True, last_filing_at=date(2026, 8, 14))
        store_quarter(investor, Q1, [('037833100', 'APPLE INC', 10, 600)])
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 10, 600), ('67066G104', 'NVIDIA CORP', 1, 400)])

    def test_the_hub_needs_a_login(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse('investor-hub')).status_code, 401)

    def test_the_hub_is_not_mistaken_for_an_investor_slug(self):
        response = self.client.get(reverse('investor-hub'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual((response.data['quarter'], response.data['filed'], response.data['tracked']), ('2026-06-30', 1, 1))
        self.assertEqual([shelf['key'] for shelf in response.data['shelves']], ['following', 'new-bets', 'just-filed'])

    def test_stocks_default_to_most_bought(self):
        response = self.client.get(reverse('investor-stocks'))

        self.assertEqual((response.status_code, response.data['view']), (200, 'bought'))
        self.assertEqual([row['issuer'] for row in response.data['rows']], ['NVIDIA CORP'])

    def test_stocks_take_a_view_and_a_quarter(self):
        response = self.client.get(reverse('investor-stocks'), {'view': 'owned', 'quarter': '2026-03-31'})

        self.assertEqual(response.data['quarter'], '2026-03-31')
        self.assertEqual([row['issuer'] for row in response.data['rows']], ['APPLE INC'])

    def test_an_unknown_view_is_400(self):
        self.assertEqual(self.client.get(reverse('investor-stocks'), {'view': 'hot'}).status_code, 400)

    def test_a_malformed_quarter_is_400(self):
        self.assertEqual(self.client.get(reverse('investor-stocks'), {'quarter': 'Q2'}).status_code, 400)
```

Run: `cd backend && .venv/bin/python manage.py test investors.test_hub_api`
Expected: FAIL with `NoReverseMatch: 'investor-hub'`.

- [ ] **Step 6: Add the views and routes**

In `backend/investors/views.py` change the import to `from . import signals, summaries` and append:

```python
class InvestorHubView(APIView):
    def get(self, request):
        return Response(signals.hub(date.today()))


class InvestorStocksView(APIView):
    def get(self, request):
        view = request.query_params.get('view') or 'bought'
        try:
            return Response(signals.stock_activity(view, _quarter_param(request)))
        except signals.UnknownView:
            raise ValidationError({'view': f'Use one of {", ".join(signals.VIEWS)}.'})
```

Replace `backend/investors/urls.py` with:

```python
from django.urls import path

from .views import (
    InvestorChangesView, InvestorDetailView, InvestorHubView, InvestorListView, InvestorStocksView,
)

urlpatterns = [
    path('', InvestorListView.as_view(), name='investor-list'),
    path('hub/', InvestorHubView.as_view(), name='investor-hub'),
    path('stocks/', InvestorStocksView.as_view(), name='investor-stocks'),
    path('<slug:slug>/', InvestorDetailView.as_view(), name='investor-detail'),
    path('<slug:slug>/changes/', InvestorChangesView.as_view(), name='investor-changes'),
]
```

- [ ] **Step 7: Run tests**

Run: `cd backend && .venv/bin/python manage.py test investors`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/investors/signals.py backend/investors/test_signals.py backend/investors/test_hub_api.py backend/investors/views.py backend/investors/urls.py
git commit -m "feat(investors): hub shelves and stock activity from position moves"
```

---

### Task 7: Add investor, stop tracking, EDGAR search

**Files:**
- Create: `backend/investors/tracking.py`, `backend/investors/test_tracking_api.py`
- Modify: `backend/investors/edgar.py`, `backend/investors/test_edgar.py`, `backend/investors/tasks.py`, `backend/investors/test_tasks.py`, `backend/investors/views.py`, `backend/investors/urls.py`, `backend/backend/settings.py`

**Interfaces:**
- Consumes: `edgar._document(url) -> bytes`, `edgar._json(url) -> dict`, `edgar.SUBMISSIONS_URL`, `importer.backfill(investor)`.
- Produces:
  - `edgar.filer(cik) -> {'cik': int, 'name': str, 'last_13f': 'YYYY-MM-DD' | None}`; `edgar.search_filers(query) -> list[filer]` (≤ 8)
  - `tasks.backfill_investor(investor_id)` (Celery task)
  - `tracking.RESERVED_SLUGS`, `tracking.search(query)`, `tracking.add(cik) -> Investor`, `tracking.stop(investor)`; errors `AlreadyTracked(investor)`, `NotA13FFiler(name)`, `CuratedInvestor`
  - `GET search/?q=` → `[{'cik','name','last_13f','tracked','slug'}]`; `POST /` `{cik}` → 201 card; `DELETE <slug>/` → 204. Errors carry a string `detail`.

Why names come from a second request: EDGAR's company-search Atom feed, restricted with `type=13F-HR`, returns the right CIKs but its multi-result entries carry `name="ARRAY(0x…)"` instead of the company name (verified 2026-10-07). The submissions JSON has the name and the form list.

- [ ] **Step 1: Write the failing EDGAR tests**

Append to `backend/investors/test_edgar.py`:

```python
MULTI_FEED = b'''<?xml version="1.0" encoding="ISO-8859-1" ?><feed>
<entry title="ARRAY(0x1)"><content><company-info name="ARRAY(0x2)"><cik>0001336528</cik></company-info></content></entry>
<entry title="ARRAY(0x3)"><content><company-info name="ARRAY(0x4)"><cik>0002026053</cik></company-info></content></entry>
<entry title="ARRAY(0x1)"><content><company-info name="ARRAY(0x2)"><cik>0001336528</cik></company-info></content></entry>
</feed>'''

SUBMISSIONS = {
    1336528: {'name': 'Pershing Square Capital Management, L.P.', 'filings': {'recent': {
        'form': ['13F-HR', '4', '13F-HR'], 'filingDate': ['2026-08-14', '2026-07-01', '2026-05-15'],
    }}},
    2026053: {'name': 'PERSHING SQUARE INC.', 'filings': {'recent': {'form': ['10-K'], 'filingDate': ['2026-03-01']}}},
}


def edgar_get(url, **kwargs):
    if 'browse-edgar' in url:
        return Mock(ok=True, status_code=200, content=MULTI_FEED)
    cik = int(url.rsplit('CIK', 1)[1].split('.')[0])
    return ok_json(SUBMISSIONS[cik])


@override_settings(SEC_USER_AGENT=UA)
@patch('investors.edgar.time.sleep')
@patch('investors.edgar.requests.get')
class SearchFilersTest(SimpleTestCase):
    def test_names_and_last_13f_come_from_each_ciks_submissions(self, get, sleep):
        get.side_effect = edgar_get

        found = edgar.search_filers('pershing square')

        self.assertEqual(found, [
            {'cik': 1336528, 'name': 'Pershing Square Capital Management, L.P.', 'last_13f': '2026-08-14'},
            {'cik': 2026053, 'name': 'PERSHING SQUARE INC.', 'last_13f': None},
        ])

    def test_the_query_is_url_encoded_and_restricted_to_13f_filers(self, get, sleep):
        get.side_effect = edgar_get

        edgar.search_filers('dodge & cox')

        url = get.call_args_list[0].args[0]
        self.assertIn('company=dodge+%26+cox', url)
        self.assertIn('type=13F-HR', url)
        self.assertIn('output=atom', url)

    def test_no_match_is_an_empty_list(self, get, sleep):
        get.return_value = Mock(ok=True, status_code=200, content=b'<feed></feed>')
        self.assertEqual(edgar.search_filers('zzzz'), [])

    def test_at_most_eight_filers_are_looked_up(self, get, sleep):
        feed = b'<feed>' + b''.join(b'<cik>%010d</cik>' % cik for cik in range(1, 20)) + b'</feed>'
        get.side_effect = lambda url, **kwargs: (
            Mock(ok=True, status_code=200, content=feed) if 'browse-edgar' in url
            else ok_json({'name': 'X', 'filings': {'recent': {'form': [], 'filingDate': []}}})
        )

        self.assertEqual(len(edgar.search_filers('x')), 8)

    def test_a_failing_search_is_an_edgar_error(self, get, sleep):
        get.return_value = Mock(ok=False, status_code=503, content=b'')
        with self.assertRaises(edgar.EdgarError):
            edgar.search_filers('pershing')

    def test_a_malformed_submissions_payload_is_an_edgar_error(self, get, sleep):
        get.return_value = ok_json({'filings': {}})
        with self.assertRaises(edgar.EdgarError):
            edgar.filer(1336528)
```

Run: `cd backend && .venv/bin/python manage.py test investors.test_edgar`
Expected: FAIL with `AttributeError: module 'investors.edgar' has no attribute 'search_filers'`.

- [ ] **Step 2: Implement the EDGAR functions**

In `backend/investors/edgar.py` add `import re` and `from urllib.parse import urlencode` to the imports, add constants under `MIN_SPACING`:

```python
COMPANY_SEARCH_URL = 'https://www.sec.gov/cgi-bin/browse-edgar'
SEARCH_LIMIT = 8
ORIGINAL_FORM = '13F-HR'
_CIK = re.compile(rb'<cik>(\d+)</cik>')
```

and append:

```python
def filer(cik):
    payload = _json(SUBMISSIONS_URL.format(cik=cik))
    try:
        recent = payload['filings']['recent']
        dates = [filed for form, filed in zip(recent['form'], recent['filingDate']) if form == ORIGINAL_FORM]
        return {'cik': cik, 'name': payload['name'], 'last_13f': max(dates) if dates else None}
    except (KeyError, TypeError) as exc:
        raise EdgarError(f'unexpected submissions payload for CIK {cik}: {exc!r}') from exc


def search_filers(query):
    params = urlencode({
        'action': 'getcompany', 'company': query, 'type': ORIGINAL_FORM,
        'dateb': '', 'owner': 'include', 'count': 40, 'output': 'atom',
    })
    feed = _document(f'{COMPANY_SEARCH_URL}?{params}')
    ciks = list(dict.fromkeys(int(match) for match in _CIK.findall(feed)))
    return [filer(cik) for cik in ciks[:SEARCH_LIMIT]]
```

Run: `cd backend && .venv/bin/python manage.py test investors.test_edgar`
Expected: PASS.

- [ ] **Step 3: Write the failing task and API tests**

Append to `backend/investors/test_tasks.py`:

```python
class BackfillInvestorTaskTest(TestCase):
    @patch('investors.tasks.importer.backfill')
    def test_backfills_the_named_investor(self, backfill):
        investor = make_investor()
        tasks.backfill_investor(investor.pk)
        backfill.assert_called_once_with(investor)

    @patch('investors.tasks.importer.backfill')
    def test_an_investor_removed_meanwhile_is_ignored(self, backfill):
        tasks.backfill_investor(999)
        backfill.assert_not_called()
```

Create `backend/investors/test_tracking_api.py`:

```python
from unittest.mock import patch

from django.contrib.auth.models import User
from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APITestCase

from . import edgar
from .factories import make_investor
from .models import Investor

PERSHING = {'cik': 1336528, 'name': 'Pershing Square Capital Management, L.P.', 'last_13f': '2026-08-14'}


class TrackingApiTest(APITestCase):
    def setUp(self):
        cache.clear()
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        self.list_url = reverse('investor-list')
        self.search_url = reverse('investor-search')

    @patch('investors.tracking.edgar.search_filers')
    def test_search_marks_filers_already_tracked(self, search_filers):
        make_investor()
        search_filers.return_value = [
            {'cik': 1067983, 'name': 'BERKSHIRE HATHAWAY INC', 'last_13f': '2026-08-14'}, PERSHING,
        ]

        response = self.client.get(self.search_url, {'q': 'capital'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [(row['cik'], row['tracked'], row['slug']) for row in response.data],
            [(1067983, True, 'berkshire-hathaway'), (1336528, False, None)],
        )
        search_filers.assert_called_once_with('capital')

    @patch('investors.tracking.edgar.search_filers')
    def test_a_query_under_three_characters_does_not_reach_edgar(self, search_filers):
        response = self.client.get(self.search_url, {'q': ' ab '})

        self.assertEqual((response.status_code, response.data), (200, []))
        search_filers.assert_not_called()

    @patch('investors.tracking.edgar.search_filers', side_effect=edgar.EdgarError('503'))
    def test_edgar_being_down_is_a_502_with_a_message(self, search_filers):
        response = self.client.get(self.search_url, {'q': 'pershing'})

        self.assertEqual(response.status_code, 502)
        self.assertIn('EDGAR', response.data['detail'])

    @patch('investors.tracking.tasks.backfill_investor.delay')
    @patch('investors.tracking.edgar.filer', return_value=PERSHING)
    def test_adding_creates_the_investor_and_queues_its_backfill(self, filer, delay):
        response = self.client.post(self.list_url, {'cik': 1336528}, format='json')

        self.assertEqual(response.status_code, 201)
        investor = Investor.objects.get(cik=1336528)
        self.assertEqual(
            (investor.name, investor.firm, investor.slug, investor.curated),
            (PERSHING['name'], PERSHING['name'], 'pershing-square-capital-management-lp', False),
        )
        self.assertEqual(response.data['slug'], investor.slug)
        self.assertEqual(response.data['import']['quarters_expected'], 0)
        delay.assert_called_once_with(investor.pk)

    @patch('investors.tracking.tasks.backfill_investor.delay')
    @patch('investors.tracking.edgar.filer')
    def test_a_name_that_slugs_to_a_route_gets_a_safe_slug(self, filer, delay):
        filer.return_value = {'cik': 42, 'name': 'Hub', 'last_13f': '2026-08-14'}

        self.client.post(self.list_url, {'cik': 42}, format='json')

        self.assertEqual(Investor.objects.get(cik=42).slug, 'hub-42')
        self.assertEqual(self.client.get(reverse('investor-hub')).status_code, 200)

    @patch('investors.tracking.tasks.backfill_investor.delay')
    @patch('investors.tracking.edgar.filer')
    def test_a_slug_already_taken_gets_the_cik_appended(self, filer, delay):
        make_investor()
        filer.return_value = {'cik': 7, 'name': 'Berkshire Hathaway', 'last_13f': '2026-08-14'}

        self.client.post(self.list_url, {'cik': 7}, format='json')

        self.assertEqual(Investor.objects.get(cik=7).slug, 'berkshire-hathaway-7')

    @patch('investors.tracking.edgar.filer')
    def test_adding_a_tracked_cik_is_409_and_does_not_reach_edgar(self, filer):
        make_investor()

        response = self.client.post(self.list_url, {'cik': 1067983}, format='json')

        self.assertEqual(response.status_code, 409)
        self.assertIn('already tracked', response.data['detail'])
        filer.assert_not_called()

    @patch('investors.tracking.edgar.filer', return_value={'cik': 5, 'name': 'Acme Inc', 'last_13f': None})
    def test_a_company_that_never_filed_a_13f_is_refused(self, filer):
        response = self.client.post(self.list_url, {'cik': 5}, format='json')

        self.assertEqual(response.status_code, 400)
        self.assertIn('never filed a 13F', response.data['detail'])
        self.assertFalse(Investor.objects.filter(cik=5).exists())

    def test_a_cik_must_be_a_positive_integer(self):
        for bad in ('1336528', True, -1, None):
            self.assertEqual(self.client.post(self.list_url, {'cik': bad}, format='json').status_code, 400)

    @patch('investors.tracking.edgar.filer', side_effect=edgar.EdgarError('503'))
    def test_edgar_failing_on_add_is_a_502(self, filer):
        self.assertEqual(self.client.post(self.list_url, {'cik': 9}, format='json').status_code, 502)

    def test_an_added_investor_can_be_removed(self):
        make_investor(curated=False)

        response = self.client.delete(reverse('investor-detail', args=['berkshire-hathaway']))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Investor.objects.exists())

    def test_a_curated_investor_cannot_be_removed(self):
        make_investor()

        response = self.client.delete(reverse('investor-detail', args=['berkshire-hathaway']))

        self.assertEqual(response.status_code, 409)
        self.assertIn('unfollow', response.data['detail'])
        self.assertTrue(Investor.objects.exists())
```

Run: `cd backend && .venv/bin/python manage.py test investors.test_tracking_api investors.test_tasks`
Expected: FAIL (`NoReverseMatch: 'investor-search'`, `AttributeError: backfill_investor`).

- [ ] **Step 4: Implement the task, `tracking.py`, views, routes and throttle**

Append to `backend/investors/tasks.py`:

```python
@shared_task
def backfill_investor(investor_id):
    investor = Investor.objects.filter(pk=investor_id).first()
    if investor is None:
        return
    importer.backfill(investor)
```

Create `backend/investors/tracking.py`:

```python
from django.utils.text import slugify

from . import edgar, tasks
from .models import Investor

RESERVED_SLUGS = frozenset({'hub', 'stocks', 'search'})
SLUG_LENGTH = 60


class AlreadyTracked(Exception):
    def __init__(self, investor):
        super().__init__(investor.slug)
        self.investor = investor


class NotA13FFiler(Exception):
    pass


class CuratedInvestor(Exception):
    pass


def search(query):
    tracked = dict(Investor.objects.values_list('cik', 'slug'))
    return [
        {**found, 'tracked': found['cik'] in tracked, 'slug': tracked.get(found['cik'])}
        for found in edgar.search_filers(query)
    ]


def _free_slug(name, cik):
    slug = slugify(name)[:SLUG_LENGTH]
    if not slug or slug in RESERVED_SLUGS or Investor.objects.filter(slug=slug).exists():
        return f'{slug or "cik"}-{cik}'
    return slug


def add(cik):
    existing = Investor.objects.filter(cik=cik).first()
    if existing is not None:
        raise AlreadyTracked(existing)
    found = edgar.filer(cik)
    if found['last_13f'] is None:
        raise NotA13FFiler(found['name'])
    investor = Investor.objects.create(
        cik=cik, name=found['name'], firm=found['name'], slug=_free_slug(found['name'], cik),
        curated=False, quarters_expected=0,
    )
    tasks.backfill_investor.delay(investor.pk)
    return investor


def stop(investor):
    if investor.curated:
        raise CuratedInvestor(investor.slug)
    investor.delete()
```

In `backend/investors/views.py`:

Change imports to:

```python
from rest_framework.exceptions import APIException, NotFound, ValidationError

from . import edgar, signals, summaries, tracking
```

Add below the imports:

```python
MIN_QUERY = 3
EDGAR_DOWN = 'EDGAR did not answer. Try again in a moment.'


class Conflict(APIException):
    status_code = 409


class Refused(APIException):
    status_code = 400


class BadGateway(APIException):
    status_code = 502
```

Add to `InvestorListView`:

```python
    def post(self, request):
        cik = request.data.get('cik')
        if isinstance(cik, bool) or not isinstance(cik, int) or cik <= 0:
            raise Refused('Send the filer\'s CIK as a positive integer.')
        try:
            investor = tracking.add(cik)
        except tracking.AlreadyTracked as exc:
            raise Conflict(f'{exc.investor.name} is already tracked.')
        except tracking.NotA13FFiler as exc:
            raise Refused(f'{exc} has never filed a 13F.')
        except edgar.EdgarError:
            raise BadGateway(EDGAR_DOWN)
        return Response(summaries.card(investor, date.today()), status=201)
```

Add to `InvestorDetailView`:

```python
    def delete(self, request, slug):
        investor = get_object_or_404(Investor, slug=slug)
        try:
            tracking.stop(investor)
        except tracking.CuratedInvestor:
            raise Conflict('Curated investors cannot be removed; unfollow instead.')
        return Response(status=204)
```

Append:

```python
class InvestorSearchView(APIView):
    throttle_scope = 'investors.search'

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if len(query) < MIN_QUERY:
            return Response([])
        try:
            return Response(tracking.search(query))
        except edgar.EdgarError:
            raise BadGateway(EDGAR_DOWN)
```

In `backend/investors/urls.py` import `InvestorSearchView` and add, before the `<slug:slug>/` route:

```python
    path('search/', InvestorSearchView.as_view(), name='investor-search'),
```

In `backend/backend/settings.py`, add to `DEFAULT_THROTTLE_RATES`:

```python
        'investors.search': '10/min',
```

- [ ] **Step 5: Run tests**

Run: `cd backend && .venv/bin/python manage.py test investors`
Expected: PASS.

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && .venv/bin/python manage.py test`
Expected: PASS (no other app imported anything removed here).

- [ ] **Step 7: Commit**

```bash
git add backend/investors backend/backend/settings.py
git commit -m "feat(investors): search EDGAR for 13F filers, add and stop tracking"
```

---

### Task 8: Frontend API client and queries

**Files:**
- Modify: `frontend/src/api/client/investors.js`, `frontend/src/api/queries/investors.js`
- Test: `frontend/src/api/queries/investors.test.jsx`

**Interfaces:**
- Consumes: `apiFetch(path, options)`, `jsonRequest(path, method, body)` from `./http`.
- Produces (client): `getInvestorHub()`, `getInvestorStocks(view, quarter)`, `searchFilers(q)`, `setInvestorFollowed(slug, followed)`, `addInvestor(cik)`, `stopTrackingInvestor(slug)`.
- Produces (queries): `investorsKeys.hub`, `.stocks(view, quarter)`, `.search(q)`; hooks `useInvestorHub()`, `useInvestorStocks(view, quarter)`, `useInvestorSearch(q)`, `useFollowInvestor()` (mutate `{slug, followed}`), `useAddInvestor()` (mutate `cik`), `useStopTracking()` (mutate `slug`), `usePrefetchInvestor()` → `(slug) => void`. `useInvestors` polls every 4 s while any card has `import`.

- [ ] **Step 1: Write the failing tests**

Change the import line in `frontend/src/api/queries/investors.test.jsx` to:

```jsx
import {
  investorsKeys, useAddInvestor, useFollowInvestor, useInvestor, useInvestorChanges, useInvestorHub,
  useInvestors, useInvestorSearch, useInvestorStocks, useStopTracking,
} from './investors'
```

Replace `setup` with a version that also returns the client:

```jsx
function setup(useHook, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { ...renderHook(useHook, { wrapper }), queryClient }
}
```

Append inside the `describe`:

```jsx
  it('loads the hub in one request', async () => {
    client.getInvestorHub.mockResolvedValue({ shelves: [] })
    const { result } = setup(() => useInvestorHub())
    await waitFor(() => expect(result.current.data).toEqual({ shelves: [] }))
    expect(client.getInvestorHub).toHaveBeenCalledTimes(1)
  })

  it('keys stock activity on view and quarter', async () => {
    client.getInvestorStocks.mockResolvedValue({ rows: [] })
    const { result } = setup(() => useInvestorStocks('sold', '2026-03-31'))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.getInvestorStocks).toHaveBeenCalledWith('sold', '2026-03-31')
    expect(investorsKeys.stocks('sold')).not.toEqual(investorsKeys.stocks('bought'))
  })

  it('does not search EDGAR for fewer than three characters', () => {
    setup(() => useInvestorSearch('ab'))
    expect(client.searchFilers).not.toHaveBeenCalled()
  })

  it('searches once the query is long enough', async () => {
    client.searchFilers.mockResolvedValue([{ cik: 1 }])
    const { result } = setup(() => useInvestorSearch('pershing'))
    await waitFor(() => expect(result.current.data).toEqual([{ cik: 1 }]))
  })

  it('flips the star before the server answers and keeps it on success', async () => {
    let finish
    client.setInvestorFollowed.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const { result, queryClient } = setup(() => useFollowInvestor())
    queryClient.setQueryData(investorsKeys.list(), [{ slug: 'a', followed: false }, { slug: 'b', followed: false }])
    queryClient.setQueryData(investorsKeys.detail('a'), { slug: 'a', followed: false })

    result.current.mutate({ slug: 'a', followed: true })

    await waitFor(() => expect(queryClient.getQueryData(investorsKeys.list())[0].followed).toBe(true))
    expect(queryClient.getQueryData(investorsKeys.list())[1].followed).toBe(false)
    expect(queryClient.getQueryData(investorsKeys.detail('a')).followed).toBe(true)
    finish({ slug: 'a', followed: true })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(client.setInvestorFollowed).toHaveBeenCalledWith('a', true)
  })

  it('puts the star back when following fails', async () => {
    client.setInvestorFollowed.mockRejectedValue(new Error('offline'))
    client.getInvestors.mockResolvedValue([{ slug: 'a', followed: false }])
    const { result, queryClient } = setup(() => useFollowInvestor())
    queryClient.setQueryData(investorsKeys.list(), [{ slug: 'a', followed: false }])

    result.current.mutate({ slug: 'a', followed: true })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(queryClient.getQueryData(investorsKeys.list())[0].followed).toBe(false)
  })

  it('refreshes the directory and the hub after adding or removing an investor', async () => {
    client.addInvestor.mockResolvedValue({ slug: 'new' })
    client.stopTrackingInvestor.mockResolvedValue(null)
    const added = setup(() => useAddInvestor())
    const spy = vi.spyOn(added.queryClient, 'invalidateQueries')
    added.result.current.mutate(1336528)
    await waitFor(() => expect(added.result.current.isSuccess).toBe(true))
    expect(client.addInvestor).toHaveBeenCalledWith(1336528)
    expect(spy).toHaveBeenCalledWith({ queryKey: ['investors'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: investorsKeys.hub })

    const stopped = setup(() => useStopTracking())
    stopped.result.current.mutate('new')
    await waitFor(() => expect(stopped.result.current.isSuccess).toBe(true))
    expect(client.stopTrackingInvestor).toHaveBeenCalledWith('new')
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/api/queries/investors.test.jsx`
Expected: FAIL (`useInvestorHub is not a function`).

- [ ] **Step 3: Implement the client**

Replace `frontend/src/api/client/investors.js` with:

```js
import { apiFetch, jsonRequest } from './http'

const quarterQuery = (quarter) => (quarter ? `?quarter=${encodeURIComponent(quarter)}` : '')

const query = (params) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value)).toString()
  return search ? `?${search}` : ''
}

export const getInvestors = (holds = '') =>
  apiFetch(`/api/investors/${holds ? `?holds=${encodeURIComponent(holds)}` : ''}`)

export const getInvestor = (slug, quarter) => apiFetch(`/api/investors/${slug}/${quarterQuery(quarter)}`)

export const getInvestorChanges = (slug, quarter) =>
  apiFetch(`/api/investors/${slug}/changes/${quarterQuery(quarter)}`)

export const getInvestorHub = () => apiFetch('/api/investors/hub/')

export const getInvestorStocks = (view, quarter) => apiFetch(`/api/investors/stocks/${query({ view, quarter })}`)

export const searchFilers = (q) => apiFetch(`/api/investors/search/${query({ q })}`)

export const setInvestorFollowed = (slug, followed) => jsonRequest(`/api/investors/${slug}/`, 'PATCH', { followed })

export const addInvestor = (cik) => jsonRequest('/api/investors/', 'POST', { cik })

export const stopTrackingInvestor = (slug) => apiFetch(`/api/investors/${slug}/`, { method: 'DELETE' })
```

- [ ] **Step 4: Implement the queries**

Replace `frontend/src/api/queries/investors.js` with:

```js
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  addInvestor, getInvestor, getInvestorChanges, getInvestorHub, getInvestors, getInvestorStocks,
  searchFilers, setInvestorFollowed, stopTrackingInvestor,
} from '../client'

const IMPORT_POLL_MS = 4000
const SEARCH_MIN = 3
const LISTS = ['investors']

export const investorsKeys = {
  list: (holds = '') => ['investors', holds],
  detail: (slug, quarter) => ['investor', slug, quarter ?? 'latest'],
  changes: (slug, quarter) => ['investor-changes', slug, quarter ?? 'latest'],
  hub: ['investor-hub'],
  stocks: (view, quarter) => ['investor-stocks', view, quarter ?? 'signal'],
  search: (q) => ['investor-search', q],
}

const importing = (cards) => Array.isArray(cards) && cards.some((card) => card.import)

export function useInvestors({ holds = '' } = {}) {
  return useQuery({
    queryKey: investorsKeys.list(holds),
    queryFn: () => getInvestors(holds),
    refetchInterval: (query) => (importing(query.state.data) ? IMPORT_POLL_MS : false),
  })
}

export function useInvestor(slug, quarter) {
  return useQuery({
    queryKey: investorsKeys.detail(slug, quarter),
    queryFn: () => getInvestor(slug, quarter),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.import ? IMPORT_POLL_MS : false),
  })
}

export function useInvestorChanges(slug, quarter) {
  return useQuery({
    queryKey: investorsKeys.changes(slug, quarter),
    queryFn: () => getInvestorChanges(slug, quarter),
    enabled: Boolean(slug),
    placeholderData: keepPreviousData,
  })
}

export function useInvestorHub() {
  return useQuery({ queryKey: investorsKeys.hub, queryFn: getInvestorHub })
}

export function useInvestorStocks(view, quarter) {
  return useQuery({
    queryKey: investorsKeys.stocks(view, quarter),
    queryFn: () => getInvestorStocks(view, quarter),
    placeholderData: keepPreviousData,
  })
}

export function useInvestorSearch(q) {
  return useQuery({
    queryKey: investorsKeys.search(q),
    queryFn: () => searchFilers(q),
    enabled: q.length >= SEARCH_MIN,
    staleTime: 60_000,
    retry: false,
  })
}

export function usePrefetchInvestor() {
  const queryClient = useQueryClient()
  return (slug) =>
    queryClient.prefetchQuery({ queryKey: investorsKeys.detail(slug), queryFn: () => getInvestor(slug), staleTime: 30_000 })
}

export function useFollowInvestor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ slug, followed }) => setInvestorFollowed(slug, followed),
    onMutate: async ({ slug, followed }) => {
      const detail = ['investor', slug]
      await Promise.all([queryClient.cancelQueries({ queryKey: LISTS }), queryClient.cancelQueries({ queryKey: detail })])
      const snapshots = [...queryClient.getQueriesData({ queryKey: LISTS }), ...queryClient.getQueriesData({ queryKey: detail })]
      queryClient.setQueriesData({ queryKey: LISTS }, (cards) =>
        Array.isArray(cards) ? cards.map((card) => (card.slug === slug ? { ...card, followed } : card)) : cards)
      queryClient.setQueriesData({ queryKey: detail }, (data) => (data ? { ...data, followed } : data))
      return { snapshots }
    },
    onError: (_error, _variables, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: (_data, _error, { slug }) => {
      queryClient.invalidateQueries({ queryKey: LISTS })
      queryClient.invalidateQueries({ queryKey: ['investor', slug] })
      queryClient.invalidateQueries({ queryKey: investorsKeys.hub })
    },
  })
}

function useRosterChange(mutationFn) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LISTS })
      queryClient.invalidateQueries({ queryKey: investorsKeys.hub })
    },
  })
}

export const useAddInvestor = () => useRosterChange(addInvestor)

export const useStopTracking = () => useRosterChange(stopTrackingInvestor)
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run src/api`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api
git commit -m "feat(investors): client and queries for hub, stocks, follow and tracking"
```

---

### Task 9: `lib/investorHub.js` — the words and the filters

**Files:**
- Create: `frontend/src/lib/investorHub.js`, `frontend/src/lib/investorHub.test.js`
- Modify: `frontend/src/lib/investors.js` (one sort)

**Interfaces:**
- Consumes: `visibleInvestors`, `quarterLabel` from `./investors`; `fmtPct` from `./format`.
- Produces: `STYLE_ORDER`, `STOCK_VIEWS`, `MOVE_GROUPS`, `MOVES_SHOWN`, `directoryChips(cards)`, `directoryInvestors(cards, {chip, query, sort, holderSlugs})`, `initials(name)`, `moveSentence(move)`, `groupMoves(moves)`, `signalSentence(shelfKey, item)`, `seeAllTarget(shelf)`, `hubSubtitle(hub)`, `stockLabel(item)`. `INVESTOR_SORTS` gains `['filed', 'Recently filed']`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/investorHub.test.js`:

```js
import { describe, expect, it } from 'vitest'

import {
  directoryChips, directoryInvestors, groupMoves, hubSubtitle, initials, moveSentence, seeAllTarget,
  signalSentence, stockLabel,
} from './investorHub'

const card = (over) => ({
  slug: 's', name: 'N', firm: 'F', styles: [], followed: false, stale: false, total_value: 1, positions: 1,
  new_count: 0, exited_count: 0, last_filing_at: null, ...over,
})

describe('directoryChips', () => {
  it('offers only the styles some investor has, in the fixed order, between Following and Stopped filing', () => {
    const cards = [card({ styles: ['Tech', 'Value'] }), card({ styles: ['Activist'] })]
    expect(directoryChips(cards)).toEqual([
      ['all', 'All'], ['following', 'Following'], ['Value', 'Value'], ['Activist', 'Activist'], ['Tech', 'Tech'],
      ['stale', 'Stopped filing'],
    ])
  })
})

describe('directoryInvestors', () => {
  const cards = [
    card({ slug: 'a', name: 'Ann', styles: ['Value'], followed: true, total_value: 5, last_filing_at: '2026-08-01' }),
    card({ slug: 'b', name: 'Bob', styles: ['Tech'], total_value: 9, last_filing_at: '2026-08-14' }),
    card({ slug: 'c', name: 'Cy', styles: ['Value'], stale: true, total_value: 1 }),
  ]
  const slugs = (options) => directoryInvestors(cards, { chip: 'all', query: '', sort: 'value', holderSlugs: new Set(), ...options }).map((c) => c.slug)

  it('filters by style, following and stopped filing', () => {
    expect(slugs({ chip: 'Value' })).toEqual(['a', 'c'])
    expect(slugs({ chip: 'following' })).toEqual(['a'])
    expect(slugs({ chip: 'stale' })).toEqual(['c'])
  })

  it('treats an unknown chip as All', () => {
    expect(slugs({ chip: 'nope' })).toEqual(['b', 'a', 'c'])
  })

  it('sorts by most recent filing with never-filed last', () => {
    expect(slugs({ sort: 'filed' })).toEqual(['b', 'a', 'c'])
  })

  it('still searches by name and by holder', () => {
    expect(slugs({ query: 'bob' })).toEqual(['b'])
    expect(slugs({ query: 'NVDA', holderSlugs: new Set(['c']) })).toEqual(['c'])
  })
})

describe('initials', () => {
  it('takes the first and last word', () => {
    expect(initials('Warren Buffett')).toBe('WB')
    expect(initials('Bill & Melinda Gates Foundation Trust')).toBe('BT')
    expect(initials('Baillie Gifford')).toBe('BG')
  })

  it('copes with one word and with nothing', () => {
    expect(initials('Scion')).toBe('S')
    expect(initials('')).toBe('')
  })
})

describe('moveSentence', () => {
  it('says what happened in plain words', () => {
    expect(moveSentence({ kind: 'new', weight: 9.04 })).toBe('Opened a 9.0% position')
    expect(moveSentence({ kind: 'added', weight: 15, shares_change_pct: 32.4 })).toBe('Added 32% more shares · now 15.0%')
    expect(moveSentence({ kind: 'trimmed', weight: 12, shares_change_pct: -18 })).toBe('Cut shares by 18% · now 12.0%')
    expect(moveSentence({ kind: 'sold_out', previous_weight: 4.2 })).toBe('Sold out · was 4.2%')
  })

  it('does not invent a percentage it was not given', () => {
    expect(moveSentence({ kind: 'added', weight: 15, shares_change_pct: null })).toBe('Added shares · now 15.0%')
  })
})

describe('groupMoves', () => {
  it('groups in story order and drops empty groups', () => {
    const moves = [{ kind: 'new', cusip: '1' }, { kind: 'sold_out', cusip: '2' }, { kind: 'new', cusip: '3' }]
    expect(groupMoves(moves).map((g) => [g.kind, g.title, g.items.length])).toEqual([['new', 'New', 2], ['sold_out', 'Sold out', 1]])
  })
})

describe('signalSentence', () => {
  it('describes each stock shelf', () => {
    expect(signalSentence('convergent-buys', { bought: 7, new: 2 })).toBe('7 funds bought · 2 new')
    expect(signalSentence('convergent-buys', { bought: 3, new: 0 })).toBe('3 funds bought')
    expect(signalSentence('most-sold', { sold: 6 })).toBe('6 funds sold')
    expect(signalSentence('new-bets', { weight: 9.04, investors: [{ name: 'Bill Ackman' }] })).toBe('New 9.0% position · Bill Ackman')
  })
})

describe('seeAllTarget', () => {
  it('sends stock shelves to the Stocks table and investor shelves to the directory', () => {
    expect(seeAllTarget({ key: 'convergent-buys' })).toBe('/investors/stocks?view=bought')
    expect(seeAllTarget({ key: 'most-sold' })).toBe('/investors/stocks?view=sold')
    expect(seeAllTarget({ key: 'new-bets' })).toBe('/investors/stocks?view=new')
    expect(seeAllTarget({ key: 'following' })).toBe('/investors?chip=following#directory')
    expect(seeAllTarget({ key: 'just-filed' })).toBe('/investors?sort=filed#directory')
  })
})

describe('hubSubtitle', () => {
  it('says which quarter the signals describe and how many filed', () => {
    expect(hubSubtitle({ tracked: 82, quarter: '2026-06-30', filed: 61, newest_quarter: '2026-06-30', newest_filed: 61 }))
      .toBe('82 tracked · signals for Q2 2026 · 61 of 82 filed')
  })

  it('names the newer quarter when signals still describe the previous one', () => {
    expect(hubSubtitle({ tracked: 82, quarter: '2026-06-30', filed: 80, newest_quarter: '2026-09-30', newest_filed: 5 }))
      .toBe('82 tracked · signals for Q2 2026 · 80 of 82 filed · 5 have filed Q3 2026')
  })

  it('has nothing to say about signals before any import', () => {
    expect(hubSubtitle({ tracked: 3, quarter: null })).toBe('3 tracked · no filings imported yet')
    expect(hubSubtitle(undefined)).toBe('13F holdings of well-known investors')
  })
})

describe('stockLabel', () => {
  it('falls back to the issuer when the ticker is unresolved', () => {
    expect(stockLabel({ ticker: 'NVDA', issuer: 'NVIDIA CORP' })).toBe('NVDA')
    expect(stockLabel({ ticker: null, issuer: 'NVIDIA CORP' })).toBe('NVIDIA CORP')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npx vitest run src/lib/investorHub.test.js`
Expected: FAIL (cannot resolve `./investorHub`).

- [ ] **Step 3: Implement**

In `frontend/src/lib/investors.js`, change `INVESTOR_SORTS` to:

```js
export const INVESTOR_SORTS = [['value', 'Largest value'], ['filed', 'Recently filed'], ['changes', 'Most changes'], ['positions', 'Most positions'], ['name', 'Name']]
```

and add to `SORT_KEYS`:

```js
  filed: (c) => -(c.last_filing_at ? Date.parse(c.last_filing_at) : 0),
```

Create `frontend/src/lib/investorHub.js`:

```js
import { fmtPct } from './format'
import { quarterLabel, visibleInvestors } from './investors'

export const STYLE_ORDER = ['Value', 'Growth', 'Activist', 'Macro', 'Tech', 'Concentrated', 'Contrarian', 'Quant']
export const STOCK_VIEWS = [['bought', 'Most bought'], ['sold', 'Most sold'], ['owned', 'Most owned'], ['new', 'New positions']]
export const MOVE_GROUPS = [['new', 'New'], ['added', 'Added'], ['trimmed', 'Trimmed'], ['sold_out', 'Sold out']]
export const MOVES_SHOWN = 8

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })
const whole = (value) => Math.round(Math.abs(value))

export function directoryChips(cards) {
  const present = new Set(cards.flatMap((card) => card.styles ?? []))
  const styles = STYLE_ORDER.filter((style) => present.has(style)).map((style) => [style, style])
  return [['all', 'All'], ['following', 'Following'], ...styles, ['stale', 'Stopped filing']]
}

const CHIP_TESTS = {
  all: () => true,
  following: (card) => card.followed,
  stale: (card) => card.stale,
}

const chipTest = (chip) =>
  CHIP_TESTS[chip] ?? (STYLE_ORDER.includes(chip) ? (card) => (card.styles ?? []).includes(chip) : CHIP_TESTS.all)

export function directoryInvestors(cards, { chip = 'all', query = '', sort = 'value', holderSlugs = new Set() }) {
  return visibleInvestors(cards.filter(chipTest(chip)), { group: 'all', query, sort, holderSlugs })
}

export function initials(name) {
  const words = name.split(/\s+/).filter((word) => /^[\p{L}]/u.test(word))
  if (words.length === 0) return ''
  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]]
  return picked.map((word) => word[0].toUpperCase()).join('')
}

const MOVE_SENTENCES = {
  new: (move) => `Opened a ${share(move.weight)} position`,
  added: (move) =>
    `${move.shares_change_pct == null ? 'Added shares' : `Added ${whole(move.shares_change_pct)}% more shares`} · now ${share(move.weight)}`,
  trimmed: (move) =>
    `${move.shares_change_pct == null ? 'Cut shares' : `Cut shares by ${whole(move.shares_change_pct)}%`} · now ${share(move.weight)}`,
  sold_out: (move) => `Sold out · was ${share(move.previous_weight)}`,
}

export const moveSentence = (move) => MOVE_SENTENCES[move.kind](move)

export function groupMoves(moves) {
  return MOVE_GROUPS
    .map(([kind, title]) => ({ kind, title, items: moves.filter((move) => move.kind === kind) }))
    .filter((group) => group.items.length > 0)
}

const SIGNAL_SENTENCES = {
  'convergent-buys': (item) => `${item.bought} funds bought${item.new ? ` · ${item.new} new` : ''}`,
  'most-sold': (item) => `${item.sold} funds sold`,
  'new-bets': (item) => `New ${share(item.weight)} position · ${item.investors[0].name}`,
}

export const signalSentence = (shelfKey, item) => SIGNAL_SENTENCES[shelfKey](item)

const SEE_ALL = {
  'convergent-buys': '/investors/stocks?view=bought',
  'most-sold': '/investors/stocks?view=sold',
  'new-bets': '/investors/stocks?view=new',
  following: '/investors?chip=following#directory',
  'just-filed': '/investors?sort=filed#directory',
}

export const seeAllTarget = (shelf) => SEE_ALL[shelf.key]

export function hubSubtitle(hub) {
  if (!hub) return '13F holdings of well-known investors'
  if (!hub.quarter) return `${hub.tracked} tracked · no filings imported yet`
  const base = `${hub.tracked} tracked · signals for ${quarterLabel(hub.quarter)} · ${hub.filed} of ${hub.tracked} filed`
  return hub.newest_quarter === hub.quarter
    ? base
    : `${base} · ${hub.newest_filed} have filed ${quarterLabel(hub.newest_quarter)}`
}

export const stockLabel = (item) => item.ticker ?? item.issuer
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/lib`
Expected: PASS. If `lib/investors.test.js` asserts the exact `INVESTOR_SORTS` list, add `['filed', 'Recently filed']` to that assertion.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/investorHub.js frontend/src/lib/investorHub.test.js frontend/src/lib/investors.js frontend/src/lib/investors.test.js
git commit -m "feat(investors): hub wording, chips and see-all targets"
```

---

### Task 10: The hub page

**Files:**
- Create: `frontend/src/components/ShelfCards.jsx`, `frontend/src/components/investors/ImportProgress.jsx`, `InvestorAvatar.jsx`, `StyleChips.jsx`, `FollowButton.jsx`, `InvestorCard.jsx`, `StockSignalCard.jsx`, `Shelf.jsx`, `InvestorDirectory.jsx` (all under `components/investors/` except `ShelfCards`)
- Modify: `frontend/src/components/discover/ShelfRow.jsx`, `frontend/src/components/investors/InvestorCards.jsx`, `InvestorTable.jsx`, `frontend/src/pages/Investors.jsx`, `frontend/src/pages/Investor.jsx` (import path only)
- Delete: `frontend/src/components/investors/SnapshotPanel.jsx`, `SnapshotPanel.test.jsx`, `InvestorToolbar.jsx`
- Test: `frontend/src/pages/Investors.test.jsx` (rewrite), `frontend/src/components/investors/InvestorTable.test.jsx` (rewrite)

**Interfaces:**
- Consumes: Task 8 hooks, Task 9 helpers, `useWidth` (`lib/chartGeometry`), `cardsThatFit` (`lib/discover`), `ui.jsx` primitives.
- Produces: `<ShelfCards items itemKey renderItem fit />`; `<ImportProgress progress />`; `<InvestorAvatar name size />`; `<StyleChips styles />`; `<FollowButton investor />` (needs `slug`, `name`, `followed`); `<InvestorCard investor className />`; `<StockSignalCard shelfKey item className />`; `<Shelf shelf />`; `<InvestorDirectory cards isLoading error />`. `InvestorCards` and `InvestorTable` take only `investors`.

- [ ] **Step 1: Extract the generic shelf layout (no behaviour change)**

Create `frontend/src/components/ShelfCards.jsx`:

```jsx
export default function ShelfCards({ items, fit, itemKey, renderItem }) {
  if (fit == null) {
    return (
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        {items.map((item) => <div key={itemKey(item)} className="w-56 shrink-0 snap-start">{renderItem(item)}</div>)}
      </div>
    )
  }
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${fit}, minmax(0, 1fr))` }}>
      {items.slice(0, fit).map((item) => <div key={itemKey(item)} className="min-w-0">{renderItem(item)}</div>)}
    </div>
  )
}
```

In `frontend/src/components/discover/ShelfRow.jsx` delete the local `Cards` function, add `import ShelfCards from '../ShelfCards'`, add above the component:

```jsx
const renderCard = (item) => <DiscoverCard item={item} className="h-full" />
```

and replace `<Cards items={shelf.items} fit={fit} />` with:

```jsx
        <ShelfCards items={shelf.items} fit={fit} itemKey={cardKey} renderItem={renderCard} />
```

Run: `cd frontend && npx vitest run src/components/discover src/pages/Discover.test.jsx`
Expected: PASS. If a Discover test selects a card by the `w-56` class on the card itself, point it at the card's `data-testid` or role instead; do not put the width back on the card.

- [ ] **Step 2: Write the failing hub tests**

Replace `frontend/src/pages/Investors.test.jsx` with:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import Investors from './Investors'

const card = (over) => ({
  slug: 's', name: 'N', firm: 'F', curated: true, stale: false, import: null, styles: ['Value'], followed: false,
  latest_quarter: '2026-06-30', last_filing_at: '2026-08-14', total_value: 1e9, positions: 10, top10_weight: 90,
  new_count: 1, exited_count: 0, top_holdings: [{ cusip: 'C', ticker: 'AAPL', issuer: 'APPLE', weight: 20 }], ...over,
})
const buffett = card({ slug: 'berkshire-hathaway', name: 'Warren Buffett', firm: 'Berkshire Hathaway', total_value: 299e9, followed: true })
const ackman = card({ slug: 'pershing-square', name: 'Bill Ackman', firm: 'Pershing Square', styles: ['Activist', 'Concentrated'], total_value: 14e9 })
const burry = card({ slug: 'scion', name: 'Michael Burry', firm: 'Scion', styles: ['Contrarian'], stale: true, total_value: 2e8 })
const cards = [buffett, ackman, burry]

const hub = {
  quarter: '2026-06-30', filed: 3, tracked: 3, newest_quarter: '2026-06-30', newest_filed: 3,
  shelves: [
    { key: 'following', title: 'Following', kind: 'investors', total: 1, items: [buffett] },
    {
      key: 'convergent-buys', title: 'Convergent buys', kind: 'stocks', total: 14,
      items: [{ cusip: 'N', ticker: 'NVDA', issuer: 'NVIDIA CORP', sector: 'Technology', owners: 9, bought: 7, sold: 1, new: 2, value: 5e9, investors: [{ slug: 'pershing-square', name: 'Bill Ackman' }] }],
    },
  ],
}

let hubState
let listState
let holders
const follow = vi.fn()
vi.mock('../api/queries', () => ({
  useInvestorHub: () => hubState,
  useInvestors: ({ holds } = {}) => (holds ? { data: holders, isFetching: false } : listState),
  useFollowInvestor: () => ({ mutate: follow }),
  usePrefetchInvestor: () => () => {},
}))
vi.mock('../components/investors/AddInvestorDialog', () => ({ default: ({ onClose }) => <div role="dialog"><button onClick={onClose}>close</button></div> }))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

const renderPage = (route = '/investors') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/investors" element={<><Investors /><Where /></>} /></Routes>
    </MemoryRouter>,
  )

const directory = () => screen.getByRole('region', { name: 'All investors' })
const directoryNames = () => within(directory()).getAllByTestId('investor-card').map((el) => within(el).getByRole('link').textContent)

describe('Investors hub', () => {
  beforeEach(() => {
    hubState = { data: hub, isLoading: false, error: null }
    listState = { data: cards, isLoading: false, error: null }
    holders = []
    follow.mockReset()
  })

  it('says which quarter the signals describe', () => {
    renderPage()
    expect(screen.getByText('3 tracked · signals for Q2 2026 · 3 of 3 filed')).toBeInTheDocument()
  })

  it('shows each shelf the server sent, with a see-all link to its target', () => {
    renderPage()
    const buys = screen.getByRole('region', { name: 'Convergent buys' })
    expect(within(buys).getByText('NVDA')).toBeInTheDocument()
    expect(within(buys).getByText('7 funds bought · 2 new')).toBeInTheDocument()
    expect(within(buys).getByRole('link', { name: 'See all 14' })).toHaveAttribute('href', '/investors/stocks?view=bought')
    expect(within(screen.getByRole('region', { name: 'Following' })).getByRole('link', { name: 'Warren Buffett' })).toHaveAttribute('href', '/investors/berkshire-hathaway')
  })

  it('shows one line instead of a column of empty shelves', () => {
    hubState = { data: { ...hub, shelves: [] }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText(/No cross-fund signals yet/)).toBeInTheDocument()
    expect(directoryNames()).toHaveLength(3)
  })

  it('keeps the directory usable when the signals fail to load', () => {
    hubState = { data: undefined, isLoading: false, error: new Error('boom') }
    renderPage()
    expect(screen.getByText(/Could not load this quarter's signals/)).toBeInTheDocument()
    expect(directoryNames()).toHaveLength(3)
  })

  it('lists every investor largest first, each linking to its profile', () => {
    renderPage()
    expect(directoryNames()).toEqual(['Warren Buffett', 'Bill Ackman', 'Michael Burry'])
  })

  it('filters by a style chip and keeps the choice in the URL', () => {
    renderPage()
    fireEvent.click(within(directory()).getByRole('button', { name: 'Activist' }))
    expect(directoryNames()).toEqual(['Bill Ackman'])
    expect(screen.getByTestId('where').textContent).toBe('/investors?chip=Activist')
  })

  it('opens on the chip named in the URL', () => {
    renderPage('/investors?chip=following')
    expect(directoryNames()).toEqual(['Warren Buffett'])
    expect(within(directory()).getByRole('button', { name: 'Following' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the style tags and the quarter moves on a card', () => {
    renderPage()
    const ackmanCard = within(directory()).getAllByTestId('investor-card')[1]
    expect(within(ackmanCard).getByText('Activist')).toBeInTheDocument()
    expect(within(ackmanCard).getByText('+1 new · 0 exited')).toBeInTheDocument()
  })

  it('follows from the card without navigating', () => {
    renderPage()
    fireEvent.click(within(directory()).getByRole('button', { name: 'Follow Bill Ackman' }))
    expect(follow).toHaveBeenCalledWith({ slug: 'pershing-square', followed: true })
    expect(screen.getByTestId('where').textContent).toBe('/investors')
  })

  it('offers to unfollow an investor already followed', () => {
    renderPage()
    expect(within(directory()).getByRole('button', { name: 'Unfollow Warren Buffett' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('says so when a search matches nobody', () => {
    renderPage()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search investors' }), { target: { value: 'zzzzzzzz' } })
    expect(screen.getByText('No tracked investor matches “zzzzzzzz”.')).toBeInTheDocument()
  })

  it('switches the directory to a table', () => {
    renderPage()
    fireEvent.click(within(directory()).getByRole('button', { name: 'Table' }))
    expect(within(directory()).getByRole('table')).toBeInTheDocument()
    expect(within(directory()).getByRole('link', { name: /Bill Ackman/ })).toHaveAttribute('href', '/investors/pershing-square')
  })

  it('opens and closes the add-investor dialog', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add investor' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByText('close'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
```

Replace `frontend/src/components/investors/InvestorTable.test.jsx` with:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import InvestorTable from './InvestorTable'

vi.mock('../../api/queries', () => ({ useFollowInvestor: () => ({ mutate: vi.fn() }) }))

const investor = {
  slug: 'pershing-square', name: 'Bill Ackman', firm: 'Pershing Square', styles: ['Activist'], followed: false,
  stale: false, latest_quarter: '2026-06-30', last_filing_at: '2026-08-14', total_value: 14e9, positions: 11,
  top10_weight: 98.5, new_count: 2, exited_count: 0, top_holdings: [],
}

describe('InvestorTable', () => {
  it('links each row to the profile and shows its numbers', () => {
    render(<MemoryRouter><InvestorTable investors={[investor]} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /Bill Ackman/ })).toHaveAttribute('href', '/investors/pershing-square')
    expect(screen.getByText('$14.0B')).toBeInTheDocument()
    expect(screen.getByText('+2 · 0')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Follow Bill Ackman' })).toBeInTheDocument()
  })
})
```

Run: `cd frontend && npx vitest run src/pages/Investors.test.jsx src/components/investors/InvestorTable.test.jsx`
Expected: FAIL (the page still renders the old toolbar and snapshot panel).

- [ ] **Step 3: Small pieces**

Create `frontend/src/components/investors/ImportProgress.jsx` by moving the `ImportProgress` function out of `SnapshotPanel.jsx` unchanged, as the default export:

```jsx
export default function ImportProgress({ progress }) {
  if (!progress) return null
  const done = progress.quarters_expected ? progress.quarters_imported / progress.quarters_expected : 0
  return (
    <div className="flex flex-col gap-1 text-[var(--fig-2xs)] text-blue-400">
      <span className="num font-mono">
        {`Importing history · ${progress.quarters_imported} of ${progress.quarters_expected} quarters · tickers ${progress.cusips_resolved}/${progress.cusips_seen}`}
      </span>
      <span aria-hidden="true" className="block h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <span className="block h-full bg-blue-500/70" style={{ width: `${Math.round(done * 100)}%` }} />
      </span>
    </div>
  )
}
```

In `frontend/src/pages/Investor.jsx` change `import { ImportProgress } from '../components/investors/SnapshotPanel'` to `import ImportProgress from '../components/investors/ImportProgress'`. Then delete `components/investors/SnapshotPanel.jsx`, `SnapshotPanel.test.jsx` and `InvestorToolbar.jsx`:

```bash
cd frontend && git rm src/components/investors/SnapshotPanel.jsx src/components/investors/SnapshotPanel.test.jsx src/components/investors/InvestorToolbar.jsx
```

In `frontend/src/pages/Investor.test.jsx`, if it mocks `../components/investors/SnapshotPanel`, remove that mock.

Create `frontend/src/components/investors/InvestorAvatar.jsx`:

```jsx
import { initials } from '../../lib/investorHub'

export default function InvestorAvatar({ name, size = 36, className = '' }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={`shrink-0 rounded-full bg-zinc-800 border border-white/[0.08] flex items-center justify-center font-semibold text-zinc-300 ${className}`}
    >
      {initials(name)}
    </span>
  )
}
```

Create `frontend/src/components/investors/StyleChips.jsx`:

```jsx
import { Badge } from '../ui'

export default function StyleChips({ styles }) {
  if (!styles?.length) return null
  return (
    <span className="flex flex-wrap gap-1">
      {styles.map((style) => <Badge key={style}>{style}</Badge>)}
    </span>
  )
}
```

Create `frontend/src/components/investors/FollowButton.jsx`:

```jsx
import { Star } from 'lucide-react'

import { useFollowInvestor } from '../../api/queries'

export default function FollowButton({ investor, labelled = false, className = '' }) {
  const follow = useFollowInvestor()
  const { slug, name, followed } = investor
  return (
    <button
      type="button"
      aria-pressed={Boolean(followed)}
      aria-label={`${followed ? 'Unfollow' : 'Follow'} ${name}`}
      onClick={() => follow.mutate({ slug, followed: !followed })}
      className={`relative z-10 inline-flex items-center gap-1.5 rounded-md px-1.5 h-7 text-[var(--fig-xs)] focus-visible:outline-2 focus-visible:outline-blue-500 ${
        followed ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-500 hover:text-zinc-200'
      } ${className}`}
    >
      <Star size={15} fill={followed ? 'currentColor' : 'none'} />
      {labelled ? <span aria-hidden="true">{followed ? 'Following' : 'Follow'}</span> : null}
    </button>
  )
}
```

- [ ] **Step 4: Cards**

`TopLogos` and `LatestLine` move from `InvestorCards.jsx` into `InvestorCard.jsx` (the grid imports the card, so leaving them in the grid file would make the two import each other). Any other file importing them from `./InvestorCards` must import from `./InvestorCard` instead; `grep -rn "from './InvestorCards'" frontend/src` finds them.

Replace `frontend/src/components/investors/InvestorCards.jsx` with:

```jsx
import InvestorCard from './InvestorCard'

const CARD_SIZE = { contentVisibility: 'auto', containIntrinsicSize: 'auto 200px' }

export default function InvestorCards({ investors }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
      {investors.map((investor) => (
        <div key={investor.slug} style={CARD_SIZE}><InvestorCard investor={investor} /></div>
      ))}
    </div>
  )
}
```

Create `frontend/src/components/investors/InvestorCard.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { usePrefetchInvestor } from '../../api/queries'
import { Card, InstrumentLogo } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import FollowButton from './FollowButton'
import ImportProgress from './ImportProgress'
import InvestorAvatar from './InvestorAvatar'
import StyleChips from './StyleChips'
import { UNKNOWN, fmtNum } from '../../lib/format'
import { fmtCount, fmtFiledDate, fmtUsdCompact, quarterLabel } from '../../lib/investors'

const movement = (c) => (c.new_count == null ? UNKNOWN : `${fmtCount(c.new_count, '+')} new · ${fmtCount(c.exited_count, '−')} exited`)

export function TopLogos({ holdings }) {
  return (
    <span className="flex -space-x-1.5">
      {holdings.map((h) => (
        <InstrumentLogo
          key={h.cusip}
          symbol={h.ticker}
          size={22}
          className="rounded-full ring-2 ring-zinc-900"
          fallback={<TickerInitial ticker={h.ticker ?? h.issuer} size={22} />}
        />
      ))}
    </span>
  )
}

export function LatestLine({ investor }) {
  if (!investor.latest_quarter) return <span className="text-zinc-500">No filings imported yet</span>
  if (investor.stale) return <span className="text-amber-400">{`No 13F since ${quarterLabel(investor.latest_quarter)}`}</span>
  return <span className="text-zinc-500">{`${quarterLabel(investor.latest_quarter)} · filed ${fmtFiledDate(investor.last_filing_at)}`}</span>
}

export default function InvestorCard({ investor, className = '' }) {
  const prefetch = usePrefetchInvestor()
  const warm = () => prefetch(investor.slug)
  return (
    <Card interactive className={`relative h-full flex flex-col gap-2 ${className}`}>
      <div data-testid="investor-card" className="contents">
        <div className="flex items-start gap-2.5">
          <InvestorAvatar name={investor.name} />
          <div className="min-w-0 flex-1">
            <Link
              to={`/investors/${investor.slug}`}
              onMouseEnter={warm}
              onFocus={warm}
              className="block truncate text-[var(--fig-sm)] font-medium text-zinc-100 after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-blue-500"
            >
              {investor.name}
            </Link>
            <div className="text-[var(--fig-xs)] text-zinc-500 truncate">{investor.firm}</div>
          </div>
          <FollowButton investor={investor} />
        </div>
        <StyleChips styles={investor.styles} />
        <ImportProgress progress={investor.import} />
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--fig-md)] num font-mono text-zinc-50">{fmtUsdCompact(investor.total_value)}</span>
          <span className="text-[var(--fig-xs)] num font-mono text-zinc-500">{investor.positions == null ? UNKNOWN : `${fmtNum(investor.positions)} pos`}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[var(--fig-xs)]">
          <TopLogos holdings={investor.top_holdings} />
          <span className="num font-mono text-zinc-400">{movement(investor)}</span>
        </div>
        <div className="mt-auto text-[var(--fig-xs)]"><LatestLine investor={investor} /></div>
      </div>
    </Card>
  )
}
```

Create `frontend/src/components/investors/StockSignalCard.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { Card, InstrumentLogo } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import InvestorAvatar from './InvestorAvatar'
import { signalSentence, stockLabel } from '../../lib/investorHub'

function Faces({ investors }) {
  return (
    <span className="flex -space-x-1.5" aria-label={`Held by ${investors.map((i) => i.name).join(', ')}`}>
      {investors.map((investor) => <InvestorAvatar key={investor.slug} name={investor.name} size={22} className="ring-2 ring-zinc-900" />)}
    </span>
  )
}

function Title({ item }) {
  const label = stockLabel(item)
  const className = `block truncate ${item.ticker ? 'font-mono font-semibold' : 'font-medium'} text-zinc-100`
  if (!item.ticker) return <span className={className}>{label}</span>
  return (
    <Link to={`/research?symbol=${encodeURIComponent(item.ticker)}`} className={`${className} after:absolute after:inset-0 after:rounded-lg`}>
      {label}
    </Link>
  )
}

export default function StockSignalCard({ shelfKey, item, className = '' }) {
  return (
    <Card interactive={Boolean(item.ticker)} className={`relative h-full flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <InstrumentLogo symbol={item.ticker} size={28} className="rounded" fallback={<TickerInitial ticker={stockLabel(item)} size={28} />} />
        <div className="min-w-0">
          <Title item={item} />
          {item.ticker ? <div className="text-[var(--fig-2xs)] text-zinc-500 truncate">{item.issuer}</div> : null}
        </div>
      </div>
      <div className="text-[var(--fig-sm)] text-zinc-200">{signalSentence(shelfKey, item)}</div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <Faces investors={item.investors} />
        {item.sector ? <span className="text-[var(--fig-2xs)] text-zinc-500 truncate">{item.sector}</span> : null}
      </div>
    </Card>
  )
}
```

Check how Research reads its symbol before relying on `/research?symbol=`: run `grep -n "symbol" frontend/src/components/research/useResearchInstrument.js | head`. If the param has a different name, use that name here and in Task 11's table.

- [ ] **Step 5: Shelf**

Create `frontend/src/components/investors/Shelf.jsx`:

```jsx
import { Link } from 'react-router-dom'

import ShelfCards from '../ShelfCards'
import InvestorCard from './InvestorCard'
import StockSignalCard from './StockSignalCard'
import { useWidth } from '../../lib/chartGeometry'
import { cardsThatFit } from '../../lib/discover'
import { seeAllTarget } from '../../lib/investorHub'

const investorKey = (item) => item.slug
const stockKey = (item) => `${item.cusip}:${item.investors[0]?.slug ?? ''}`
const renderInvestor = (item) => <InvestorCard investor={item} />

export default function Shelf({ shelf }) {
  const [ref, width] = useWidth()
  const fit = cardsThatFit(width)
  const headingId = `investor-shelf-${shelf.key}`
  const stocks = shelf.kind === 'stocks'
  return (
    <section ref={ref} aria-labelledby={headingId} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-[var(--fig-md)] font-semibold text-zinc-100">{shelf.title}</h2>
        <Link to={seeAllTarget(shelf)} className="shrink-0 whitespace-nowrap text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">
          See all <span className="num">{shelf.total}</span>
        </Link>
      </div>
      <ShelfCards
        items={shelf.items}
        fit={fit}
        itemKey={stocks ? stockKey : investorKey}
        renderItem={stocks ? (item) => <StockSignalCard shelfKey={shelf.key} item={item} /> : renderInvestor}
      />
    </section>
  )
}
```

- [ ] **Step 6: Table and directory**

Replace `frontend/src/components/investors/InvestorTable.jsx` with:

```jsx
import { Link } from 'react-router-dom'

import { Card, Td, Th, Tr } from '../ui'
import FollowButton from './FollowButton'
import { LatestLine, TopLogos } from './InvestorCard'
import StyleChips from './StyleChips'
import { UNKNOWN, fmtNum, fmtPct } from '../../lib/format'
import { fmtCount, fmtUsdCompact } from '../../lib/investors'

export default function InvestorTable({ investors }) {
  return (
    <Card padding={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[var(--fig-sm)]">
          <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
            <tr>
              <Th edge>Investor</Th>
              <Th>Style</Th>
              <Th align="right">Value</Th>
              <Th align="right">Positions</Th>
              <Th>Top 3</Th>
              <Th align="right">Top 10</Th>
              <Th>vs prev. quarter</Th>
              <Th>Latest</Th>
              <Th edge align="right"><span className="sr-only">Follow</span></Th>
            </tr>
          </thead>
          <tbody>
            {investors.map((c) => (
              <Tr key={c.slug}>
                <Td edge>
                  <Link to={`/investors/${c.slug}`} className="block rounded focus-visible:outline-2 focus-visible:outline-blue-500">
                    <div className="font-medium text-zinc-100">{c.name}</div>
                    <div className="text-[var(--fig-xs)] text-zinc-500">{c.firm}</div>
                  </Link>
                </Td>
                <Td><StyleChips styles={c.styles} /></Td>
                <Td align="right" className="num font-mono text-zinc-200">{fmtUsdCompact(c.total_value)}</Td>
                <Td align="right" className="num font-mono text-zinc-400">{c.positions == null ? UNKNOWN : fmtNum(c.positions)}</Td>
                <Td><TopLogos holdings={c.top_holdings} /></Td>
                <Td align="right" className="num font-mono text-zinc-400">{fmtPct(c.top10_weight, { sign: false, decimals: 1 })}</Td>
                <Td className="num font-mono text-zinc-400">{c.new_count == null ? UNKNOWN : `${fmtCount(c.new_count, '+')} · ${fmtCount(c.exited_count, '−')}`}</Td>
                <Td className="text-[var(--fig-xs)]"><LatestLine investor={c} /></Td>
                <Td edge align="right"><FollowButton investor={c} /></Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
```

Create `frontend/src/components/investors/InvestorDirectory.jsx`:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import { useInvestors } from '../../api/queries'
import { Alert, EmptyState, Input, Select, Skeleton, TBtn } from '../ui'
import InvestorCards from './InvestorCards'
import InvestorTable from './InvestorTable'
import { directoryChips, directoryInvestors } from '../../lib/investorHub'
import { INVESTOR_SORTS, looksLikeTicker } from '../../lib/investors'
import { useDebouncedValue } from '../../lib/useDebouncedValue'

const DEFAULTS = { chip: 'all', sort: 'value', layout: 'cards' }
const HEADING_ID = 'investor-directory-heading'

function useDirectoryParams() {
  const [params, setParams] = useSearchParams()
  const read = (key) => params.get(key) ?? DEFAULTS[key]
  const write = (key, value) => {
    const next = new URLSearchParams(params)
    if (value === DEFAULTS[key]) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }
  return [read, write]
}

function useScrollToHash(ref, hash) {
  const location = useLocation()
  useEffect(() => {
    if (location.hash === hash) ref.current?.scrollIntoView?.({ block: 'start' })
  }, [location.hash, location.key, hash, ref])
}

function Results({ visible, layout, query, searching, waiting }) {
  if (waiting) return <Skeleton className="h-40" />
  if (visible.length === 0 && searching) {
    return <EmptyState title={`No tracked investor matches “${query}”.`} hint="Try a manager, a firm or a ticker they hold." />
  }
  if (visible.length === 0) return <EmptyState title="No investors in this group." />
  return layout === 'table' ? <InvestorTable investors={visible} /> : <InvestorCards investors={visible} />
}

export default function InvestorDirectory({ cards, isLoading, error }) {
  const ref = useRef(null)
  const [read, write] = useDirectoryParams()
  const [query, setQuery] = useState('')
  const chip = read('chip')
  const sort = read('sort')
  const layout = read('layout') === 'table' ? 'table' : 'cards'
  useScrollToHash(ref, '#directory')

  const debounced = useDebouncedValue(query.trim())
  const holds = looksLikeTicker(debounced) ? debounced.toUpperCase() : ''
  const { data: holders = [], isFetching: holdersFetching } = useInvestors({ holds })
  const holderSlugs = useMemo(() => new Set(holds ? holders.map((h) => h.slug) : []), [holds, holders])
  const visible = directoryInvestors(cards, { chip, query, sort, holderSlugs })
  const resolving = looksLikeTicker(query) && (debounced !== query.trim() || (holds !== '' && holdersFetching))

  return (
    <section ref={ref} id="directory" aria-labelledby={HEADING_ID} className="scroll-mt-4 flex flex-col gap-3">
      <h2 id={HEADING_ID} className="text-[var(--fig-md)] font-semibold text-zinc-100">All investors</h2>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div role="group" aria-label="Show investors" className="flex items-center gap-0.5 flex-wrap">
          {directoryChips(cards).map(([key, label]) => (
            <TBtn key={key} active={chip === key} onClick={() => write('chip', key)}>{label}</TBtn>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="search"
            aria-label="Search investors"
            placeholder="Investor, firm or ticker"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56"
          />
          <Select aria-label="Sort investors" value={sort} onChange={(e) => write('sort', e.target.value)}>
            {INVESTOR_SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
          <div role="group" aria-label="Investor layout" className="flex items-center gap-0.5">
            <TBtn active={layout === 'cards'} onClick={() => write('layout', 'cards')}>Cards</TBtn>
            <TBtn active={layout === 'table'} onClick={() => write('layout', 'table')}>Table</TBtn>
          </div>
        </div>
      </div>
      {error
        ? <Alert>Could not load investors. {error.message}</Alert>
        : <Results visible={visible} layout={layout} query={query} searching={query.trim() !== ''} waiting={isLoading || (visible.length === 0 && resolving)} />}
    </section>
  )
}
```

`TBtn` must expose `aria-pressed` for the chip test. Check `components/ui.jsx:396`; if `TBtn` does not set `aria-pressed={active}`, add that one attribute to its `<button>` (it is the shared toggle button, so every caller gains correct semantics).

- [ ] **Step 7: The page**

Replace `frontend/src/pages/Investors.jsx` with:

```jsx
import { useState } from 'react'

import { useInvestorHub, useInvestors } from '../api/queries'
import { Alert, Button, PageHeader, Skeleton } from '../components/ui'
import AddInvestorDialog from '../components/investors/AddInvestorDialog'
import InvestorDirectory from '../components/investors/InvestorDirectory'
import LimitsNote from '../components/investors/LimitsNote'
import Shelf from '../components/investors/Shelf'
import { hubSubtitle } from '../lib/investorHub'

const NO_SIGNALS = 'No cross-fund signals yet. They appear once investors have two quarters imported.'

function Shelves({ hub }) {
  if (hub.error) return <Alert>Could not load this quarter's signals. {hub.error.message}</Alert>
  if (hub.isLoading || !hub.data) return <Skeleton className="h-40" />
  if (hub.data.shelves.length === 0) return <p className="text-[var(--fig-sm)] text-zinc-500">{NO_SIGNALS}</p>
  return hub.data.shelves.map((shelf) => <Shelf key={shelf.key} shelf={shelf} />)
}

export default function Investors() {
  const [adding, setAdding] = useState(false)
  const hub = useInvestorHub()
  const { data: cards = [], isLoading, error } = useInvestors()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Investors"
        subtitle={hubSubtitle(hub.data)}
        right={<Button size="sm" onClick={() => setAdding(true)}>Add investor</Button>}
      />
      <Shelves hub={hub} />
      <InvestorDirectory cards={cards} isLoading={isLoading} error={error} />
      <LimitsNote />
      {adding ? <AddInvestorDialog onClose={() => setAdding(false)} /> : null}
    </div>
  )
}
```

Create a temporary-free stub so the page compiles until Task 13 fills it in — `frontend/src/components/investors/AddInvestorDialog.jsx`:

```jsx
import { Modal } from '../ui'

export default function AddInvestorDialog({ onClose }) {
  return <Modal title="Add investor" onClose={onClose}><p className="text-[var(--fig-sm)] text-zinc-400">Search arrives with the next change.</p></Modal>
}
```

- [ ] **Step 8: Run tests**

Run: `cd frontend && npx vitest run src/pages/Investors.test.jsx src/components/investors src/components/discover src/pages/Investor.test.jsx`
Expected: PASS. `jsdom` has no layout, so `useWidth` reports 0 and `ShelfCards` takes the scrolling branch; the tests above do not depend on which branch runs.

- [ ] **Step 9: Commit**

```bash
git add -A frontend/src
git commit -m "feat(investors): hub page with signal shelves and a style-filtered directory"
```

---

### Task 11: The Stocks table

**Files:**
- Create: `frontend/src/pages/InvestorStocks.jsx`, `frontend/src/pages/InvestorStocks.test.jsx`
- Modify: `frontend/src/App.jsx` (one import, one route)

**Interfaces:**
- Consumes: `useInvestorStocks(view, quarter)`, `STOCK_VIEWS`, `stockLabel`, `quarterLabel`, `fmtUsdCompact`, `PAGE_SIZE`, `PAGE_STEP`.
- Produces: route `/investors/stocks`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/InvestorStocks.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import InvestorStocks from './InvestorStocks'

const row = (over) => ({
  cusip: 'N', ticker: 'NVDA', issuer: 'NVIDIA CORP', sector: 'Technology', owners: 24, bought: 7, sold: 2, new: 3,
  value: 12.4e9, investors: [{ slug: 'pershing-square', name: 'Bill Ackman' }], ...over,
})

let asked
let state
vi.mock('../api/queries', () => ({
  useInvestorStocks: (view, quarter) => { asked = [view, quarter]; return state },
}))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.search}</p>
}

const renderPage = (route = '/investors/stocks') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/investors/stocks" element={<><InvestorStocks /><Where /></>} /></Routes>
    </MemoryRouter>,
  )

describe('InvestorStocks', () => {
  beforeEach(() => {
    state = {
      data: { quarter: '2026-06-30', signal_quarter: '2026-06-30', quarters: ['2026-06-30', '2026-03-31'], view: 'bought', rows: [row(), row({ cusip: 'X', ticker: null, issuer: 'UNLISTED CO', owners: 3, bought: 1, sold: 0, new: 0, value: 5e6 })] },
      isLoading: false, error: null,
    }
  })

  it('asks for most bought in the signal quarter by default', () => {
    renderPage()
    expect(asked).toEqual(['bought', undefined])
    expect(screen.getByRole('heading', { level: 1, name: 'Stocks' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Investors' })).toHaveAttribute('href', '/investors')
  })

  it('shows the counts and who holds each stock', () => {
    renderPage()
    const nvda = screen.getByRole('row', { name: /NVDA/ })
    expect(within(nvda).getByText('24')).toBeInTheDocument()
    expect(within(nvda).getByText('7')).toBeInTheDocument()
    expect(within(nvda).getByText('$12.4B')).toBeInTheDocument()
    expect(within(nvda).getByRole('link', { name: 'NVDA' })).toHaveAttribute('href', '/research?symbol=NVDA')
  })

  it('shows the issuer and no research link for an unresolved ticker', () => {
    renderPage()
    const unlisted = screen.getByRole('row', { name: /UNLISTED CO/ })
    expect(within(unlisted).getByText('UNLISTED CO')).toBeInTheDocument()
    expect(within(unlisted).queryByRole('link', { name: 'UNLISTED CO' })).not.toBeInTheDocument()
  })

  it('reads the view and quarter from the URL', () => {
    renderPage('/investors/stocks?view=sold&quarter=2026-03-31')
    expect(asked).toEqual(['sold', '2026-03-31'])
  })

  it('switches view through the URL', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Most owned' }))
    expect(screen.getByTestId('where').textContent).toBe('?view=owned')
  })

  it('switches quarter through the URL', () => {
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-03-31' } })
    expect(screen.getByTestId('where').textContent).toBe('?quarter=2026-03-31')
  })

  it('can reach a newer quarter than the one the signals describe', () => {
    state = { ...state, data: { ...state.data, quarter: '2026-03-31', signal_quarter: '2026-03-31' } }
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-06-30' } })
    expect(screen.getByTestId('where').textContent).toBe('?quarter=2026-06-30')
  })

  it('drops the param when returning to the signal quarter', () => {
    state = { ...state, data: { ...state.data, quarter: '2026-03-31' } }
    renderPage('/investors/stocks?quarter=2026-03-31')
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-06-30' } })
    expect(screen.getByTestId('where').textContent).toBe('')
  })

  it('treats an unknown view as most bought', () => {
    renderPage('/investors/stocks?view=hot')
    expect(asked[0]).toBe('bought')
  })

  it('says so when nothing matches', () => {
    state = { data: { ...state.data, rows: [] }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText('No stocks with that activity in Q2 2026.')).toBeInTheDocument()
  })

  it('reports a failed load', () => {
    state = { data: undefined, isLoading: false, error: new Error('boom') }
    renderPage()
    expect(screen.getByText(/Could not load stock activity/)).toBeInTheDocument()
  })
})
```

Run: `cd frontend && npx vitest run src/pages/InvestorStocks.test.jsx`
Expected: FAIL (cannot resolve `./InvestorStocks`).

- [ ] **Step 2: Implement the page**

Create `frontend/src/pages/InvestorStocks.jsx`:

```jsx
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useInvestorStocks } from '../api/queries'
import { Alert, Button, Card, EmptyState, InstrumentLogo, PageHeader, Select, Skeleton, TBtn, Td, Th, Tr } from '../components/ui'
import TickerInitial from '../components/discover/TickerInitial'
import InvestorAvatar from '../components/investors/InvestorAvatar'
import LimitsNote from '../components/investors/LimitsNote'
import { STOCK_VIEWS, stockLabel } from '../lib/investorHub'
import { PAGE_SIZE, PAGE_STEP, fmtUsdCompact, quarterLabel } from '../lib/investors'

const VIEW_KEYS = new Set(STOCK_VIEWS.map(([key]) => key))
const DEFAULT_VIEW = 'bought'

function Stock({ row }) {
  const label = stockLabel(row)
  return (
    <span className="flex items-center gap-2 min-w-0">
      <InstrumentLogo symbol={row.ticker} size={22} className="rounded" fallback={<TickerInitial ticker={label} size={22} />} />
      <span className="min-w-0">
        {row.ticker
          ? <Link to={`/research?symbol=${encodeURIComponent(row.ticker)}`} className="font-mono font-semibold text-zinc-100 hover:text-blue-300">{label}</Link>
          : <span className="text-zinc-200">{label}</span>}
        {row.ticker ? <span className="block text-[var(--fig-2xs)] text-zinc-500 truncate">{row.issuer}</span> : null}
      </span>
    </span>
  )
}

function Faces({ investors }) {
  return (
    <span className="flex -space-x-1.5">
      {investors.map((investor) => (
        <Link key={investor.slug} to={`/investors/${investor.slug}`} title={investor.name} aria-label={investor.name}>
          <InvestorAvatar name={investor.name} size={22} className="ring-2 ring-zinc-900" />
        </Link>
      ))}
    </span>
  )
}

function Rows({ rows }) {
  const [shown, setShown] = useState(PAGE_SIZE)
  return (
    <>
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[var(--fig-sm)]">
            <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
              <tr>
                <Th edge>Stock</Th>
                <Th align="right">Owners</Th>
                <Th align="right">Bought</Th>
                <Th align="right">Sold</Th>
                <Th align="right">New</Th>
                <Th align="right">Held value</Th>
                <Th edge>Funds</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((row) => (
                <Tr key={row.cusip}>
                  <Td edge><Stock row={row} /></Td>
                  <Td align="right" className="num font-mono text-zinc-200">{row.owners}</Td>
                  <Td align="right" className="num font-mono text-emerald-400">{row.bought}</Td>
                  <Td align="right" className="num font-mono text-rose-400">{row.sold}</Td>
                  <Td align="right" className="num font-mono text-zinc-400">{row.new}</Td>
                  <Td align="right" className="num font-mono text-zinc-400">{fmtUsdCompact(row.value)}</Td>
                  <Td edge><Faces investors={row.investors} /></Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {shown < rows.length ? (
        <div className="flex items-center justify-between gap-3 text-[var(--fig-xs)] text-zinc-500">
          <span>{`Showing ${shown} of ${rows.length}`}</span>
          <Button size="sm" onClick={() => setShown(shown + PAGE_STEP)}>Show more</Button>
        </div>
      ) : null}
    </>
  )
}

export default function InvestorStocks() {
  const [params, setParams] = useSearchParams()
  const view = VIEW_KEYS.has(params.get('view')) ? params.get('view') : DEFAULT_VIEW
  const quarter = params.get('quarter') ?? undefined
  const { data, isLoading, error } = useInvestorStocks(view, quarter)

  const update = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to="/investors" className="inline-block text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">← Investors</Link>
      <PageHeader
        title="Stocks"
        subtitle="What the tracked investors own, bought and sold, counted by fund"
        right={data?.quarters.length ? (
          <label className="flex items-center gap-2 text-[var(--fig-xs)] text-zinc-500">
            Quarter
            <Select aria-label="Quarter" value={data.quarter ?? ''} onChange={(e) => update('quarter', e.target.value === data.signal_quarter ? null : e.target.value)}>
              {data.quarters.map((q) => <option key={q} value={q}>{quarterLabel(q)}</option>)}
            </Select>
          </label>
        ) : null}
      />
      <div role="group" aria-label="Stock view" className="flex items-center gap-0.5 flex-wrap">
        {STOCK_VIEWS.map(([key, label]) => (
          <TBtn key={key} active={view === key} onClick={() => update('view', key === DEFAULT_VIEW ? null : key)}>{label}</TBtn>
        ))}
      </div>
      {error ? (
        <Alert>Could not load stock activity. {error.message}</Alert>
      ) : isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : data.rows.length === 0 ? (
        <EmptyState title={`No stocks with that activity in ${quarterLabel(data.quarter)}.`} />
      ) : (
        <Rows key={`${view}:${data.quarter}`} rows={data.rows} />
      )}
      <LimitsNote />
    </div>
  )
}
```

The param is dropped only for `signal_quarter` (what the server serves with no param). Early in a filing window that is not the newest quarter, so comparing against `quarters[0]` would make the newest quarter unreachable.

- [ ] **Step 3: Route it**

In `frontend/src/App.jsx` add `import InvestorStocks from './pages/InvestorStocks'` beside the other page imports and add, **above** the `investors/:slug` route:

```jsx
          <Route path='investors/stocks' element={<InvestorStocks />} />
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/pages/InvestorStocks.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/InvestorStocks.jsx frontend/src/pages/InvestorStocks.test.jsx frontend/src/App.jsx
git commit -m "feat(investors): stocks table ranking holdings across funds"
```

---

### Task 12: The profile as a portfolio story

**Files:**
- Create: `frontend/src/components/investors/InvestorHero.jsx`, `LatestMoves.jsx`, `ConcentrationPanel.jsx`
- Modify: `frontend/src/pages/Investor.jsx`, `frontend/src/components/investors/TopHoldings.jsx` (drop the "Open full portfolio" link and the `slug` prop)
- Delete: `frontend/src/components/investors/ChangesTab.jsx`, `ChangesTab.test.jsx`, `InvestorStats.jsx`
- Test: `frontend/src/pages/Investor.test.jsx` (rewrite), `frontend/src/components/investors/TopHoldings.test.jsx` (adjust)

**Interfaces:**
- Consumes: detail payload from Task 4 (`styles`, `followed`, `blurb`, `curated`, `top5_weight`, `sectors`, `moves`), `groupMoves`, `moveSentence`, `MOVES_SHOWN`, `stockLabel`, `useStopTracking` (Task 8), `FollowButton`, `InvestorAvatar`, `StyleChips`, `ImportProgress`, `HoldingsTab`, `TopHoldings`, `WeightBar`, `MetricTile`.
- Produces: `<InvestorHero detail onQuarter />`, `<LatestMoves detail />`, `<ConcentrationPanel detail />`.

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/pages/Investor.test.jsx` with:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import Investor from './Investor'

const move = (kind, ticker, over) => ({
  cusip: ticker, put_call: '', ticker, issuer: `${ticker} INC`, kind, weight: 9, previous_weight: null,
  shares_change_pct: null, value: 1, previous_value: null, ...over,
})
const detail = {
  slug: 'pershing-square', name: 'Bill Ackman', firm: 'Pershing Square', blurb: 'Concentrated activist.',
  styles: ['Activist', 'Concentrated'], followed: false, curated: true, stale: false, import: null,
  quarters: ['2026-06-30', '2026-03-31'], quarter: '2026-06-30', previous_quarter: '2026-03-31', filed_on: '2026-08-14',
  total_value: 14.2e9, positions: 11, top10_weight: 98, top5_weight: 78.4, new_count: 1, exited_count: 1, turnover: 6,
  sectors: [{ sector: 'Consumer', weight: 55 }, { sector: 'Other', weight: 45 }],
  moves: [
    move('new', 'AMZN', { weight: 9.04 }),
    move('added', 'GOOGL', { weight: 15, previous_weight: 11, shares_change_pct: 32.4 }),
    move('trimmed', 'CMG', { weight: 12, previous_weight: 18, shares_change_pct: -18 }),
    move('sold_out', 'NKE', { weight: 0, previous_weight: 4.2, shares_change_pct: -100 }),
  ],
  holdings: [{ cusip: 'C', ticker: 'CMG', issuer: 'CHIPOTLE', class: 'COM', put_call: '', amount_type: 'SH', shares: 1, value: 2.6e9, weight: 18, change: 'trimmed', shares_change_pct: -18, quarters_held: 20, sector: 'Consumer', owned: false, watched: false }],
}

let asked
let state
const follow = vi.fn()
const stop = vi.fn()
vi.mock('../api/queries', () => ({
  useInvestor: (slug, quarter) => { asked = [slug, quarter]; return state },
  useFollowInvestor: () => ({ mutate: follow }),
  useStopTracking: () => ({ mutate: stop, isPending: false, error: null }),
}))
vi.mock('../components/investors/HoldingsTab', () => ({ default: () => <div data-testid="holdings-tab" /> }))
vi.mock('../components/investors/TopHoldings', () => ({ default: () => <div data-testid="top-holdings" /> }))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

const renderPage = (route = '/investors/pershing-square') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/investors/:slug" element={<><Investor /><Where /></>} />
        <Route path="/investors" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Investor profile', () => {
  beforeEach(() => {
    state = { data: detail, isLoading: false, error: null }
    follow.mockReset()
    stop.mockReset()
  })

  it('opens with who this is', () => {
    renderPage()
    expect(screen.getByRole('link', { name: '← Investors' })).toHaveAttribute('href', '/investors')
    expect(screen.getByRole('heading', { level: 1, name: 'Bill Ackman' })).toBeInTheDocument()
    expect(screen.getByText('Pershing Square')).toBeInTheDocument()
    expect(screen.getByText('Concentrated activist.')).toBeInTheDocument()
    expect(screen.getByText('Activist')).toBeInTheDocument()
  })

  it('follows from the hero', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Follow Bill Ackman' }))
    expect(follow).toHaveBeenCalledWith({ slug: 'pershing-square', followed: true })
  })

  it('summarises the portfolio in four tiles', () => {
    renderPage()
    const tiles = screen.getByRole('group', { name: 'Portfolio summary' })
    expect(within(tiles).getByText('$14.2B')).toBeInTheDocument()
    expect(within(tiles).getByText('11')).toBeInTheDocument()
    expect(within(tiles).getByText('78.4%')).toBeInTheDocument()
    expect(within(tiles).getByText('Aug 14, 2026')).toBeInTheDocument()
  })

  it('tells the quarter as moves in plain words, in story order', () => {
    renderPage()
    const moves = screen.getByRole('region', { name: 'Latest moves · Q2 2026' })
    expect(within(moves).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'AMZNOpened a 9.0% position',
      'GOOGLAdded 32% more shares · now 15.0%',
      'CMGCut shares by 18% · now 12.0%',
      'NKESold out · was 4.2%',
    ])
  })

  it('shows eight moves and reveals the rest on request', () => {
    const many = Array.from({ length: 11 }, (_, i) => move('new', `T${i}`))
    state = { data: { ...detail, moves: many }, isLoading: false, error: null }
    renderPage()
    const moves = screen.getByRole('region', { name: /Latest moves/ })
    expect(within(moves).getAllByRole('listitem')).toHaveLength(8)
    fireEvent.click(within(moves).getByRole('button', { name: 'Show all 11' }))
    expect(within(moves).getAllByRole('listitem')).toHaveLength(11)
  })

  it('says there is nothing to compare for a first stored quarter', () => {
    state = { data: { ...detail, previous_quarter: null, moves: [] }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText('First stored quarter — there is no earlier filing to compare against.')).toBeInTheDocument()
  })

  it('says nothing changed when a compared quarter has no moves', () => {
    state = { data: { ...detail, moves: [] }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText('No position changed by 1% or more this quarter.')).toBeInTheDocument()
  })

  it('shows sector weights beside the top holdings', () => {
    renderPage()
    const sectors = screen.getByRole('region', { name: 'Sectors' })
    expect(within(sectors).getByText('Consumer')).toBeInTheDocument()
    expect(within(sectors).getByText('55.0%')).toBeInTheDocument()
    expect(screen.getByTestId('top-holdings')).toBeInTheDocument()
    expect(screen.getByTestId('holdings-tab')).toBeInTheDocument()
  })

  it('switches quarter through the URL', () => {
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-03-31' } })
    expect(screen.getByTestId('where').textContent).toBe('/investors/pershing-square?quarter=2026-03-31')
  })

  it('asks for the quarter named in the URL', () => {
    renderPage('/investors/pershing-square?quarter=2026-03-31')
    expect(asked).toEqual(['pershing-square', '2026-03-31'])
  })

  it('does not offer to stop tracking a curated investor', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).not.toBeInTheDocument()
  })

  it('stops tracking an added investor after a confirmation and returns to the hub', () => {
    stop.mockImplementation((slug, options) => options.onSuccess())
    state = { data: { ...detail, curated: false }, isLoading: false, error: null }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Stop tracking' }))
    expect(stop).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bill Ackman' }))
    expect(stop).toHaveBeenCalledWith('pershing-square', expect.anything())
    expect(screen.getByTestId('where').textContent).toBe('/investors')
  })

  it('flags an investor that stopped filing', () => {
    state = { data: { ...detail, stale: true }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText('No 13F since Q2 2026')).toBeInTheDocument()
  })

  it('explains an investor with nothing imported yet', () => {
    state = { data: { ...detail, quarters: [], quarter: null, holdings: [], moves: [], sectors: [] }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText('Nothing imported for Bill Ackman yet')).toBeInTheDocument()
  })

  it('reports a failed load with a way back', () => {
    state = { data: undefined, isLoading: false, error: new Error('boom') }
    renderPage()
    expect(screen.getByText(/Could not load this investor/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Investors' })).toBeInTheDocument()
  })
})
```

Run: `cd frontend && npx vitest run src/pages/Investor.test.jsx`
Expected: FAIL (the page still renders tabs).

- [ ] **Step 2: Hero**

Create `frontend/src/components/investors/InvestorHero.jsx`:

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useStopTracking } from '../../api/queries'
import { Alert, Button, Select } from '../ui'
import FollowButton from './FollowButton'
import InvestorAvatar from './InvestorAvatar'
import StyleChips from './StyleChips'
import { quarterLabel } from '../../lib/investors'

function StopTracking({ detail }) {
  const [confirming, setConfirming] = useState(false)
  const navigate = useNavigate()
  const stop = useStopTracking()
  if (!confirming) return <Button size="sm" onClick={() => setConfirming(true)}>Stop tracking</Button>
  return (
    <span className="flex items-center gap-2">
      <Button size="sm" variant="danger" disabled={stop.isPending} onClick={() => stop.mutate(detail.slug, { onSuccess: () => navigate('/investors') })}>
        {`Remove ${detail.name}`}
      </Button>
      <Button size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
      {stop.error ? <Alert className="py-1">{stop.error.message}</Alert> : null}
    </span>
  )
}

export default function InvestorHero({ detail, onQuarter }) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-3 flex-wrap">
        <InvestorAvatar name={detail.name} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[var(--fig-xl)] font-semibold text-zinc-50">{detail.name}</h1>
          <p className="text-[var(--fig-sm)] text-zinc-400">{detail.firm}</p>
          {detail.stale && detail.quarter ? (
            <p className="text-[var(--fig-xs)] text-amber-400 mt-0.5">{`No 13F since ${quarterLabel(detail.quarters[0])}`}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {detail.quarters.length > 0 ? (
            <label className="flex items-center gap-2 text-[var(--fig-xs)] text-zinc-500">
              Quarter
              <Select aria-label="Quarter" value={detail.quarter} onChange={(e) => onQuarter(e.target.value === detail.quarters[0] ? null : e.target.value)}>
                {detail.quarters.map((q) => <option key={q} value={q}>{quarterLabel(q)}</option>)}
              </Select>
            </label>
          ) : null}
          <FollowButton investor={detail} labelled className="border border-white/10 px-2.5 h-9" />
          {detail.curated ? null : <StopTracking detail={detail} />}
        </div>
      </div>
      <StyleChips styles={detail.styles} />
      {detail.blurb ? <p className="text-[var(--fig-sm)] text-zinc-400 max-w-[70ch]">{detail.blurb}</p> : null}
    </header>
  )
}
```

Check `Button`'s variants at `components/ui.jsx:78`. If there is no `danger` variant, use the variant the app already uses for destructive actions (search `variant=` across `src/`), and keep the button's accessible name `Remove <name>`. Check the page-title scale too: if `--fig-xl` is not defined in the stylesheet, use the class `PageHeader` uses for its `h1` (`components/ui.jsx:43`).

- [ ] **Step 3: Latest moves**

Create `frontend/src/components/investors/LatestMoves.jsx`:

```jsx
import { useId, useState } from 'react'

import { Button, Card, InstrumentLogo } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import { OptionBadge } from './HoldingBadges'
import { MOVES_SHOWN, groupMoves, moveSentence, stockLabel } from '../../lib/investorHub'
import { quarterLabel } from '../../lib/investors'

const TONES = { new: 'text-emerald-400', added: 'text-emerald-400', trimmed: 'text-rose-400', sold_out: 'text-rose-400' }
const FIRST_QUARTER = 'First stored quarter — there is no earlier filing to compare against.'
const NOTHING_MOVED = 'No position changed by 1% or more this quarter.'

function Move({ move }) {
  const label = stockLabel(move)
  return (
    <li className="py-2 flex items-center gap-2.5 min-w-0">
      <InstrumentLogo symbol={move.ticker} size={22} className="rounded" fallback={<TickerInitial ticker={label} size={22} />} />
      <span className={`shrink-0 ${move.ticker ? 'font-mono font-semibold text-zinc-100' : 'text-zinc-200'}`}>{label}</span>
      <OptionBadge putCall={move.put_call} />
      <span className="min-w-0 truncate text-[var(--fig-sm)] text-zinc-400">{moveSentence(move)}</span>
    </li>
  )
}

export default function LatestMoves({ detail }) {
  const headingId = useId()
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? detail.moves : detail.moves.slice(0, MOVES_SHOWN)
  const empty = detail.previous_quarter == null ? FIRST_QUARTER : detail.moves.length === 0 ? NOTHING_MOVED : null

  return (
    <Card>
      <section aria-labelledby={headingId} className="flex flex-col gap-2">
        <h2 id={headingId} className="text-[var(--fig-md)] font-semibold text-zinc-100">{`Latest moves · ${quarterLabel(detail.quarter)}`}</h2>
        {empty ? (
          <p className="text-[var(--fig-sm)] text-zinc-500">{empty}</p>
        ) : (
          <>
            {groupMoves(shown).map((group) => (
              <div key={group.kind}>
                <h3 className={`text-[var(--fig-2xs)] font-semibold uppercase tracking-wider ${TONES[group.kind]}`}>{group.title}</h3>
                <ul className="divide-y divide-white/[0.06]">
                  {group.items.map((move) => <Move key={`${move.cusip}-${move.put_call}`} move={move} />)}
                </ul>
              </div>
            ))}
            {!expanded && detail.moves.length > MOVES_SHOWN ? (
              <div><Button size="sm" onClick={() => setExpanded(true)}>{`Show all ${detail.moves.length}`}</Button></div>
            ) : null}
            <p className="text-[var(--fig-xs)] text-zinc-500">
              Moves compare quarter-end share counts with the previous filing; trades inside the quarter are not visible.
            </p>
          </>
        )}
      </section>
    </Card>
  )
}
```

`OptionBadge` renders nothing for an empty `put_call` (see `HoldingBadges.jsx`); if it does not, wrap it in `move.put_call ? … : null`. The tested `textContent` (`AMZNOpened a 9.0% position`) assumes no badge text for a plain share position and that `InstrumentLogo` renders an `<img>` (no text) when it has a symbol. If the logo's fallback initial shows up in `textContent` under jsdom, assert on the ticker and the sentence separately with `within(li).getByText(...)` rather than changing the component.

- [ ] **Step 4: Concentration panel**

In `frontend/src/components/investors/TopHoldings.jsx`, change the signature to `export default function TopHoldings({ detail })`, delete the `<Link to={`/investors/${slug}`} …>Open full portfolio →</Link>` element, and remove the now-unused `Link` import. In `TopHoldings.test.jsx`, delete any assertion about "Open full portfolio" and stop passing `slug`.

Create `frontend/src/components/investors/ConcentrationPanel.jsx`:

```jsx
import { useId } from 'react'

import { Card } from '../ui'
import TopHoldings from './TopHoldings'
import WeightBar from './WeightBar'
import { fmtPct } from '../../lib/format'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

function Sectors({ sectors }) {
  const headingId = useId()
  const max = Math.max(0, ...sectors.map((s) => s.weight))
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-[var(--fig-sm)] font-medium text-zinc-200">Sectors</h3>
      <ul className="flex flex-col gap-2.5">
        {sectors.map((s) => (
          <li key={s.sector} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-2 text-[var(--fig-xs)]">
              <span className="text-zinc-300 truncate">{s.sector}</span>
              <span className="num font-mono text-zinc-400">{share(s.weight)}</span>
            </span>
            <WeightBar weight={s.weight} max={max} />
          </li>
        ))}
      </ul>
      <p className="text-[var(--fig-2xs)] text-zinc-500">Sector is known for S&amp;P 500 and Nasdaq-100 names; the rest is Other.</p>
    </section>
  )
}

export default function ConcentrationPanel({ detail }) {
  return (
    <Card>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <TopHoldings detail={detail} />
        <Sectors sectors={detail.sectors} />
      </div>
    </Card>
  )
}
```

- [ ] **Step 5: The page**

Replace `frontend/src/pages/Investor.jsx` with:

```jsx
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { useInvestor } from '../api/queries'
import { Alert, Card, EmptyState, MetricTile, Skeleton } from '../components/ui'
import ConcentrationPanel from '../components/investors/ConcentrationPanel'
import HoldingsTab from '../components/investors/HoldingsTab'
import ImportProgress from '../components/investors/ImportProgress'
import InvestorHero from '../components/investors/InvestorHero'
import LatestMoves from '../components/investors/LatestMoves'
import LimitsNote from '../components/investors/LimitsNote'
import { fmtNum, fmtPct } from '../lib/format'
import { fmtFiledDate, fmtUsdCompact, quarterLabel } from '../lib/investors'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

const back = (
  <Link to="/investors" className="inline-block text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">← Investors</Link>
)

function Summary({ detail }) {
  return (
    <div role="group" aria-label="Portfolio summary" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      <MetricTile label="Portfolio" value={fmtUsdCompact(detail.total_value)} hint={`as of ${quarterLabel(detail.quarter)} end`} />
      <MetricTile label="Positions" value={fmtNum(detail.positions)} hint="US-listed longs + options" />
      <MetricTile label="Top 5" value={share(detail.top5_weight)} hint="of reported value" />
      <MetricTile label="Filed" value={fmtFiledDate(detail.filed_on)} hint="up to 45 days after quarter end" />
    </div>
  )
}

export default function Investor() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const quarter = params.get('quarter') ?? undefined
  const { data, error } = useInvestor(slug, quarter)

  const chooseQuarter = (value) => {
    const next = new URLSearchParams(params)
    if (value) next.set('quarter', value)
    else next.delete('quarter')
    setParams(next, { replace: true })
  }

  if (error) return <div className="flex flex-col gap-3">{back}<Alert>Could not load this investor. {error.message}</Alert></div>
  if (!data) return <div className="flex flex-col gap-3">{back}<Skeleton className="h-64" /></div>

  return (
    <div className="flex flex-col gap-4">
      {back}
      <InvestorHero detail={data} onQuarter={chooseQuarter} />
      <ImportProgress progress={data.import} />
      {data.quarter ? (
        <>
          <Summary detail={data} />
          <LatestMoves key={data.quarter} detail={data} />
          <ConcentrationPanel detail={data} />
          <Card>
            <div className="flex flex-col gap-3">
              <h2 className="text-[var(--fig-md)] font-semibold text-zinc-100">{`All holdings · ${quarterLabel(data.quarter)}`}</h2>
              <HoldingsTab key={data.quarter} detail={data} />
            </div>
          </Card>
        </>
      ) : (
        <EmptyState title={`Nothing imported for ${data.name} yet`} hint="The newest quarter appears here once its filing lands." />
      )}
      <LimitsNote />
    </div>
  )
}
```

Delete the retired files:

```bash
cd frontend && git rm src/components/investors/ChangesTab.jsx src/components/investors/ChangesTab.test.jsx src/components/investors/InvestorStats.jsx
```

If `InvestorStats.test.jsx` exists, `git rm` it too. Leave `useInvestorChanges` and `getInvestorChanges` in the API layer: the endpoint still exists and its hook is tested.

- [ ] **Step 6: Run tests**

Run: `cd frontend && npx vitest run src/pages src/components/investors`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src
git commit -m "feat(investors): profile reads as a portfolio story with latest moves"
```

---

### Task 13: Add investor dialog

**Files:**
- Modify: `frontend/src/components/investors/AddInvestorDialog.jsx` (replace the stub)
- Test: `frontend/src/components/investors/AddInvestorDialog.test.jsx`

**Interfaces:**
- Consumes: `useInvestorSearch(q)`, `useAddInvestor()`, `useDebouncedValue`, `Modal`, `fmtFiledDate`.
- Produces: `<AddInvestorDialog onClose />`; on success navigates to `/investors/<slug>`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/investors/AddInvestorDialog.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import AddInvestorDialog from './AddInvestorDialog'

const results = [
  { cik: 1336528, name: 'Pershing Square Capital Management, L.P.', last_13f: '2026-08-14', tracked: false, slug: null },
  { cik: 1067983, name: 'BERKSHIRE HATHAWAY INC', last_13f: '2026-08-14', tracked: true, slug: 'berkshire-hathaway' },
  { cik: 2026053, name: 'PERSHING SQUARE INC.', last_13f: null, tracked: false, slug: null },
]

let searched
let searchState
let addState
const add = vi.fn()
vi.mock('../../api/queries', () => ({
  useInvestorSearch: (q) => { searched = q; return searchState },
  useAddInvestor: () => ({ mutate: add, ...addState }),
}))
vi.mock('../../lib/useDebouncedValue', () => ({ useDebouncedValue: (value) => value }))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname}</p>
}

const onClose = vi.fn()
const renderDialog = () =>
  render(
    <MemoryRouter initialEntries={['/investors']}>
      <Routes><Route path="*" element={<><AddInvestorDialog onClose={onClose} /><Where /></>} /></Routes>
    </MemoryRouter>,
  )

const type = (value) => fireEvent.change(screen.getByRole('searchbox', { name: 'Search 13F filers' }), { target: { value } })

describe('AddInvestorDialog', () => {
  beforeEach(() => {
    searchState = { data: undefined, isFetching: false, error: null }
    addState = { isPending: false, error: null }
    add.mockReset()
    onClose.mockReset()
  })

  it('asks for at least three characters before searching', () => {
    renderDialog()
    type('pe')
    expect(searched).toBe('pe')
    expect(screen.getByText('Type at least 3 characters of a fund or manager name.')).toBeInTheDocument()
  })

  it('lists filers with their last 13F', () => {
    searchState = { data: results, isFetching: false, error: null }
    renderDialog()
    type('pershing')
    const first = screen.getAllByRole('listitem')[0]
    expect(within(first).getByText('Pershing Square Capital Management, L.P.')).toBeInTheDocument()
    expect(within(first).getByText('Last 13F Aug 14, 2026')).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: 'Add Pershing Square Capital Management, L.P.' })).toBeEnabled()
  })

  it('links to an investor already tracked instead of adding it again', () => {
    searchState = { data: results, isFetching: false, error: null }
    renderDialog()
    type('pershing')
    const tracked = screen.getAllByRole('listitem')[1]
    expect(within(tracked).getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/investors/berkshire-hathaway')
    expect(within(tracked).queryByRole('button')).not.toBeInTheDocument()
  })

  it('does not offer a company that never filed a 13F', () => {
    searchState = { data: results, isFetching: false, error: null }
    renderDialog()
    type('pershing')
    const never = screen.getAllByRole('listitem')[2]
    expect(within(never).getByText('No 13F on file')).toBeInTheDocument()
    expect(within(never).queryByRole('button')).not.toBeInTheDocument()
  })

  it('adds a filer, closes and opens its profile', () => {
    add.mockImplementation((cik, options) => options.onSuccess({ slug: 'pershing-square-capital-management-lp' }))
    searchState = { data: results, isFetching: false, error: null }
    renderDialog()
    type('pershing')
    fireEvent.click(screen.getByRole('button', { name: 'Add Pershing Square Capital Management, L.P.' }))
    expect(add).toHaveBeenCalledWith(1336528, expect.anything())
    expect(onClose).toHaveBeenCalled()
    expect(screen.getByTestId('where').textContent).toBe('/investors/pershing-square-capital-management-lp')
  })

  it('says so when nothing matches', () => {
    searchState = { data: [], isFetching: false, error: null }
    renderDialog()
    type('zzzz')
    expect(screen.getByText('No 13F filer matches “zzzz”.')).toBeInTheDocument()
  })

  it('shows a failed search without breaking the dialog', () => {
    searchState = { data: undefined, isFetching: false, error: new Error('EDGAR did not answer. Try again in a moment.') }
    renderDialog()
    type('pershing')
    expect(screen.getByText('EDGAR did not answer. Try again in a moment.')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search 13F filers' })).toBeEnabled()
  })

  it('shows why an add was refused', () => {
    addState = { isPending: false, error: new Error('Acme has never filed a 13F.') }
    searchState = { data: results, isFetching: false, error: null }
    renderDialog()
    type('pershing')
    expect(screen.getByText('Acme has never filed a 13F.')).toBeInTheDocument()
  })
})
```

Run: `cd frontend && npx vitest run src/components/investors/AddInvestorDialog.test.jsx`
Expected: FAIL (the stub has no search box).

- [ ] **Step 2: Implement**

Replace `frontend/src/components/investors/AddInvestorDialog.jsx` with:

```jsx
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAddInvestor, useInvestorSearch } from '../../api/queries'
import { Alert, Button, Input, Modal, Skeleton } from '../ui'
import { fmtFiledDate } from '../../lib/investors'
import { useDebouncedValue } from '../../lib/useDebouncedValue'

const MIN_QUERY = 3
const HINT = 'Type at least 3 characters of a fund or manager name.'

function Action({ filer, onAdd, pending }) {
  if (filer.tracked) {
    return <Link to={`/investors/${filer.slug}`} className="text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">Open</Link>
  }
  if (!filer.last_13f) return null
  return <Button size="sm" disabled={pending} aria-label={`Add ${filer.name}`} onClick={() => onAdd(filer.cik)}>Add</Button>
}

function Filer({ filer, onAdd, pending }) {
  return (
    <li className="py-2 flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate text-[var(--fig-sm)] text-zinc-100">{filer.name}</span>
        <span className="block text-[var(--fig-2xs)] text-zinc-500">
          {filer.tracked ? 'Already tracked' : filer.last_13f ? `Last 13F ${fmtFiledDate(filer.last_13f)}` : 'No 13F on file'}
        </span>
      </span>
      <Action filer={filer} onAdd={onAdd} pending={pending} />
    </li>
  )
}

function Results({ query, search, onAdd, pending }) {
  if (query.length < MIN_QUERY) return <p className="text-[var(--fig-xs)] text-zinc-500">{HINT}</p>
  if (search.error) return <Alert>{search.error.message}</Alert>
  if (search.isFetching || !search.data) return <Skeleton className="h-24" />
  if (search.data.length === 0) return <p className="text-[var(--fig-xs)] text-zinc-500">{`No 13F filer matches “${query}”.`}</p>
  return (
    <ul className="divide-y divide-white/[0.06] max-h-72 overflow-y-auto">
      {search.data.map((filer) => <Filer key={filer.cik} filer={filer} onAdd={onAdd} pending={pending} />)}
    </ul>
  )
}

export default function AddInvestorDialog({ onClose }) {
  const [text, setText] = useState('')
  const query = useDebouncedValue(text.trim())
  const search = useInvestorSearch(query)
  const add = useAddInvestor()
  const navigate = useNavigate()

  const addFiler = (cik) =>
    add.mutate(cik, {
      onSuccess: (card) => {
        onClose()
        navigate(`/investors/${card.slug}`)
      },
    })

  return (
    <Modal title="Add investor" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Input
          type="search"
          autoFocus
          aria-label="Search 13F filers"
          placeholder="Fund or manager name"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {add.error ? <Alert>{add.error.message}</Alert> : null}
        <Results query={query} search={search} onAdd={addFiler} pending={add.isPending} />
        <p className="text-[var(--fig-2xs)] text-zinc-500">
          Searches SEC EDGAR for institutional managers that file form 13F. Five years of filings are imported in the background.
        </p>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: Run tests**

Run: `cd frontend && npx vitest run src/components/investors src/pages/Investors.test.jsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/investors/AddInvestorDialog.jsx frontend/src/components/investors/AddInvestorDialog.test.jsx
git commit -m "feat(investors): add any 13F filer by searching EDGAR"
```

---

### Task 14: Verify in the real app, document, review

**Files:**
- Modify: `AGENTS.md` (the two Investors paragraphs under "Decided"), `docs/next-steps.md` if it lists investors work
- Create: `learning/learning-records/NNNN-edgar-company-search-names.md` (gitignored; next free number)

- [ ] **Step 1: Run both full suites and the linter**

Run:
```bash
cd backend && .venv/bin/python manage.py test
cd ../frontend && npm test && npm run lint
```
Expected: all PASS, no lint errors. Fix anything red before continuing.

- [ ] **Step 2: Check the dev database is migrated and populated**

Run: `cd backend && .venv/bin/python manage.py migrate --check && .venv/bin/python manage.py shell -c "from investors import signals; from datetime import date; h = signals.hub(date.today()); print(h['quarter'], h['filed'], h['tracked'], [(s['key'], s['total']) for s in h['shelves']])"`
Expected: exit status 0 from `--check`, then a quarter, a filed count near 88, and non-empty `convergent-buys`, `most-sold`, `new-bets`, `just-filed` shelves. If `convergent-buys` is empty with 88 funds loaded, the backfill in Task 5 did not complete; finish it before reviewing the UI.

- [ ] **Step 3: Screenshot review**

Start the stack with `scripts/dev.sh`, then use the `saxodash-design-system` skill's screenshot-review recipe on `/investors`, `/investors/stocks`, `/investors/pershing-square-capital-management` (a curated profile) at desktop and phone width. Check specifically:

- Shelves read as a front page: titles, cards of equal height, "See all N" aligned right.
- An investor card's star does not navigate; the rest of the card does.
- The directory chip row wraps cleanly on a phone; no horizontal page scroll.
- The profile reads top-down: who → four tiles → latest moves → top holdings and sectors → all holdings.
- Follow an investor on the hub: the star fills at once and a Following shelf appears after the refetch.
- Add investor: search "greenlight", confirm the already-tracked row offers Open; search a fund not in the list, add it, and watch the import progress bar advance on its profile (needs the Celery worker that `scripts/dev.sh` starts).

Fix what the review finds, re-run the affected tests, and commit as `polish(investors): screenshot review fixes`.

- [ ] **Step 4: Update AGENTS.md**

Replace the paragraph beginning `**Investors pages read only /api/investors/….**` with:

```markdown
**Investors pages read only `/api/investors/…`.** `/investors` (hub), `/investors/stocks`
and `/investors/:slug` never touch Saxo or Finnhub. The one place a request reaches EDGAR
is the Add-investor search and the add itself — explicit user actions, throttled
(`investors.search`), answering 502 rather than 500 when EDGAR is down. Turnover is opened +
closed value over both quarters' value (no prices), and value deltas include price moves, so
they always sit next to the share change that says what was actually bought or sold.

**Cross-fund signals read `PositionMove`, a cache the importer rebuilds.** `moves.rebuild`
is its only writer and classifies with `changes.py`, so "added" has one definition; it reads
`quarters.effective_filings`, so amendments stay a read-time rule. Drop the table and
`rebuild_moves` restores it. Directory cards read it in a fixed number of queries — the old
per-card snapshot comparison cost two snapshots per fund. The hub's signals describe the newest
quarter at least half the tracked funds have filed, and say which; option rows never count as a
stock signal; a fund with one stored quarter owns but did not buy. Funds holding thousands of
positions (Citadel, Millennium, Renaissance, …) are deliberately not in `curated.csv`: they buy
nearly everything and would drown "bought by 3+ funds".
```

- [ ] **Step 5: Write the learning record**

Create `learning/learning-records/NNNN-edgar-company-search-names.md` (use the next free number in that directory):

```markdown
# EDGAR's company search returns the right CIKs and no names

Searching `browse-edgar?action=getcompany&company=…&type=13F-HR&output=atom` looked like the
obvious "find a 13F filer by name" endpoint. With more than one match, every entry's title and
`company-info name` attribute is the literal string `ARRAY(0x…)` — a Perl reference leaking
from SEC's side. With exactly one match the feed changes shape entirely and becomes that
company's filing list, with a real `<conformed-name>`.

What still works in both shapes is `<cik>…</cik>`, so `edgar.search_filers` takes only the
CIKs (regex, not an XML parser — the feed is ISO-8859-1 with those broken attributes) and
reads each name from the submissions JSON, which also says when the last 13F was filed.

Rejected: the full-text search (`efts.sec.gov/LATEST/search-index?q=…&forms=13F-HR`) matches
any filing whose text mentions the phrase, so "greenlight capital" returns banks that list it;
its `keysTyped` typeahead has names but is not restricted to 13F filers.

Also: Greenlight files its 13F as "DME Capital Management" since 2024. A famous name is not
the filer name; verify the CIK has a recent 13F-HR before adding a row to `curated.csv`.
```

- [ ] **Step 6: Commit and request review**

```bash
git add AGENTS.md docs
git commit -m "docs(investors): hub decisions in AGENTS.md"
```

Then use `superpowers:requesting-code-review` on the branch against `main`, with the spec and this plan's Review Focus as the brief.
