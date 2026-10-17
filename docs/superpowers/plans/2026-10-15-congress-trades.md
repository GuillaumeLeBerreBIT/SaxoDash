# Congress Trades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import House STOCK Act Periodic Transaction Reports into a new `congress` app and show each member's estimated portfolio, copy performance and recent buying/selling across Investors, Portfolio and Research.

**Architecture:** A new Django app `congress` downloads the House Clerk's yearly index ZIP and e-filed PTR PDFs, parses them into `Trade` rows, replays the trades into estimated holdings and hands those to the existing `investors.copying.measure`. It reuses `investors`' price history through a registration hook so `investors` never imports `congress`. The frontend adds a Congress tab to the Investors hub, a member page, a Portfolio column and a Research tab, all reading `/api/congress/…`.

**Tech Stack:** Django 6 + DRF, Celery beat (`django_celery_beat`, `core.scheduling`), `requests`, `pypdf` (new), React 19 + TanStack Query + React Router, vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-congress-trades-design.md`

## Global Constraints

- Generated code carries zero comments (AGENTS.md "Code style"). Rationale goes in commit messages and the PR.
- House only. The Senate eFD site is geo-blocked from the user's location; nothing in this plan touches it.
- Backfill from 2021 (`BACKFILL_SINCE = 2021`).
- Paper reports (DocID starting `8` or `9`) are never downloaded; they are counted.
- A trade's size is the midpoint of its range; an open range ("Over $50,000,000") is sized at its lower bound.
- Calls count as the underlying stock; puts and exchanges are stored and listed, never applied.
- Copy entry is the first session after the filing date (`investors.copying.measure`, unchanged).
- No request reaches the Clerk or the legislators dataset at read time; endpoints read only `congress` tables.
- `congress` may import `investors`; `investors`, `portfolio` and `research` never import `congress`.
- Unknown ticker in ownership lookups answers `null`, never zeros.
- Sync task is `@synced(reports_health=False, task='sync_house', needs_credential=False)`.
- Schedule: daily at 14:00 UTC (16:00 Brussels summer time).
- A new migration is not done until `python manage.py migrate` has run against the dev database (AGENTS.md).
- Frontend: `fmtMoney`/`fmtPct` conventions, `hideBelow="wide"` for the Portfolio column, USD-only lookups via `lib/ownership.js::ownershipTicker`.

## Review Focus

- **A row split by a page break** (header block inside a row, amount split from its asset): must still parse to one trade with both amount bounds. Pinned in Task 2 (DelBene fixture).
- **A description that wraps onto a second line** (`… expiration date` / `of 12/20/24.`): the continuation must not become part of the next row's asset. Pinned in Task 2 (Pelosi 20026590, PANW row).
- **An exercise reported as a stock purchase after the calls were already counted:** must not double the position. Pinned in Task 5 (`test_exercise_replaces_the_call_position`).
- **The same trade in an original and an amended report:** counted once, at the original's filing date. Pinned in Task 5 (`test_amended_duplicate_counts_once_at_the_first_filing`).
- **A member whose district number changes after redistricting:** must stay one member, not become two. Pinned in Task 3 (`test_redistricted_member_stays_one_member`).

---

## File Structure

Backend, new app `backend/congress/`:

| File | Responsibility |
|---|---|
| `apps.py` | App config; registers the price-feed ticker source in `ready()` |
| `models.py` | `Member`, `Report`, `Trade`, `Holding`, `CopyPerformance`, `HouseIndexState` |
| `admin.py` | Read-only admin for the models |
| `amounts.py` | Dollar range text → `(low, high)`, `size(low, high)` |
| `parse.py` | PDF bytes → text; PTR text → `ParsedReport` |
| `members.py` | Legislators dataset matching, aliases CSV, `member_for(entry)` |
| `member_aliases.csv` | Hand-kept name → bioguide answers |
| `house.py` | Clerk index sync (ETag), PDF download + parse into `Trade` rows |
| `replay.py` | Pure: dedupe amended trades, replay trades into `Period`s |
| `performance.py` | Load trades + prices, rebuild `Holding`, `CopyPerformance`, member basis; price-feed ticker source |
| `ownership.py` | Ticker → holders / buyers / sellers lookups |
| `views.py`, `urls.py` | `/api/congress/…` |
| `tasks.py` | `sync_house` Celery task |
| `management/commands/backfill_house.py`, `reparse_reports.py` | Operator commands |
| `testdata/*.pdf` | Real PTR fixtures |
| `test_*.py` | One test module per module above |

Backend, modified: `backend/backend/settings.py` (INSTALLED_APPS), `backend/backend/urls.py`, `backend/requirements.txt` (`pypdf`), `backend/investors/price_feed.py` (ticker-source hook), `backend/investors/copying.py` (`_series` → public `price_series`), `backend/core/scheduling.py`, `backend/core/migrations/0010_seed_house_sync.py`.

Frontend:

| File | Responsibility |
|---|---|
| `src/api/client/congress.js`, `src/api/queries/congress.js` | Fetchers and hooks |
| `src/lib/congress.js` | Pure helpers: party label, range text, basis note, buy/sell label |
| `src/components/congress/CongressDirectory.jsx` | Hub tab content: member table + most-bought shelf |
| `src/components/congress/TradeHistory.jsx` | Trade table on the member page |
| `src/components/congress/CongressActivity.jsx` | Portfolio / stocks cell `3 ↑ / 1 ↓` |
| `src/components/research/CongressTab.jsx` | Research tab |
| `src/pages/CongressMember.jsx` | `/investors/congress/:slug` |
| Modified: `src/pages/Investors.jsx` (tabs), `src/components/investors/CopyPerformancePanel.jsx` (split view from hook), `src/pages/Portfolio.jsx`, `src/pages/Research.jsx`, `src/pages/InvestorStocks.jsx`, `src/App.jsx`, `src/api/client/index.js`, `src/api/queries/index.js` |

---

### Task 1: App skeleton and models

**Files:**
- Create: `backend/congress/__init__.py`, `apps.py`, `models.py`, `admin.py`, `urls.py`, `views.py`, `migrations/__init__.py`, `test_models.py`
- Modify: `backend/backend/settings.py:72`, `backend/backend/urls.py`, `backend/requirements.txt`

**Interfaces:**
- Produces: models `Member`, `Report`, `Trade`, `Holding`, `CopyPerformance`, `HouseIndexState` with the fields below; constants `Report.PENDING/PARSED/FAILED/PAPER`, `Trade.PURCHASE/SALE/PARTIAL_SALE/EXCHANGE`, `Trade.CALL/PUT`; empty `congress.urls.urlpatterns` mounted at `api/congress/`.

- [ ] **Step 1: Write the failing test**

`backend/congress/test_models.py`:

```python
from datetime import date

from django.db import IntegrityError
from django.test import TestCase

from .models import Holding, Member, Report, Trade


class ModelsTest(TestCase):
    def setUp(self):
        self.member = Member.objects.create(
            slug='nancy-pelosi', first_name='Nancy', last_name='Pelosi', state_district='CA11',
        )

    def test_report_doc_id_is_unique(self):
        Report.objects.create(doc_id='20026590', member=self.member, year=2025, filed_on=date(2025, 1, 17))
        with self.assertRaises(IntegrityError):
            Report.objects.create(doc_id='20026590', member=self.member, year=2025, filed_on=date(2025, 1, 17))

    def test_a_new_report_is_pending_and_a_trade_defaults_to_self_and_unpriced(self):
        report = Report.objects.create(doc_id='20026590', member=self.member, year=2025, filed_on=date(2025, 1, 17))
        trade = Trade.objects.create(
            report=report, asset='Apple Inc.', kind=Trade.PURCHASE, traded_on=date(2025, 1, 14), amount_low=1001,
        )
        self.assertEqual(report.status, Report.PENDING)
        self.assertEqual(trade.owner, 'self')
        self.assertFalse(trade.priceable)
        self.assertIsNone(trade.amount_high)

    def test_one_holding_per_member_and_ticker(self):
        Holding.objects.create(member=self.member, ticker='NVDA', value=10.0, weight_pct=100.0)
        with self.assertRaises(IntegrityError):
            Holding.objects.create(member=self.member, ticker='NVDA', value=5.0, weight_pct=50.0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python manage.py test congress.test_models -v 2`
Expected: FAIL / ImportError, no module `congress`.

- [ ] **Step 3: Create the app**

`backend/congress/__init__.py` and `backend/congress/migrations/__init__.py`: empty.

`backend/congress/apps.py`:

```python
from django.apps import AppConfig


class CongressConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'congress'
```

`backend/congress/models.py`:

```python
from django.db import models


class Member(models.Model):
    HOUSE = 'house'

    slug = models.SlugField(max_length=80, unique=True)
    bioguide_id = models.CharField(max_length=7, unique=True, null=True, blank=True)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    chamber = models.CharField(max_length=10, default=HOUSE)
    state_district = models.CharField(max_length=6)
    party = models.CharField(max_length=20, blank=True, default='')
    photo_url = models.URLField(blank=True, default='')
    basis = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f'{self.first_name} {self.last_name} ({self.state_district})'


class Report(models.Model):
    PENDING = 'pending'
    PARSED = 'parsed'
    FAILED = 'failed'
    PAPER = 'paper'
    STATUS_CHOICES = [(PENDING, 'Pending'), (PARSED, 'Parsed'), (FAILED, 'Failed'), (PAPER, 'Paper')]

    doc_id = models.CharField(max_length=12, unique=True)
    member = models.ForeignKey(Member, related_name='reports', on_delete=models.CASCADE)
    year = models.PositiveSmallIntegerField()
    filed_on = models.DateField()
    status = models.CharField(max_length=8, choices=STATUS_CHOICES, default=PENDING)
    amended = models.BooleanField(default=False)
    attempts = models.PositiveSmallIntegerField(default=0)
    unparsed_rows = models.PositiveSmallIntegerField(default=0)
    error = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        ordering = ['filed_on', 'doc_id']


class Trade(models.Model):
    PURCHASE = 'purchase'
    SALE = 'sale'
    PARTIAL_SALE = 'partial_sale'
    EXCHANGE = 'exchange'
    KIND_CHOICES = [(PURCHASE, 'Purchase'), (SALE, 'Sale'), (PARTIAL_SALE, 'Partial sale'), (EXCHANGE, 'Exchange')]
    CALL = 'call'
    PUT = 'put'
    OPTION_CHOICES = [('', 'Not an option'), (CALL, 'Call'), (PUT, 'Put')]

    report = models.ForeignKey(Report, related_name='trades', on_delete=models.CASCADE)
    owner = models.CharField(max_length=4, default='self')
    asset = models.CharField(max_length=300)
    asset_type = models.CharField(max_length=4, blank=True, default='')
    ticker = models.CharField(max_length=16, null=True, blank=True)
    kind = models.CharField(max_length=12, choices=KIND_CHOICES)
    option = models.CharField(max_length=4, choices=OPTION_CHOICES, blank=True, default='')
    exercise = models.BooleanField(default=False)
    traded_on = models.DateField()
    notified_on = models.DateField(null=True, blank=True)
    amount_low = models.PositiveBigIntegerField()
    amount_high = models.PositiveBigIntegerField(null=True, blank=True)
    priceable = models.BooleanField(default=False)

    class Meta:
        ordering = ['traded_on', 'id']
        indexes = [models.Index(fields=['ticker'])]


class Holding(models.Model):
    member = models.ForeignKey(Member, related_name='holdings', on_delete=models.CASCADE)
    ticker = models.CharField(max_length=16)
    value = models.FloatField()
    weight_pct = models.FloatField()

    class Meta:
        unique_together = [('member', 'ticker')]
        ordering = ['-value']


class CopyPerformance(models.Model):
    member = models.OneToOneField(Member, related_name='copy_performance', on_delete=models.CASCADE)
    since = models.DateField()
    until = models.DateField()
    clone_return_pct = models.FloatField()
    benchmark_return_pct = models.FloatField()
    clone_cagr_pct = models.FloatField(null=True, blank=True)
    benchmark_cagr_pct = models.FloatField(null=True, blank=True)
    coverage_pct = models.FloatField()
    periods = models.PositiveSmallIntegerField()
    skipped_periods = models.PositiveSmallIntegerField(default=0)
    series = models.JSONField(default=list)
    computed_at = models.DateTimeField(auto_now=True)


class HouseIndexState(models.Model):
    year = models.PositiveSmallIntegerField(unique=True)
    etag = models.CharField(max_length=100, blank=True, default='')
    last_modified = models.CharField(max_length=40, blank=True, default='')
    checked_at = models.DateTimeField(null=True, blank=True)
```

`backend/congress/admin.py`:

```python
from django.contrib import admin

from .models import Member, Report, Trade


@admin.register(Member)
class MemberAdmin(admin.ModelAdmin):
    list_display = ('last_name', 'first_name', 'state_district', 'party', 'bioguide_id')
    search_fields = ('last_name', 'first_name', 'bioguide_id')


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ('doc_id', 'member', 'filed_on', 'status', 'amended', 'attempts', 'unparsed_rows')
    list_filter = ('status', 'year')
    search_fields = ('doc_id', 'member__last_name')


@admin.register(Trade)
class TradeAdmin(admin.ModelAdmin):
    list_display = ('report', 'owner', 'ticker', 'asset_type', 'kind', 'option', 'traded_on', 'amount_low', 'amount_high')
    list_filter = ('kind', 'asset_type', 'priceable')
    search_fields = ('ticker', 'asset')
```

`backend/congress/urls.py`:

```python
urlpatterns = []
```

`backend/congress/views.py`: empty file for now.

Modify `backend/backend/settings.py` — add `'congress',` after `'investors',` in `INSTALLED_APPS`.
Modify `backend/backend/urls.py` — add `path('api/congress/', include('congress.urls')),` after the investors line.
Modify `backend/requirements.txt` — add `pypdf==6.1.1` (alphabetical position) and run `pip install -r requirements.txt`. If 6.1.1 is unavailable on the index, pin the newest 6.x that `pip index versions pypdf` reports.

- [ ] **Step 4: Make the migration and run tests**

Run: `cd backend && python manage.py makemigrations congress && python manage.py test congress.test_models -v 2`
Expected: `0001_initial.py` created; 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/congress backend/backend/settings.py backend/backend/urls.py backend/requirements.txt
git commit -m "feat(congress): app skeleton with members, reports, trades, holdings and copy performance"
```

---

### Task 2: Amount ranges and the PTR parser

**Files:**
- Create: `backend/congress/amounts.py`, `backend/congress/parse.py`, `backend/congress/test_amounts.py`, `backend/congress/test_parse.py`, `backend/congress/testdata/20026590.pdf`, `20030630.pdf`, `20030541.pdf`, `20035553.pdf`

**Interfaces:**
- Produces:
  - `amounts.parse_range(text: str) -> tuple[int, int | None]`, raises `ValueError` on unreadable text.
  - `amounts.size(low: int, high: int | None) -> float`.
  - `parse.pdf_text(data: bytes) -> str`.
  - `parse.parse_report(text: str) -> ParsedReport` with `ParsedReport(rows: list[ParsedTrade], amended: bool, unparsed_rows: int)` and `ParsedTrade(owner, asset, asset_type, ticker, kind, option, exercise, traded_on, notified_on, amount_low, amount_high, priceable)`; `kind` and `option` use the `Trade` constants' string values.

- [ ] **Step 1: Download the fixtures**

```bash
cd backend/congress && mkdir -p testdata
for d in 20026590 20030630 20030541; do
  curl -sSL -A 'Mozilla/5.0' -o testdata/$d.pdf https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2025/$d.pdf
done
curl -sSL -A 'Mozilla/5.0' -o testdata/20035553.pdf https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035553.pdf
ls -la testdata
```

Expected: four PDFs of 20–80 KB each. These are public House records.

- [ ] **Step 2: Write the failing amount tests**

`backend/congress/test_amounts.py`:

```python
from django.test import SimpleTestCase

from .amounts import parse_range, size


class AmountsTest(SimpleTestCase):
    def test_a_closed_range(self):
        self.assertEqual(parse_range('$1,001 - $15,000'), (1001, 15000))

    def test_a_range_split_over_lines(self):
        self.assertEqual(parse_range('$5,000,001 -\n$25,000,000'), (5000001, 25000000))

    def test_an_open_range_has_no_upper_bound(self):
        self.assertEqual(parse_range('Over $50,000,000'), (50000000, None))
        self.assertEqual(parse_range('Spouse/DC Over $1,000,000'), (1000000, None))

    def test_unreadable_text_is_refused(self):
        with self.assertRaises(ValueError):
            parse_range('None disclosed')

    def test_size_is_the_midpoint_or_the_lower_bound_of_an_open_range(self):
        self.assertEqual(size(1001, 15000), 8000.5)
        self.assertEqual(size(50000000, None), 50000000)
```

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && python manage.py test congress.test_amounts`
Expected: FAIL, no module `congress.amounts`.

- [ ] **Step 4: Implement `amounts.py`**

```python
import re

_DOLLARS = re.compile(r'\$\s*([\d,]+)')
_OPEN = re.compile(r'over', re.I)


def parse_range(text):
    found = [int(value.replace(',', '')) for value in _DOLLARS.findall(text)]
    if not found:
        raise ValueError(f'no amount in {text!r}')
    if _OPEN.search(text) or len(found) == 1:
        return found[0], None
    return found[0], found[1]


def size(low, high):
    return low if high is None else (low + high) / 2
```

Run: `python manage.py test congress.test_amounts` → 5 PASS.

- [ ] **Step 5: Write the failing parser tests**

`backend/congress/test_parse.py`:

```python
from datetime import date
from pathlib import Path

from django.test import SimpleTestCase

from .parse import parse_report, pdf_text

TESTDATA = Path(__file__).with_name('testdata')


def report(doc_id):
    return parse_report(pdf_text((TESTDATA / f'{doc_id}.pdf').read_bytes()))


class PelosiOptionsReportTest(SimpleTestCase):
    def setUp(self):
        self.parsed = report('20026590')
        self.rows = self.parsed.rows

    def test_every_row_is_read(self):
        self.assertEqual(len(self.rows), 9)
        self.assertEqual(self.parsed.unparsed_rows, 0)
        self.assertFalse(self.parsed.amended)

    def test_a_call_purchase(self):
        googl = self.rows[0]
        self.assertEqual(
            (googl.owner, googl.ticker, googl.asset_type, googl.kind, googl.option, googl.exercise),
            ('SP', 'GOOGL', 'OP', 'purchase', 'call', False),
        )
        self.assertEqual((googl.traded_on, googl.notified_on), (date(2025, 1, 14), date(2025, 1, 14)))
        self.assertEqual((googl.amount_low, googl.amount_high), (250001, 500000))
        self.assertTrue(googl.priceable)

    def test_a_partial_sale_with_a_wide_range(self):
        apple = self.rows[2]
        self.assertEqual((apple.ticker, apple.asset_type, apple.kind), ('AAPL', 'ST', 'partial_sale'))
        self.assertEqual((apple.amount_low, apple.amount_high), (5000001, 25000000))

    def test_an_exercise_is_a_stock_purchase_flagged_as_exercise(self):
        nvda = self.rows[4]
        self.assertEqual((nvda.ticker, nvda.asset_type, nvda.kind, nvda.exercise), ('NVDA', 'ST', 'purchase', True))

    def test_a_description_split_by_a_page_break_still_reaches_its_row(self):
        nvda_calls = self.rows[5]
        self.assertEqual((nvda_calls.ticker, nvda_calls.option), ('NVDA', 'call'))

    def test_a_wrapped_description_does_not_leak_into_the_next_asset(self):
        panw = self.rows[6]
        self.assertEqual(panw.asset, 'Palo Alto Networks, Inc. (PANW)')
        self.assertTrue(panw.exercise)


class PelosiFundReportTest(SimpleTestCase):
    def test_a_mutual_fund_without_a_ticker_is_stored_but_not_priceable(self):
        rows = report('20030630').rows
        self.assertEqual(len(rows), 2)
        fund = rows[1]
        self.assertEqual((fund.asset, fund.asset_type, fund.ticker, fund.kind), (
            'Matthews International Mutual Fund', 'OT', None, 'sale',
        ))
        self.assertFalse(fund.priceable)


class PelosiLlcReportTest(SimpleTestCase):
    def test_a_spouse_llc_purchase(self):
        rows = report('20035553').rows
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0].owner, rows[0].asset, rows[0].asset_type, rows[0].ticker), (
            'SP', 'REOF XXX, LLC', 'AB', None,
        ))
        self.assertEqual((rows[0].amount_low, rows[0].amount_high), (500001, 1000000))


class PageBreakInsideARowTest(SimpleTestCase):
    def test_a_row_cut_by_the_page_header_keeps_both_amount_bounds(self):
        text = pdf_text((TESTDATA / '20030541.pdf').read_bytes())
        parsed = parse_report(text)
        self.assertEqual(len(parsed.rows), text.count('[GS]'))
        self.assertEqual(parsed.unparsed_rows, 0)
        split = [row for row in parsed.rows if row.asset.startswith('New York NY City Transitional Fin') and 'Feb 1, 2032' in row.asset]
        self.assertEqual(len(split), 1)
        self.assertEqual((split[0].owner, split[0].kind, split[0].amount_low, split[0].amount_high), (
            'JT', 'partial_sale', 15001, 50000,
        ))
        self.assertTrue(all(row.asset_type == 'GS' and row.ticker is None for row in parsed.rows))


class AmendedReportTest(SimpleTestCase):
    def test_an_amended_status_line_marks_the_report(self):
        text = pdf_text((TESTDATA / '20035553.pdf').read_bytes()).replace(': New', ': Amended')
        self.assertTrue(parse_report(text).amended)
```

- [ ] **Step 6: Run to verify failure**

Run: `cd backend && python manage.py test congress.test_parse`
Expected: FAIL, no module `congress.parse`.

- [ ] **Step 7: Implement `parse.py`**

What the extracted text looks like (pypdf drops the bold header letters, so "Filing Status: New" reads `F      S     : New` and "Description:" reads `D          : …`):

```
SP Alphabet Inc. - Class A Common
Stock (GOOGL) [OP]
P 01/14/2025 01/14/2025 $250,001 -
$500,000
F      S     : New
D          : Purchased 50 call options with a strike price of $150 and an expiration date of 1/16/26.
```

Each page repeats a header block that ends with `$200?`, preceded on every page after the first by `Filing ID #<doc>`. Rows end at their status line; label lines after it (`D :`, `L :`, `C :`) belong to that row; a description without a final full stop continues on the next line.

```python
import io
import re
from dataclasses import dataclass, field
from datetime import datetime

import pypdf

from .amounts import parse_range

_HEADER_END = '$200?\n'
_FOOTER = re.compile(r'^\* For the complete list', re.M)
_PAGE_BREAK = re.compile(r'Filing ID #\d+\n(?:.*\n)*?\$200\?\n')
_STATUS = re.compile(r'^F(?:iling)?\s+S(?:tatus)?\s*:\s*(New|Amended)\b')
_LABEL = re.compile(r'^(?P<key>[A-Z])(?:\s{2,}|[a-z]+\s*)[A-Za-z ]*:\s*(?P<text>.*)$')
_CORE = re.compile(
    r'(?:^|(?<=\s))(?P<kind>S \(partial\)|P|S|E)\s+'
    r'(?P<traded>\d{2}/\d{2}/\d{4})\s+(?P<notified>\d{2}/\d{2}/\d{4})\s+'
    r'(?P<amount>(?:Spouse/DC )?Over \$[\d,]+|\$[\d,]+\s*-\s*(?:\$[\d,]+)?)'
)
_OWNER = re.compile(r'^(SP|JT|DC)\s+')
_TYPE = re.compile(r'\s*\[([A-Z]{2})\]')
_TICKER = re.compile(r'\(([A-Z][A-Z0-9.]{0,9})\)\s*\[')
_DOLLARS = re.compile(r'\$[\d,]+')
_KINDS = {'P': 'purchase', 'S': 'sale', 'S (partial)': 'partial_sale', 'E': 'exchange'}
_PRICEABLE_TYPES = {'ST', 'OP'}


@dataclass
class ParsedTrade:
    owner: str
    asset: str
    asset_type: str
    ticker: str | None
    kind: str
    option: str
    exercise: bool
    traded_on: object
    notified_on: object
    amount_low: int
    amount_high: int | None
    priceable: bool


@dataclass
class ParsedReport:
    rows: list = field(default_factory=list)
    amended: bool = False
    unparsed_rows: int = 0


def pdf_text(data):
    reader = pypdf.PdfReader(io.BytesIO(data))
    return '\n'.join(page.extract_text() or '' for page in reader.pages)


def _body(text):
    start = text.find(_HEADER_END)
    body = text[start + len(_HEADER_END):] if start >= 0 else text
    footer = _FOOTER.search(body)
    body = body[:footer.start()] if footer else body
    return _PAGE_BREAK.sub('', body + '\n')


def _records(body):
    records, current, continuing = [], [], False
    for line in body.splitlines():
        status = _STATUS.match(line)
        if status:
            records.append({'lines': current, 'status': status.group(1), 'notes': []})
            current, continuing = [], False
            continue
        if records and not current:
            label = _LABEL.match(line)
            if label or continuing:
                note = label.group('text') if label else line
                records[-1]['notes'].append(note)
                is_description = (label and label.group('key') == 'D') or (not label and continuing)
                continuing = bool(is_description) and not note.rstrip().endswith('.')
                continue
        if line.strip():
            current.append(line)
    return records, current


def _date(text):
    return datetime.strptime(text, '%m/%d/%Y').date()


def _trade(record):
    flat = ' '.join(line.strip() for line in record['lines'])
    core = _CORE.search(flat)
    if core is None:
        return None
    head, tail = flat[:core.start()].strip(), flat[core.end():].strip()
    amount = core.group('amount')
    if amount.rstrip().endswith('-'):
        closing = _DOLLARS.search(tail)
        if closing is None:
            return None
        amount = f'{amount} {closing.group(0)}'
        tail = (tail[:closing.start()] + tail[closing.end():]).strip()
    low, high = parse_range(amount)
    owner_match = _OWNER.match(head)
    owner = owner_match.group(1) if owner_match else 'self'
    head = head[owner_match.end():] if owner_match else head
    type_match = _TYPE.search(flat)
    asset_type = type_match.group(1) if type_match else ''
    ticker_match = _TICKER.search(flat)
    ticker = ticker_match.group(1) if ticker_match else None
    asset = _TYPE.sub('', f'{head} {tail}').strip()
    description = ' '.join(record['notes']).lower()
    option = ''
    if asset_type == 'OP':
        option = 'put' if 'put' in description else 'call'
    return ParsedTrade(
        owner=owner,
        asset=asset,
        asset_type=asset_type,
        ticker=ticker,
        kind=_KINDS[core.group('kind')],
        option=option,
        exercise=description.startswith('exercised'),
        traded_on=_date(core.group('traded')),
        notified_on=_date(core.group('notified')),
        amount_low=low,
        amount_high=high,
        priceable=bool(ticker) and asset_type in _PRICEABLE_TYPES,
    )


def parse_report(text):
    records, leftover = _records(_body(text))
    parsed = ParsedReport(amended=any(record['status'] == 'Amended' for record in records))
    for record in records:
        trade = _trade(record)
        if trade is None:
            parsed.unparsed_rows += 1
        else:
            parsed.rows.append(trade)
    parsed.unparsed_rows += bool(leftover)
    return parsed
```

- [ ] **Step 8: Run tests, adjust regexes against the fixtures until green**

Run: `cd backend && python manage.py test congress.test_amounts congress.test_parse -v 2`
Expected: all PASS. If a fixture fails, print `_body(pdf_text(...))` for that fixture and adjust only the regex that misreads it; do not special-case a document ID.

- [ ] **Step 9: Commit**

```bash
git add backend/congress/amounts.py backend/congress/parse.py backend/congress/test_amounts.py backend/congress/test_parse.py backend/congress/testdata
git commit -m "feat(congress): parse House PTR PDFs into trades, with range, option, exercise and page-break handling"
```

---

### Task 3: Member matching

**Files:**
- Create: `backend/congress/members.py`, `backend/congress/member_aliases.csv`, `backend/congress/test_members.py`

**Interfaces:**
- Consumes: `Member` (Task 1).
- Produces:
  - `members.IndexEntry(doc_id, first, last, state_district, filed_on, year)` dataclass (built by Task 4).
  - `members.Directory(legislators: list[dict])` with `find(last, first, state) -> dict | None` returning `{'bioguide', 'party'}`; `Directory.fetch()` classmethod downloading the dataset.
  - `members.member_for(entry: IndexEntry, directory: Callable[[], Directory]) -> Member`.

- [ ] **Step 1: Write the failing tests**

`backend/congress/test_members.py`:

```python
from datetime import date
from unittest import mock

from django.test import TestCase

from . import members
from .members import Directory, IndexEntry, member_for
from .models import Member


def legislator(bioguide, first, last, state, district, party='Democrat', end='2027-01-03'):
    return {
        'id': {'bioguide': bioguide},
        'name': {'first': first, 'last': last},
        'terms': [{'type': 'rep', 'state': state, 'district': district, 'party': party, 'start': '2023-01-03', 'end': end}],
    }


DATASET = [
    legislator('P000197', 'Nancy', 'Pelosi', 'CA', 11),
    legislator('C001120', 'Dan', 'Crenshaw', 'TX', 2, party='Republican'),
    legislator('S000001', 'Adam', 'Smith', 'WA', 9),
    legislator('S000002', 'Jason', 'Smith', 'MO', 8, party='Republican'),
    legislator('O000001', 'Old', 'Timer', 'OH', 1, end='2019-01-03'),
]


def entry(first, last, state_district, doc_id='20000001'):
    return IndexEntry(doc_id=doc_id, first=first, last=last, state_district=state_district,
                      filed_on=date(2026, 1, 2), year=2026)


class DirectoryTest(TestCase):
    def setUp(self):
        self.directory = Directory(DATASET)

    def test_finds_by_last_name_and_state(self):
        self.assertEqual(self.directory.find('Pelosi', 'Nancy', 'CA'), {'bioguide': 'P000197', 'party': 'Democrat'})

    def test_ignores_accents_case_and_middle_initials(self):
        self.assertEqual(self.directory.find('CRENSHAW', 'Daniel R.', 'TX')['bioguide'], 'C001120')

    def test_members_who_left_before_2021_are_not_candidates(self):
        self.assertIsNone(self.directory.find('Timer', 'Old', 'OH'))


class MemberForTest(TestCase):
    def setUp(self):
        self.calls = 0

        def provider():
            self.calls += 1
            return Directory(DATASET)

        self.provider = provider

    def test_creates_a_member_with_party_and_photo(self):
        member = member_for(entry('Nancy', 'Pelosi', 'CA11'), self.provider)
        self.assertEqual((member.slug, member.bioguide_id, member.party), ('nancy-pelosi', 'P000197', 'Democrat'))
        self.assertEqual(member.photo_url, 'https://unitedstates.github.io/images/congress/225x275/P000197.jpg')

    def test_a_known_member_does_not_touch_the_dataset(self):
        member_for(entry('Nancy', 'Pelosi', 'CA11'), self.provider)
        member_for(entry('Nancy', 'Pelosi', 'CA11', doc_id='20000002'), self.provider)
        self.assertEqual(self.calls, 1)

    def test_redistricted_member_stays_one_member(self):
        first = member_for(entry('Dan', 'Crenshaw', 'TX02'), self.provider)
        second = member_for(entry('Dan', 'Crenshaw', 'TX05'), self.provider)
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(Member.objects.get(pk=first.pk).state_district, 'TX05')

    def test_two_smiths_in_different_states_are_two_members_with_distinct_slugs(self):
        adam = member_for(entry('Adam', 'Smith', 'WA09'), self.provider)
        jason = member_for(entry('Jason', 'Smith', 'MO08'), self.provider)
        self.assertNotEqual(adam.slug, jason.slug)

    def test_an_alias_answers_a_name_the_dataset_cannot_match(self):
        with mock.patch.object(members, 'aliases', return_value={('pelosi', 'nan', 'CA11'): 'P000197'}):
            member = member_for(entry('Nan', 'Pelosi', 'CA11'), self.provider)
        self.assertEqual(member.bioguide_id, 'P000197')

    def test_an_unmatched_member_is_created_without_party(self):
        with self.assertLogs('congress.members', level='WARNING'):
            member = member_for(entry('Nobody', 'Known', 'ZZ01'), self.provider)
        self.assertEqual((member.bioguide_id, member.party, member.slug), (None, '', 'nobody-known'))
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test congress.test_members`
Expected: FAIL, no module `congress.members`.

- [ ] **Step 3: Implement**

`backend/congress/member_aliases.csv`:

```
last,first,state_district,bioguide
```

`backend/congress/members.py`:

```python
import csv
import logging
import unicodedata
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import requests
from django.utils.text import slugify

from .models import Member

logger = logging.getLogger(__name__)

CURRENT_URL = 'https://unitedstates.github.io/congress-legislators/legislators-current.json'
HISTORICAL_URL = 'https://unitedstates.github.io/congress-legislators/legislators-historical.json'
PHOTO_URL = 'https://unitedstates.github.io/images/congress/225x275/{bioguide}.jpg'
SINCE = date(2021, 1, 1)
TIMEOUT = 60
ALIASES = Path(__file__).with_name('member_aliases.csv')


@dataclass
class IndexEntry:
    doc_id: str
    first: str
    last: str
    state_district: str
    filed_on: date
    year: int


def normalize(name):
    plain = unicodedata.normalize('NFKD', name or '').encode('ascii', 'ignore').decode()
    return ' '.join(''.join(ch if ch.isalpha() or ch in ' -' else ' ' for ch in plain.lower()).split())


def first_token(name):
    return normalize(name).split(' ')[0] if normalize(name) else ''


class Directory:
    def __init__(self, legislators):
        self.by_key = {}
        for person in legislators:
            terms = [term for term in person.get('terms', []) if term.get('type') == 'rep' and term.get('end', '') >= SINCE.isoformat()]
            if not terms:
                continue
            latest = terms[-1]
            key = (normalize(person['name'].get('last')), latest['state'])
            self.by_key.setdefault(key, []).append({
                'bioguide': person['id']['bioguide'],
                'party': latest.get('party', ''),
                'first': first_token(person['name'].get('first')),
                'nickname': first_token(person['name'].get('nickname', '')),
            })

    @classmethod
    def fetch(cls):
        legislators = []
        for url in (CURRENT_URL, HISTORICAL_URL):
            response = requests.get(url, timeout=TIMEOUT)
            response.raise_for_status()
            legislators += response.json()
        return cls(legislators)

    def find(self, last, first, state):
        candidates = self.by_key.get((normalize(last), state), [])
        if len(candidates) > 1:
            wanted = first_token(first)
            candidates = [found for found in candidates if wanted in (found['first'], found['nickname'])]
        if len(candidates) != 1:
            return None
        return {'bioguide': candidates[0]['bioguide'], 'party': candidates[0]['party']}


def aliases():
    with ALIASES.open(newline='') as handle:
        return {
            (normalize(row['last']), first_token(row['first']), row['state_district']): row['bioguide']
            for row in csv.DictReader(handle)
        }


def _unique_slug(first, last, state_district):
    base = slugify(f'{first_token(first)} {last}')
    if not Member.objects.filter(slug=base).exists():
        return base
    return slugify(f'{base} {state_district}')


def member_for(entry, directory):
    known = Member.objects.filter(
        last_name=entry.last, first_name=entry.first, state_district=entry.state_district,
    ).first()
    if known:
        return known
    state = entry.state_district[:2]
    bioguide = aliases().get((normalize(entry.last), first_token(entry.first), entry.state_district))
    party = ''
    if bioguide is None:
        found = directory().find(entry.last, entry.first, state)
        if found:
            bioguide, party = found['bioguide'], found['party']
    if bioguide:
        existing = Member.objects.filter(bioguide_id=bioguide).first()
        if existing:
            existing.state_district = entry.state_district
            existing.save(update_fields=['state_district'])
            return existing
    else:
        logger.warning('No legislator match for %s %s (%s); add it to member_aliases.csv', entry.first, entry.last, entry.state_district)
    return Member.objects.create(
        slug=_unique_slug(entry.first, entry.last, entry.state_district),
        bioguide_id=bioguide,
        first_name=entry.first,
        last_name=entry.last,
        state_district=entry.state_district,
        party=party,
        photo_url=PHOTO_URL.format(bioguide=bioguide) if bioguide else '',
    )
```

Note on the redistricting test: the second entry (`TX05`) is not found by name + district, so it resolves to the same bioguide and updates the existing member.

- [ ] **Step 4: Run tests**

Run: `cd backend && python manage.py test congress.test_members -v 2`
Expected: 9 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/congress/members.py backend/congress/member_aliases.csv backend/congress/test_members.py
git commit -m "feat(congress): match filers to the congress-legislators dataset, with aliases and redistricting"
```

---

### Task 4: House index sync and report parsing

**Files:**
- Create: `backend/congress/house.py`, `backend/congress/test_house.py`

**Interfaces:**
- Consumes: `members.IndexEntry`, `members.member_for`, `members.Directory`, `parse.pdf_text`, `parse.parse_report`, models.
- Produces:
  - `house.entries(xml_bytes: bytes) -> list[IndexEntry]` (only `FilingType == 'P'`).
  - `house.sync_index(year: int, now, directory=None) -> int` number of new reports.
  - `house.parse_pending(pause=time.sleep) -> ParseResult(parsed: int, failed: int, member_ids: set[int])`.
  - `house.HouseError`.

- [ ] **Step 1: Write the failing tests**

`backend/congress/test_house.py`:

```python
import io
import zipfile
from datetime import date, datetime, timezone as tz
from pathlib import Path
from unittest import mock

from django.test import TestCase

from . import house
from .members import Directory
from .models import HouseIndexState, Member, Report, Trade

TESTDATA = Path(__file__).with_name('testdata')
NOW = datetime(2026, 10, 15, 14, 0, tzinfo=tz.utc)

INDEX_XML = b'''<?xml version="1.0" encoding="utf-8"?>
<FinancialDisclosure>
  <Member><Prefix>Hon.</Prefix><Last>Pelosi</Last><First>Nancy</First><Suffix /><FilingType>P</FilingType>
    <StateDst>CA11</StateDst><Year>2025</Year><FilingDate>1/17/2025</FilingDate><DocID>20026590</DocID></Member>
  <Member><Prefix>Hon.</Prefix><Last>Pelosi</Last><First>Nancy</First><Suffix /><FilingType>O</FilingType>
    <StateDst>CA11</StateDst><Year>2025</Year><FilingDate>5/15/2025</FilingDate><DocID>10070000</DocID></Member>
  <Member><Prefix>Hon.</Prefix><Last>Pelosi</Last><First>Nancy</First><Suffix /><FilingType>P</FilingType>
    <StateDst>CA11</StateDst><Year>2025</Year><FilingDate>2/3/2025</FilingDate><DocID>8221321</DocID></Member>
</FinancialDisclosure>'''


def zipped(xml):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as archive:
        archive.writestr('2025FD.xml', xml)
        archive.writestr('2025FD.txt', '')
    return buffer.getvalue()


def response(status=200, content=b'', headers=None):
    answer = mock.Mock(status_code=status, content=content, headers=headers or {})
    return answer


def DIRECTORY():
    return Directory([{
        'id': {'bioguide': 'P000197'}, 'name': {'first': 'Nancy', 'last': 'Pelosi'},
        'terms': [{'type': 'rep', 'state': 'CA', 'district': 11, 'party': 'Democrat', 'start': '2025-01-03', 'end': '2027-01-03'}],
    }])


class EntriesTest(TestCase):
    def test_keeps_only_periodic_transaction_reports(self):
        found = house.entries(INDEX_XML)
        self.assertEqual([entry.doc_id for entry in found], ['20026590', '8221321'])
        self.assertEqual(found[0].filed_on, date(2025, 1, 17))
        self.assertEqual(found[0].state_district, 'CA11')


class SyncIndexTest(TestCase):
    def test_creates_reports_and_marks_paper_ones(self):
        with mock.patch.object(house, '_get', return_value=response(content=zipped(INDEX_XML), headers={'ETag': '"a"', 'Last-Modified': 'Tue'})):
            created = house.sync_index(2025, NOW, directory=DIRECTORY)
        self.assertEqual(created, 2)
        self.assertEqual(Report.objects.get(doc_id='20026590').status, Report.PENDING)
        self.assertEqual(Report.objects.get(doc_id='8221321').status, Report.PAPER)
        state = HouseIndexState.objects.get(year=2025)
        self.assertEqual((state.etag, state.last_modified), ('"a"', 'Tue'))

    def test_an_unchanged_index_does_no_work(self):
        HouseIndexState.objects.create(year=2025, etag='"a"')
        with mock.patch.object(house, '_get', return_value=response(status=304)) as get:
            created = house.sync_index(2025, NOW, directory=DIRECTORY)
        self.assertEqual(created, 0)
        self.assertEqual(get.call_args.kwargs['headers'], {'If-None-Match': '"a"'})
        self.assertFalse(Report.objects.exists())

    def test_running_twice_creates_nothing_new(self):
        with mock.patch.object(house, '_get', return_value=response(content=zipped(INDEX_XML))):
            house.sync_index(2025, NOW, directory=DIRECTORY)
            self.assertEqual(house.sync_index(2025, NOW, directory=DIRECTORY), 0)


class ParsePendingTest(TestCase):
    def setUp(self):
        self.member = Member.objects.create(slug='nancy-pelosi', first_name='Nancy', last_name='Pelosi', state_district='CA11')
        self.report = Report.objects.create(doc_id='20026590', member=self.member, year=2025, filed_on=date(2025, 1, 17))
        Report.objects.create(doc_id='8221321', member=self.member, year=2025, filed_on=date(2025, 2, 3), status=Report.PAPER)

    def test_parses_a_pending_report_into_trades_and_never_downloads_paper(self):
        pdf = (TESTDATA / '20026590.pdf').read_bytes()
        with mock.patch.object(house, '_get', return_value=response(content=pdf)) as get:
            result = house.parse_pending(pause=lambda _: None)
        self.assertEqual((result.parsed, result.failed, result.member_ids), (1, 0, {self.member.pk}))
        self.assertEqual(get.call_count, 1)
        self.assertIn('/2025/20026590.pdf', get.call_args.args[0])
        self.report.refresh_from_db()
        self.assertEqual((self.report.status, self.report.attempts), (Report.PARSED, 1))
        self.assertEqual(Trade.objects.filter(report=self.report).count(), 9)

    def test_a_failure_is_recorded_retried_and_then_left(self):
        with mock.patch.object(house, '_get', side_effect=house.HouseError('boom')):
            for _ in range(4):
                house.parse_pending(pause=lambda _: None)
        self.report.refresh_from_db()
        self.assertEqual((self.report.status, self.report.attempts, self.report.error), (Report.FAILED, 3, 'boom'))

    def test_reparsing_replaces_the_previous_trades(self):
        pdf = (TESTDATA / '20026590.pdf').read_bytes()
        with mock.patch.object(house, '_get', return_value=response(content=pdf)):
            house.parse_pending(pause=lambda _: None)
            Report.objects.filter(pk=self.report.pk).update(status=Report.PENDING)
            house.parse_pending(pause=lambda _: None)
        self.assertEqual(Trade.objects.filter(report=self.report).count(), 9)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test congress.test_house`
Expected: FAIL, no module `congress.house`.

- [ ] **Step 3: Implement `house.py`**

```python
import io
import logging
import time
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from datetime import datetime
from functools import cache

import requests
from django.db import transaction
from django.db.models import Q

from . import members
from .members import IndexEntry
from .models import HouseIndexState, Report, Trade
from .parse import parse_report, pdf_text

logger = logging.getLogger(__name__)

INDEX_URL = 'https://disclosures-clerk.house.gov/public_disc/financial-pdfs/{year}FD.zip'
PDF_URL = 'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/{year}/{doc_id}.pdf'
USER_AGENT = 'Mozilla/5.0 (SaxoDash personal dashboard)'
PAPER_PREFIXES = ('8', '9')
PERIODIC_TRANSACTION = 'P'
MAX_ATTEMPTS = 3
PAUSE_SECONDS = 1.0
TIMEOUT = 30


class HouseError(Exception):
    pass


@dataclass
class ParseResult:
    parsed: int = 0
    failed: int = 0
    member_ids: set = field(default_factory=set)


def _get(url, headers=None):
    try:
        answer = requests.get(url, headers={'User-Agent': USER_AGENT, **(headers or {})}, timeout=TIMEOUT)
    except requests.RequestException as exc:
        raise HouseError(f'{url}: {exc}') from exc
    if answer.status_code not in (200, 304):
        raise HouseError(f'{url} answered {answer.status_code}')
    return answer


def entries(xml_bytes):
    found = []
    for node in ET.fromstring(xml_bytes).iter('Member'):
        if (node.findtext('FilingType') or '').strip() != PERIODIC_TRANSACTION:
            continue
        found.append(IndexEntry(
            doc_id=node.findtext('DocID').strip(),
            first=(node.findtext('First') or '').strip(),
            last=(node.findtext('Last') or '').strip(),
            state_district=(node.findtext('StateDst') or '').strip(),
            filed_on=datetime.strptime(node.findtext('FilingDate').strip(), '%m/%d/%Y').date(),
            year=int(node.findtext('Year')),
        ))
    return found


def _conditional(state):
    if state.etag:
        return {'If-None-Match': state.etag}
    if state.last_modified:
        return {'If-Modified-Since': state.last_modified}
    return {}


def sync_index(year, now, directory=None):
    directory = directory or cache(members.Directory.fetch)
    state, _ = HouseIndexState.objects.get_or_create(year=year)
    answer = _get(INDEX_URL.format(year=year), headers=_conditional(state))
    state.checked_at = now
    if answer.status_code == 304:
        state.save(update_fields=['checked_at'])
        return 0
    archive = zipfile.ZipFile(io.BytesIO(answer.content))
    xml = archive.read(f'{year}FD.xml')
    known = set(Report.objects.filter(year=year).values_list('doc_id', flat=True))
    created = 0
    for entry in entries(xml):
        if entry.doc_id in known:
            continue
        member = members.member_for(entry, directory)
        Report.objects.create(
            doc_id=entry.doc_id, member=member, year=year, filed_on=entry.filed_on,
            status=Report.PAPER if entry.doc_id.startswith(PAPER_PREFIXES) else Report.PENDING,
        )
        created += 1
    state.etag = answer.headers.get('ETag', '')
    state.last_modified = answer.headers.get('Last-Modified', '')
    state.save()
    logger.info('House %s index: Last-Modified %s, %s new reports', year, state.last_modified, created)
    return created


def _store(report, parsed):
    with transaction.atomic():
        report.trades.all().delete()
        Trade.objects.bulk_create(Trade(report=report, **vars(row)) for row in parsed.rows)
        report.status = Report.PARSED
        report.amended = parsed.amended
        report.unparsed_rows = parsed.unparsed_rows
        report.error = ''
        report.save()


def parse_pending(pause=time.sleep):
    result = ParseResult()
    due = Report.objects.filter(
        Q(status=Report.PENDING) | Q(status=Report.FAILED, attempts__lt=MAX_ATTEMPTS),
    ).order_by('filed_on', 'doc_id')
    for report in due:
        report.attempts += 1
        try:
            data = _get(PDF_URL.format(year=report.year, doc_id=report.doc_id)).content
            _store(report, parse_report(pdf_text(data)))
            result.parsed += 1
            result.member_ids.add(report.member_id)
        except Exception as exc:
            logger.warning('Could not parse House report %s', report.doc_id, exc_info=True)
            report.status = Report.FAILED
            report.error = str(exc)[:200]
            report.save(update_fields=['status', 'error', 'attempts'])
            result.failed += 1
        pause(PAUSE_SECONDS)
    return result
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python manage.py test congress.test_house -v 2`
Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/congress/house.py backend/congress/test_house.py
git commit -m "feat(congress): sync the House PTR index with ETag and parse e-filed reports, skipping paper"
```

---

### Task 5: Replay trades into estimated holdings

**Files:**
- Create: `backend/congress/replay.py`, `backend/congress/test_replay.py`

**Interfaces:**
- Consumes: `investors.copying.Period(filed_on, holdings, stock_value)`, `investors.prices.Series`, `amounts.size`.
- Produces:
  - `replay.TradeRow` dataclass: `filed_on, traded_on, ticker, kind, option, exercise, amount_low, amount_high, priceable, amended, asset, owner`.
  - `replay.dedupe(rows: list[TradeRow]) -> list[TradeRow]`.
  - `replay.replay(rows: list[TradeRow], prices: dict[str, Series]) -> Replayed(periods: list[Period], basis: dict)`; basis keys `trades`, `unseen_sales`, `unpriced`.

- [ ] **Step 1: Write the failing tests**

`backend/congress/test_replay.py`:

```python
from datetime import date

from django.test import SimpleTestCase

from investors.prices import Series

from .replay import TradeRow, dedupe, replay

D1, D2, D3, D4 = date(2025, 1, 2), date(2025, 1, 3), date(2025, 2, 3), date(2025, 2, 4)


def series(*closes):
    days = [D1, D2, D3, D4]
    return Series(days[:len(closes)], list(closes))


def row(ticker, kind='purchase', low=15001, high=50000, filed_on=D2, traded_on=D1, option='', exercise=False,
        priceable=True, amended=False):
    return TradeRow(
        filed_on=filed_on, traded_on=traded_on, ticker=ticker, kind=kind, option=option, exercise=exercise,
        amount_low=low, amount_high=high, priceable=priceable, amended=amended, asset=f'{ticker} Inc.', owner='SP',
    )


PRICES = {'NVDA': series(100, 100, 200, 200), 'AAPL': series(50, 50, 50, 50)}


def holdings(period):
    return dict(period.holdings)


class ReplayTest(SimpleTestCase):
    def test_a_purchase_is_sized_at_the_range_midpoint(self):
        result = replay([row('NVDA', low=1001, high=15000)], PRICES)
        self.assertEqual(len(result.periods), 1)
        self.assertAlmostEqual(holdings(result.periods[0])['NVDA'], 8000.5)

    def test_holdings_are_valued_at_the_filing_date_close(self):
        result = replay([row('NVDA', low=100, high=100, filed_on=D3)], PRICES)
        self.assertAlmostEqual(holdings(result.periods[0])['NVDA'], 200)

    def test_a_partial_sale_is_capped_at_what_is_held(self):
        rows = [row('AAPL', low=1000, high=1000), row('AAPL', kind='partial_sale', low=5000, high=5000, filed_on=D3, traded_on=D3)]
        result = replay(rows, PRICES)
        self.assertNotIn('AAPL', holdings(result.periods[-1]))

    def test_a_full_sale_closes_the_position(self):
        rows = [row('AAPL', low=1000, high=1000), row('AAPL', kind='sale', low=1, high=1, filed_on=D3, traded_on=D3)]
        self.assertNotIn('AAPL', holdings(replay(rows, PRICES).periods[-1]))

    def test_a_sale_of_something_never_seen_bought_is_counted_not_applied(self):
        result = replay([row('AAPL', kind='sale')], PRICES)
        self.assertEqual(result.basis['unseen_sales'], 1)
        self.assertEqual(holdings(result.periods[0]), {})

    def test_a_call_counts_as_the_underlying_and_a_put_is_ignored(self):
        rows = [row('NVDA', option='call', low=100, high=100), row('AAPL', option='put', low=100, high=100)]
        self.assertEqual(set(holdings(replay(rows, PRICES).periods[0])), {'NVDA'})

    def test_exercise_replaces_the_call_position(self):
        rows = [
            row('NVDA', option='call', low=100, high=100),
            row('NVDA', exercise=True, low=1000, high=1000, filed_on=D3, traded_on=D3),
        ]
        self.assertAlmostEqual(holdings(replay(rows, PRICES).periods[-1])['NVDA'], 1000)

    def test_unpriceable_and_unpriced_trades_are_counted(self):
        rows = [row(None, priceable=False), row('ZZZZ')]
        basis = replay(rows, PRICES).basis
        self.assertEqual((basis['trades'], basis['unpriced']), (2, 2))

    def test_one_period_per_filing_date(self):
        rows = [row('NVDA'), row('AAPL'), row('AAPL', filed_on=D3, traded_on=D3)]
        self.assertEqual([period.filed_on for period in replay(rows, PRICES).periods], [D2, D3])


class DedupeTest(SimpleTestCase):
    def test_amended_duplicate_counts_once_at_the_first_filing(self):
        original = row('NVDA', filed_on=D2)
        amended = row('NVDA', filed_on=D3, amended=True)
        kept = dedupe([original, amended])
        self.assertEqual(len(kept), 1)
        self.assertTrue(kept[0].amended)
        self.assertEqual(kept[0].filed_on, D2)

    def test_two_different_trades_are_both_kept(self):
        self.assertEqual(len(dedupe([row('NVDA'), row('NVDA', kind='partial_sale')])), 2)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test congress.test_replay`
Expected: FAIL, no module `congress.replay`.

- [ ] **Step 3: Implement `replay.py`**

```python
from collections import defaultdict
from dataclasses import dataclass, replace
from itertools import groupby

from investors.copying import Period

from .amounts import size

PURCHASE = 'purchase'
SALE = 'sale'
EXCHANGE = 'exchange'
CALL = 'call'
PUT = 'put'


@dataclass(frozen=True)
class TradeRow:
    filed_on: object
    traded_on: object
    ticker: str | None
    kind: str
    option: str
    exercise: bool
    amount_low: int
    amount_high: int | None
    priceable: bool
    amended: bool
    asset: str
    owner: str


@dataclass
class Replayed:
    periods: list
    basis: dict


def _identity(row):
    return (row.owner, row.asset.lower(), row.traded_on, row.kind, row.option, row.amount_low, row.amount_high)


def dedupe(rows):
    kept = {}
    for row in sorted(rows, key=lambda found: found.filed_on):
        key = _identity(row)
        earlier = kept.get(key)
        if earlier is None:
            kept[key] = row
        elif row.amended:
            kept[key] = replace(row, filed_on=earlier.filed_on)
    return sorted(kept.values(), key=lambda found: (found.filed_on, found.traded_on))


def _apply(row, price, stock, calls, basis):
    shares = size(row.amount_low, row.amount_high) / price
    book = calls if row.option == CALL else stock
    if row.kind == PURCHASE:
        if row.exercise:
            calls.pop(row.ticker, None)
        book[row.ticker] += shares
        return
    held = book.get(row.ticker, 0.0)
    if held <= 0:
        basis['unseen_sales'] += 1
        return
    remaining = 0.0 if row.kind == SALE else max(0.0, held - shares)
    if remaining > 0:
        book[row.ticker] = remaining
    else:
        book.pop(row.ticker, None)


def _period(filed_on, stock, calls, prices):
    held = []
    for ticker in set(stock) | set(calls):
        price = prices[ticker].at(filed_on)
        if price:
            held.append((ticker, (stock.get(ticker, 0.0) + calls.get(ticker, 0.0)) * price))
    held.sort(key=lambda found: (-found[1], found[0]))
    return Period(filed_on, held, int(sum(value for _, value in held)))


def replay(rows, prices):
    stock, calls = defaultdict(float), defaultdict(float)
    basis = {'trades': 0, 'unseen_sales': 0, 'unpriced': 0}
    periods = []
    ordered = sorted(rows, key=lambda found: (found.filed_on, found.traded_on))
    for filed_on, group in groupby(ordered, key=lambda found: found.filed_on):
        for row in group:
            basis['trades'] += 1
            if row.option == PUT or row.kind == EXCHANGE:
                continue
            series = prices.get(row.ticker) if row.priceable else None
            price = series.at(row.traded_on) if series else None
            if not price:
                basis['unpriced'] += 1
                continue
            _apply(row, price, stock, calls, basis)
        periods.append(_period(filed_on, stock, calls, prices))
    return Replayed(periods, basis)
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python manage.py test congress.test_replay -v 2`
Expected: 11 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/congress/replay.py backend/congress/test_replay.py
git commit -m "feat(congress): replay trades into estimated holdings per filing, deduping amended reports"
```

---

### Task 6: Copy performance, holdings and the price-feed hook

**Files:**
- Create: `backend/congress/performance.py`, `backend/congress/test_performance.py`
- Modify: `backend/investors/copying.py:142-152` (rename `_series` → `price_series`), `backend/investors/price_feed.py:64-74` (ticker sources), `backend/investors/test_price_feed.py`, `backend/congress/apps.py`

**Interfaces:**
- Consumes: `replay.TradeRow/dedupe/replay`, `investors.copying.measure`, `investors.copying.BENCHMARK_TICKER`, models.
- Produces:
  - `investors.copying.price_series(tickers: set[str]) -> dict[str, Series]` (public).
  - `investors.price_feed.add_ticker_source(source: Callable[[], tuple[set, set]])`.
  - `congress.performance.rows_for(member) -> list[TradeRow]`, `congress.performance.rebuild(member) -> bool`, `congress.performance.rebuild_all() -> int`, `congress.performance.wanted_tickers() -> tuple[set, set]`, `congress.performance.payload(member) -> dict`.

- [ ] **Step 1: Write the failing price-feed test**

Append to `backend/investors/test_price_feed.py` (inside the module, as a new class):

```python
class TickerSourceTest(TestCase):
    def tearDown(self):
        price_feed._ticker_sources.clear()

    def test_registered_sources_join_the_wanted_tickers(self):
        price_feed.add_ticker_source(lambda: ({'NVDA'}, {'NVDA', 'TEM'}))
        current, ever = price_feed._wanted()
        self.assertIn('NVDA', current)
        self.assertTrue({'NVDA', 'TEM'} <= ever)

    def test_registering_twice_counts_once(self):
        def source():
            return set(), {'TEM'}

        price_feed.add_ticker_source(source)
        price_feed.add_ticker_source(source)
        self.assertEqual(len(price_feed._ticker_sources), 1)
```

(Use the imports already at the top of that file; add `from django.test import TestCase` and `from . import price_feed` only if they are missing.)

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test investors.test_price_feed.TickerSourceTest`
Expected: FAIL, `add_ticker_source` missing.

- [ ] **Step 3: Implement the hook and the rename**

In `backend/investors/price_feed.py`, after the constants:

```python
_ticker_sources = []


def add_ticker_source(source):
    if source not in _ticker_sources:
        _ticker_sources.append(source)
```

and at the end of `_wanted()` before `return current, ever`:

```python
    for source in _ticker_sources:
        more_current, more_ever = source()
        current |= more_current
        ever |= more_ever | more_current
```

`_due` bulk-creates a `PriceHistory` row for every ticker in `ever` and refreshes `current` nightly, so a source's current tickers must also be in `ever`; the `| more_current` keeps that true.

In `backend/investors/copying.py`:
- rename `def _series(tickers):` to `def price_series(tickers):` and update its caller in `rebuild()` (`prices = price_series(wanted | {BENCHMARK_TICKER})`);
- rename `def _edge(ours, market):` to `def edge(ours, market):` and update its callers in `payload()` and `annualised_edges()`.

Run: `python manage.py test investors` → all PASS.

- [ ] **Step 4: Write the failing congress copy tests**

`backend/congress/test_performance.py`:

```python
from datetime import date, timedelta

from django.test import TestCase

from investors.models import PriceHistory

from . import performance
from .models import CopyPerformance, Holding, Member, Report, Trade

START = date(2025, 1, 2)


def closes(start_price, step):
    return [[(START + timedelta(days=offset)).isoformat(), start_price + step * offset] for offset in range(400)]


class CopyTest(TestCase):
    def setUp(self):
        PriceHistory.objects.create(ticker='SPY', status=PriceHistory.OK, closes=closes(500, 0.5))
        PriceHistory.objects.create(ticker='NVDA', status=PriceHistory.OK, closes=closes(100, 1))
        self.member = Member.objects.create(slug='nancy-pelosi', first_name='Nancy', last_name='Pelosi', state_district='CA11')
        report = Report.objects.create(
            doc_id='1', member=self.member, year=2025, filed_on=START + timedelta(days=10), status=Report.PARSED,
        )
        Trade.objects.create(
            report=report, owner='SP', asset='NVIDIA Corporation (NVDA)', asset_type='ST', ticker='NVDA',
            kind=Trade.PURCHASE, traded_on=START + timedelta(days=2), amount_low=15001, amount_high=50000, priceable=True,
        )
        Report.objects.create(doc_id='8000001', member=self.member, year=2025, filed_on=START, status=Report.PAPER)
        Report.objects.create(doc_id='2', member=self.member, year=2025, filed_on=START, status=Report.FAILED)

    def test_rebuild_stores_copy_performance_holdings_and_basis(self):
        self.assertTrue(performance.rebuild(self.member))
        stored = CopyPerformance.objects.get(member=self.member)
        self.assertGreater(stored.clone_return_pct, 0)
        self.assertEqual(list(Holding.objects.filter(member=self.member).values_list('ticker', 'weight_pct')), [('NVDA', 100.0)])
        self.member.refresh_from_db()
        self.assertEqual(self.member.basis, {
            'trades': 1, 'unseen_sales': 0, 'unpriced': 0, 'paper_reports': 1, 'failed_reports': 1, 'unparsed_rows': 0,
            'since': '2021-01-01',
        })

    def test_only_parsed_reports_contribute(self):
        Report.objects.filter(doc_id='1').update(status=Report.FAILED)
        self.assertEqual(performance.rows_for(self.member), [])

    def test_wanted_tickers_cover_holdings_and_every_priceable_trade(self):
        performance.rebuild(self.member)
        current, ever = performance.wanted_tickers()
        self.assertEqual((current, ever), ({'NVDA'}, {'NVDA'}))

    def test_payload_reports_unavailable_before_a_rebuild(self):
        self.assertFalse(performance.payload(self.member)['available'])
```

- [ ] **Step 5: Run to verify failure**

Run: `cd backend && python manage.py test congress.test_performance`
Expected: FAIL, no module `congress.copy`.

- [ ] **Step 6: Implement `performance.py` and register the source**

`backend/congress/performance.py`:

```python
from django.db import transaction
from django.db.models import Sum

from investors import copying
from investors.prices import Series

from .models import CopyPerformance, Holding, Member, Report, Trade
from .replay import PUT, TradeRow, dedupe, replay

BACKFILL_SINCE = '2021-01-01'


def rows_for(member):
    trades = Trade.objects.filter(report__member=member, report__status=Report.PARSED).select_related('report')
    return dedupe([
        TradeRow(
            filed_on=trade.report.filed_on, traded_on=trade.traded_on, ticker=trade.ticker, kind=trade.kind,
            option=trade.option, exercise=trade.exercise, amount_low=trade.amount_low, amount_high=trade.amount_high,
            priceable=trade.priceable, amended=trade.report.amended, asset=trade.asset, owner=trade.owner,
        )
        for trade in trades
    ])


def _report_counts(member):
    reports = Report.objects.filter(member=member)
    return {
        'paper_reports': reports.filter(status=Report.PAPER).count(),
        'failed_reports': reports.filter(status=Report.FAILED).count(),
        'unparsed_rows': reports.aggregate(total=Sum('unparsed_rows'))['total'] or 0,
    }


def _store_holdings(member, periods):
    Holding.objects.filter(member=member).delete()
    latest = periods[-1].holdings if periods else []
    total = sum(value for _, value in latest)
    Holding.objects.bulk_create(
        Holding(member=member, ticker=ticker, value=value, weight_pct=round(value / total * 100, 2))
        for ticker, value in latest if total
    )


@transaction.atomic
def rebuild(member):
    rows = rows_for(member)
    wanted = {row.ticker for row in rows if row.priceable and row.option != PUT}
    prices = copying.price_series(wanted | {copying.BENCHMARK_TICKER})
    result = replay(rows, prices)
    _store_holdings(member, result.periods)
    member.basis = {**result.basis, **_report_counts(member), 'since': BACKFILL_SINCE}
    member.save(update_fields=['basis'])
    measured = copying.measure(result.periods, prices, prices.get(copying.BENCHMARK_TICKER) or Series([], []))
    if measured is None:
        CopyPerformance.objects.filter(member=member).delete()
        return False
    CopyPerformance.objects.update_or_create(member=member, defaults=measured)
    return True


def rebuild_all():
    return sum(rebuild(member) for member in Member.objects.all())


def wanted_tickers():
    current = set(Holding.objects.values_list('ticker', flat=True))
    ever = set(
        Trade.objects.filter(priceable=True).exclude(option=PUT).exclude(ticker__isnull=True).values_list('ticker', flat=True)
    )
    return current, ever | current


def payload(member):
    method = {'benchmark': copying.BENCHMARK_NAME, 'holdings': None}
    stored = CopyPerformance.objects.filter(member=member).first()
    if stored is None:
        return {'available': False, **method}
    return {
        'available': True,
        **method,
        'since': stored.since.isoformat(),
        'until': stored.until.isoformat(),
        'clone_return_pct': stored.clone_return_pct,
        'benchmark_return_pct': stored.benchmark_return_pct,
        'excess_return_pct': copying.edge(stored.clone_return_pct, stored.benchmark_return_pct),
        'clone_cagr_pct': stored.clone_cagr_pct,
        'benchmark_cagr_pct': stored.benchmark_cagr_pct,
        'excess_cagr_pct': copying.edge(stored.clone_cagr_pct, stored.benchmark_cagr_pct),
        'coverage_pct': stored.coverage_pct,
        'periods': stored.periods,
        'skipped_periods': stored.skipped_periods,
        'series': stored.series,
        'computed_at': stored.computed_at.isoformat(),
    }
```

`backend/congress/apps.py`, add:

```python
    def ready(self):
        from investors import price_feed

        from . import performance

        price_feed.add_ticker_source(performance.wanted_tickers)
```

- [ ] **Step 7: Run tests**

Run: `cd backend && python manage.py test congress investors -v 1`
Expected: all PASS. If `test_rebuild_stores_copy_performance_holdings_and_basis` shows `clone_return_pct` None because `measure` needs the entry after the filing date to exist, check the PriceHistory fixture starts before `filed_on` (it does: day 0 vs day 10).

- [ ] **Step 8: Commit**

```bash
git add backend/congress/performance.py backend/congress/test_performance.py backend/congress/apps.py backend/investors/copying.py backend/investors/price_feed.py backend/investors/test_price_feed.py
git commit -m "feat(congress): copy performance and estimated holdings through investors.copying, with a price-feed ticker source"
```

---

### Task 7: Sync task, schedule and operator commands

**Files:**
- Create: `backend/congress/tasks.py`, `backend/congress/test_tasks.py`, `backend/congress/management/__init__.py`, `backend/congress/management/commands/__init__.py`, `backend/congress/management/commands/backfill_house.py`, `backend/congress/management/commands/reparse_reports.py`, `backend/core/migrations/0010_seed_house_sync.py`
- Modify: `backend/core/scheduling.py` (PERIODIC_TASKS), `backend/core/test_scheduling.py`

**Interfaces:**
- Consumes: `house.sync_index`, `house.parse_pending`, `performance.rebuild`, `saxo.tasks.synced/SyncReport`.
- Produces: Celery task `congress.tasks.sync_house`; commands `backfill_house --since YEAR`, `reparse_reports [--doc-id ID | --failed]`.

- [ ] **Step 1: Write the failing tests**

`backend/congress/test_tasks.py`:

```python
from datetime import date, datetime, timezone as tz
from unittest import mock

from django.core.management import call_command
from django.test import TestCase

from saxo.models import SyncRun

from . import tasks
from .house import ParseResult
from .models import Member, Report


class SyncHouseTest(TestCase):
    def setUp(self):
        self.member = Member.objects.create(slug='nancy-pelosi', first_name='Nancy', last_name='Pelosi', state_district='CA11')

    def test_syncs_the_index_parses_and_rebuilds_touched_members(self):
        now = datetime(2026, 10, 15, 14, 0, tzinfo=tz.utc)
        with mock.patch.object(tasks.timezone, 'now', return_value=now), \
                mock.patch.object(tasks.house, 'sync_index', return_value=2) as sync_index, \
                mock.patch.object(tasks.house, 'parse_pending', return_value=ParseResult(1, 0, {self.member.pk})), \
                mock.patch.object(tasks.performance, 'rebuild') as rebuild:
            tasks.sync_house()
        self.assertEqual([call.args[0] for call in sync_index.call_args_list], [2026])
        rebuild.assert_called_once_with(self.member)
        run = SyncRun.objects.get(task='sync_house')
        self.assertEqual((run.outcome, run.rows), ('ok', 1))
        self.assertEqual(run.detail, '2 new reports, 0 failed to parse')

    def test_in_january_the_previous_year_is_checked_too(self):
        now = datetime(2027, 1, 5, 14, 0, tzinfo=tz.utc)
        with mock.patch.object(tasks.timezone, 'now', return_value=now), \
                mock.patch.object(tasks.house, 'sync_index', return_value=0) as sync_index, \
                mock.patch.object(tasks.house, 'parse_pending', return_value=ParseResult()):
            tasks.sync_house()
        self.assertEqual(sorted(call.args[0] for call in sync_index.call_args_list), [2026, 2027])

    def test_a_failed_index_download_is_recorded(self):
        with mock.patch.object(tasks.house, 'sync_index', side_effect=tasks.house.HouseError('down')):
            with self.assertRaises(tasks.house.HouseError):
                tasks.sync_house()
        self.assertEqual(SyncRun.objects.get(task='sync_house').outcome, 'failed')


class ReparseCommandTest(TestCase):
    def test_failed_reports_are_reset_and_parsed_again(self):
        member = Member.objects.create(slug='x', first_name='X', last_name='Y', state_district='CA01')
        report = Report.objects.create(doc_id='20000001', member=member, year=2026, filed_on=date(2026, 1, 2),
                                       status=Report.FAILED, attempts=3)
        with mock.patch('congress.management.commands.reparse_reports.house.parse_pending', return_value=ParseResult()), \
                mock.patch('congress.management.commands.reparse_reports.performance.rebuild'):
            call_command('reparse_reports', '--failed')
        report.refresh_from_db()
        self.assertEqual((report.status, report.attempts), (Report.PENDING, 0))
```

In `backend/core/test_scheduling.py` add:

```python
    def test_house_trades_sync_daily_after_the_washington_rebuild(self):
        sync_periodic_tasks()
        task = PeriodicTask.objects.get(name='Sync House trades')
        self.assertEqual(task.task, 'congress.tasks.sync_house')
        self.assertEqual((task.crontab.minute, task.crontab.hour), ('0', '14'))
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test congress.test_tasks core.test_scheduling`
Expected: FAIL (no `congress.tasks`, no schedule entry).

- [ ] **Step 3: Implement**

`backend/congress/tasks.py`:

```python
from celery import shared_task
from django.utils import timezone

from saxo.tasks import SyncReport, synced

from . import house, performance
from .models import Member

SYNC_TASK = 'sync_house'


@synced(reports_health=False, task=SYNC_TASK, needs_credential=False)
def _sync():
    now = timezone.now()
    years = {now.year} | ({now.year - 1} if now.month == 1 else set())
    created = sum(house.sync_index(year, now) for year in sorted(years))
    result = house.parse_pending()
    for member in Member.objects.filter(pk__in=result.member_ids):
        performance.rebuild(member)
    return SyncReport(rows=result.parsed, detail=f'{created} new reports, {result.failed} failed to parse')


@shared_task
def sync_house():
    return _sync()
```

`backend/congress/management/__init__.py`, `backend/congress/management/commands/__init__.py`: empty.

`backend/congress/management/commands/backfill_house.py`:

```python
from django.core.management.base import BaseCommand
from django.utils import timezone

from congress import house, performance


class Command(BaseCommand):
    help = 'Import every House PTR filed since a year, parse the e-filed ones and rebuild every member.'

    def add_arguments(self, parser):
        parser.add_argument('--since', type=int, default=2021)

    def handle(self, *args, **options):
        now = timezone.now()
        for year in range(options['since'], now.year + 1):
            created = house.sync_index(year, now)
            self.stdout.write(f'{year}: {created} new reports')
        result = house.parse_pending()
        self.stdout.write(f'parsed {result.parsed}, failed {result.failed}')
        self.stdout.write(f'measured {performance.rebuild_all()} members')
```

`backend/congress/management/commands/reparse_reports.py`:

```python
from django.core.management.base import BaseCommand, CommandError

from congress import house, performance
from congress.models import Member, Report


class Command(BaseCommand):
    help = 'Reset reports to pending and parse them again.'

    def add_arguments(self, parser):
        parser.add_argument('--doc-id')
        parser.add_argument('--failed', action='store_true')

    def handle(self, *args, **options):
        if options['doc_id']:
            reports = Report.objects.filter(doc_id=options['doc_id'])
        elif options['failed']:
            reports = Report.objects.filter(status=Report.FAILED)
        else:
            raise CommandError('Pass --doc-id ID or --failed.')
        reset = reports.exclude(status=Report.PAPER).update(status=Report.PENDING, attempts=0, error='')
        result = house.parse_pending()
        for member in Member.objects.filter(pk__in=result.member_ids):
            performance.rebuild(member)
        self.stdout.write(f'reset {reset}, parsed {result.parsed}, failed {result.failed}')
```

In `backend/core/scheduling.py` add to `PERIODIC_TASKS`:

```python
    'Sync House trades': {
        'task': 'congress.tasks.sync_house',
        'crontab': {'minute': '0', 'hour': '14'},
    },
```

`backend/core/migrations/0010_seed_house_sync.py`:

```python
from django.db import migrations


def seed(apps, schema_editor):
    from core.scheduling import sync_periodic_tasks
    sync_periodic_tasks(apps=apps)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_seed_copy_performance'),
    ]

    operations = [
        migrations.RunPython(seed, noop),
    ]
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python manage.py test congress core -v 1`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/congress/tasks.py backend/congress/test_tasks.py backend/congress/management backend/core/scheduling.py backend/core/test_scheduling.py backend/core/migrations/0010_seed_house_sync.py
git commit -m "feat(congress): daily sync_house task at 14:00 UTC, backfill and reparse commands"
```

---

### Task 8: API endpoints

**Files:**
- Create: `backend/congress/ownership.py`, `backend/congress/summaries.py`, `backend/congress/test_api.py`
- Modify: `backend/congress/views.py`, `backend/congress/urls.py`

**Interfaces:**
- Consumes: models, `performance.payload`, `investors.ownership.parse_tickers` / `BadTickers`.
- Produces (JSON shapes the frontend relies on):
  - `GET /api/congress/members/` → `{"members": [Card], "most_bought": [{"ticker", "buyers", "sellers"}], "window_days": 90}` where `Card = {slug, name, party, state_district, photo_url, trades, last_filed, excess_cagr_pct}`.
  - `GET /api/congress/members/<slug>/` → `{...Card, basis, holdings: [{ticker, value, weight_pct}], trades: [Trade], copy: performance.payload}` with `Trade = {asset, ticker, asset_type, owner, kind, option, exercise, traded_on, filed_on, amount_low, amount_high, priceable}`.
  - `GET /api/congress/ownership/?tickers=A,B` → `{"window_days": 90, "stocks": {TICKER: {holders, buyers, sellers} | null}}`.
  - `GET /api/congress/ownership/<ticker>/` → `{"window_days": 90, "ticker", "stock": {holders, buyers, sellers} | null, "members": [{slug, name, party, state_district, holds_weight_pct, trades: [Trade]}]}`.
  - URL names: `congress-members`, `congress-member`, `congress-ownership`, `congress-ownership-detail`.

- [ ] **Step 1: Write the failing tests**

`backend/congress/test_api.py`:

```python
from datetime import date, timedelta

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from .models import Holding, Member, Report, Trade

TODAY = date.today()


def trade(report, ticker, kind=Trade.PURCHASE, option='', priceable=True):
    return Trade.objects.create(
        report=report, owner='SP', asset=f'{ticker} Inc. ({ticker})', asset_type='OP' if option else 'ST', ticker=ticker,
        kind=kind, option=option, traded_on=report.filed_on - timedelta(days=5), amount_low=15001, amount_high=50000,
        priceable=priceable,
    )


class CongressApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        self.pelosi = Member.objects.create(slug='nancy-pelosi', first_name='Nancy', last_name='Pelosi',
                                            state_district='CA11', party='Democrat', basis={'trades': 2})
        self.crenshaw = Member.objects.create(slug='dan-crenshaw', first_name='Dan', last_name='Crenshaw',
                                              state_district='TX02', party='Republican')
        recent = Report.objects.create(doc_id='1', member=self.pelosi, year=TODAY.year, filed_on=TODAY - timedelta(days=10),
                                       status=Report.PARSED)
        old = Report.objects.create(doc_id='2', member=self.crenshaw, year=TODAY.year, filed_on=TODAY - timedelta(days=200),
                                    status=Report.PARSED)
        recent_sale = Report.objects.create(doc_id='3', member=self.crenshaw, year=TODAY.year,
                                            filed_on=TODAY - timedelta(days=20), status=Report.PARSED)
        trade(recent, 'NVDA', option=Trade.CALL)
        trade(recent, 'AAPL')
        trade(old, 'NVDA')
        trade(recent_sale, 'NVDA', kind=Trade.PARTIAL_SALE)
        Holding.objects.create(member=self.pelosi, ticker='NVDA', value=100.0, weight_pct=60.0)
        Holding.objects.create(member=self.pelosi, ticker='AAPL', value=66.7, weight_pct=40.0)

    def test_directory_lists_members_and_the_most_bought_tickers(self):
        body = self.client.get(reverse('congress-members')).json()
        self.assertEqual([card['slug'] for card in body['members']], ['dan-crenshaw', 'nancy-pelosi'])
        pelosi = body['members'][1]
        self.assertEqual((pelosi['party'], pelosi['trades'], pelosi['excess_cagr_pct']), ('Democrat', 2, None))
        self.assertEqual(body['most_bought'][0], {'ticker': 'AAPL', 'buyers': 1, 'sellers': 0})

    def test_member_profile(self):
        body = self.client.get(reverse('congress-member', args=['nancy-pelosi'])).json()
        self.assertEqual([held['ticker'] for held in body['holdings']], ['NVDA', 'AAPL'])
        self.assertEqual(len(body['trades']), 2)
        self.assertEqual(body['trades'][0]['amount_low'], 15001)
        self.assertEqual(body['basis'], {'trades': 2})
        self.assertFalse(body['copy']['available'])

    def test_unknown_member_is_404(self):
        self.assertEqual(self.client.get(reverse('congress-member', args=['nobody'])).status_code, 404)

    def test_ownership_summary_counts_holders_and_recent_buyers_and_sellers(self):
        body = self.client.get(reverse('congress-ownership'), {'tickers': 'NVDA,ASML'}).json()
        self.assertEqual(body['window_days'], 90)
        self.assertEqual(body['stocks']['NVDA'], {'holders': 1, 'buyers': 1, 'sellers': 1})
        self.assertIsNone(body['stocks']['ASML'])

    def test_ownership_summary_refuses_bad_tickers(self):
        self.assertEqual(self.client.get(reverse('congress-ownership'), {'tickers': ''}).status_code, 400)

    def test_ownership_detail_lists_members_and_their_trades(self):
        body = self.client.get(reverse('congress-ownership-detail', args=['nvda'])).json()
        self.assertEqual(body['ticker'], 'NVDA')
        self.assertEqual([member['slug'] for member in body['members']], ['nancy-pelosi', 'dan-crenshaw'])
        self.assertEqual(body['members'][0]['holds_weight_pct'], 60.0)
        self.assertEqual(len(body['members'][1]['trades']), 2)

    def test_ownership_detail_of_an_unknown_ticker_is_null(self):
        body = self.client.get(reverse('congress-ownership-detail', args=['ZZZZ'])).json()
        self.assertIsNone(body['stock'])
        self.assertEqual(body['members'], [])
```

Before writing views, open `backend/investors/ownership.py:8-20` and confirm `parse_tickers(raw)` returns a list of upper-cased tickers and raises `BadTickers` on empty / too many; reuse it.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python manage.py test congress.test_api`
Expected: FAIL (URL names not found).

- [ ] **Step 3: Implement**

`backend/congress/summaries.py`:

```python
from django.db.models import Count, Max

from investors.copying import edge

from . import performance
from .models import CopyPerformance, Report, Trade


def trade_row(trade):
    return {
        'asset': trade.asset, 'ticker': trade.ticker, 'asset_type': trade.asset_type, 'owner': trade.owner,
        'kind': trade.kind, 'option': trade.option, 'exercise': trade.exercise,
        'traded_on': trade.traded_on.isoformat(), 'filed_on': trade.report.filed_on.isoformat(),
        'amount_low': trade.amount_low, 'amount_high': trade.amount_high, 'priceable': trade.priceable,
    }


def _edges(member_ids):
    rows = CopyPerformance.objects.filter(member_id__in=member_ids).values_list(
        'member_id', 'clone_cagr_pct', 'benchmark_cagr_pct',
    )
    return {member_id: edge(ours, market) for member_id, ours, market in rows}


def cards(members):
    ids = [member.pk for member in members]
    trade_counts = dict(
        Trade.objects.filter(report__status=Report.PARSED, report__member_id__in=ids)
        .values('report__member').annotate(total=Count('id')).values_list('report__member', 'total')
    )
    last_filed = dict(
        Report.objects.filter(member_id__in=ids).values('member').annotate(last=Max('filed_on')).values_list('member', 'last')
    )
    edges = _edges(ids)
    return [card(member, trade_counts.get(member.pk, 0), last_filed.get(member.pk), edges.get(member.pk)) for member in members]


def card(member, trades, last_filed, excess_cagr_pct):
    return {
        'slug': member.slug,
        'name': f'{member.first_name} {member.last_name}',
        'party': member.party,
        'state_district': member.state_district,
        'photo_url': member.photo_url,
        'trades': trades,
        'last_filed': last_filed.isoformat() if last_filed else None,
        'excess_cagr_pct': excess_cagr_pct,
    }


def profile(member):
    trades = Trade.objects.filter(report__member=member, report__status=Report.PARSED).select_related('report').order_by('-report__filed_on', '-traded_on')
    summary = cards([member])[0]
    return {
        **summary,
        'basis': member.basis,
        'holdings': [
            {'ticker': held.ticker, 'value': held.value, 'weight_pct': held.weight_pct} for held in member.holdings.all()
        ],
        'trades': [trade_row(trade) for trade in trades],
        'copy': performance.payload(member),
    }
```

`backend/congress/ownership.py`:

```python
from collections import Counter
from datetime import timedelta

from .models import Holding, Member, Report, Trade
from .summaries import trade_row

WINDOW_DAYS = 90
MOST_BOUGHT = 10
BUYS = {Trade.PURCHASE}
SELLS = {Trade.SALE, Trade.PARTIAL_SALE}


def _recent(today, tickers=None):
    trades = Trade.objects.filter(
        report__status=Report.PARSED, report__filed_on__gte=today - timedelta(days=WINDOW_DAYS), priceable=True,
    ).exclude(option=Trade.PUT)
    if tickers is not None:
        trades = trades.filter(ticker__in=tickers)
    return trades.values_list('ticker', 'kind', 'report__member')


def _counts(tickers, today):
    holders = Counter(Holding.objects.filter(ticker__in=tickers).values_list('ticker', flat=True))
    buyers, sellers = {}, {}
    for ticker, kind, member_id in _recent(today, tickers):
        if kind in BUYS:
            buyers.setdefault(ticker, set()).add(member_id)
        elif kind in SELLS:
            sellers.setdefault(ticker, set()).add(member_id)
    known = set(Trade.objects.filter(ticker__in=tickers).values_list('ticker', flat=True)) | set(holders)
    return {
        ticker: (
            {'holders': holders.get(ticker, 0), 'buyers': len(buyers.get(ticker, ())), 'sellers': len(sellers.get(ticker, ()))}
            if ticker in known else None
        )
        for ticker in tickers
    }


def summary(tickers, today):
    return {'window_days': WINDOW_DAYS, 'stocks': _counts(tickers, today)}


def most_bought(today):
    buyers, sellers = {}, {}
    for ticker, kind, member_id in _recent(today):
        target = buyers if kind in BUYS else sellers if kind in SELLS else None
        if target is not None:
            target.setdefault(ticker, set()).add(member_id)
    ranked = sorted(buyers, key=lambda ticker: (-len(buyers[ticker]), ticker))[:MOST_BOUGHT]
    return [{'ticker': ticker, 'buyers': len(buyers[ticker]), 'sellers': len(sellers.get(ticker, ()))} for ticker in ranked]


def detail(ticker, today):
    stock = _counts([ticker], today)[ticker]
    weights = dict(Holding.objects.filter(ticker=ticker).values_list('member_id', 'weight_pct'))
    trades = Trade.objects.filter(ticker=ticker, report__status=Report.PARSED).select_related('report', 'report__member') \
        .order_by('-report__filed_on', '-traded_on')
    by_member = {}
    for trade in trades:
        by_member.setdefault(trade.report.member_id, []).append(trade)
    members = Member.objects.filter(pk__in=set(by_member) | set(weights))
    ordered = sorted(members, key=lambda member: (-(weights.get(member.pk) or 0), member.last_name))
    return {
        'window_days': WINDOW_DAYS,
        'ticker': ticker,
        'stock': stock,
        'members': [
            {
                'slug': member.slug, 'name': f'{member.first_name} {member.last_name}', 'party': member.party,
                'state_district': member.state_district, 'holds_weight_pct': weights.get(member.pk),
                'trades': [trade_row(trade) for trade in by_member.get(member.pk, [])],
            }
            for member in ordered
        ],
    }
```

`backend/congress/views.py`:

```python
from datetime import date

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from investors.ownership import BadTickers, parse_tickers

from . import ownership, summaries
from .models import Member


class MemberListView(APIView):
    def get(self, request):
        today = date.today()
        return Response({
            'members': summaries.cards(list(Member.objects.all())),
            'most_bought': ownership.most_bought(today),
            'window_days': ownership.WINDOW_DAYS,
        })


class MemberDetailView(APIView):
    def get(self, request, slug):
        return Response(summaries.profile(get_object_or_404(Member, slug=slug)))


class OwnershipSummaryView(APIView):
    def get(self, request):
        try:
            tickers = parse_tickers(request.query_params.get('tickers', ''))
        except BadTickers as exc:
            raise ValidationError(str(exc))
        return Response(ownership.summary(tickers, date.today()))


class OwnershipDetailView(APIView):
    def get(self, request, ticker):
        return Response(ownership.detail(ticker.upper(), date.today()))
```

`backend/congress/urls.py`:

```python
from django.urls import path

from .views import MemberDetailView, MemberListView, OwnershipDetailView, OwnershipSummaryView

urlpatterns = [
    path('members/', MemberListView.as_view(), name='congress-members'),
    path('members/<slug:slug>/', MemberDetailView.as_view(), name='congress-member'),
    path('ownership/', OwnershipSummaryView.as_view(), name='congress-ownership'),
    path('ownership/<str:ticker>/', OwnershipDetailView.as_view(), name='congress-ownership-detail'),
]
```

- [ ] **Step 4: Run tests**

Run: `cd backend && python manage.py test congress -v 1`
Expected: all PASS. The directory test expects alphabetical order by last name (Member `Meta.ordering`), most-bought `AAPL` before `NVDA` because NVDA has 1 buyer too: ranking is by buyer count, then ticker; adjust only if the test's expectation is wrong against the stated rule.

- [ ] **Step 5: Commit**

```bash
git add backend/congress/ownership.py backend/congress/summaries.py backend/congress/views.py backend/congress/urls.py backend/congress/test_api.py
git commit -m "feat(congress): members, member, and ownership endpoints under /api/congress"
```

---

### Task 9: Frontend API layer and helpers

**Files:**
- Create: `frontend/src/api/client/congress.js`, `frontend/src/api/queries/congress.js`, `frontend/src/lib/congress.js`, `frontend/src/lib/congress.test.js`
- Modify: `frontend/src/api/client/index.js`, `frontend/src/api/queries/index.js`

**Interfaces:**
- Produces:
  - client: `getCongressMembers()`, `getCongressMember(slug)`, `getCongressOwnershipSummary(tickers)`, `getCongressOwnership(ticker)`.
  - hooks: `useCongressMembers()`, `useCongressMember(slug)`, `useCongressOwnershipSummary(tickers)`, `useCongressOwnership(ticker)`.
  - lib: `partyLabel(party, stateDistrict) -> 'D-CA11'`, `fmtRange(low, high) -> '$15,001–$50,000' | 'Over $50,000,000'`, `tradeLabel(trade) -> 'Bought' | 'Sold' | 'Sold part' | 'Exchanged'` plus `' (call)'`/`' (put)'`/`' (exercise)'`, `basisNote(basis) -> string`, `activity(stock) -> {buyers, sellers} | null`, `activityLabel(stock, windowDays) -> string`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/congress.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { activity, activityLabel, basisNote, fmtRange, partyLabel, tradeLabel } from './congress'

describe('partyLabel', () => {
  it('abbreviates the party and keeps the district', () => {
    expect(partyLabel('Democrat', 'CA11')).toBe('D-CA11')
    expect(partyLabel('Republican', 'TX02')).toBe('R-TX02')
  })
  it('falls back to the district alone when the party is unknown', () => {
    expect(partyLabel('', 'ZZ01')).toBe('ZZ01')
  })
})

describe('fmtRange', () => {
  it('formats a closed and an open range', () => {
    expect(fmtRange(15001, 50000)).toBe('$15,001–$50,000')
    expect(fmtRange(50000000, null)).toBe('Over $50,000,000')
  })
})

describe('tradeLabel', () => {
  it('names the kind and the option', () => {
    expect(tradeLabel({ kind: 'purchase', option: 'call', exercise: false })).toBe('Bought (call)')
    expect(tradeLabel({ kind: 'partial_sale', option: '', exercise: false })).toBe('Sold part')
    expect(tradeLabel({ kind: 'purchase', option: '', exercise: true })).toBe('Bought (exercise)')
  })
})

describe('basisNote', () => {
  it('lists only the caveats that apply', () => {
    expect(basisNote({ trades: 40, paper_reports: 2, failed_reports: 0, unparsed_rows: 0, unseen_sales: 3, unpriced: 0, since: '2021-01-01' }))
      .toBe('Estimated from 40 disclosed trades since 2021 at the midpoint of each reported range · 2 paper reports not included · 3 sales of holdings bought before 2021 ignored')
  })
  it('says nothing is known yet for an empty basis', () => {
    expect(basisNote({})).toBe('No parsed trades yet.')
  })
})

describe('activity', () => {
  it('is null for an unknown ticker and for no recent trades', () => {
    expect(activity(null)).toBeNull()
    expect(activity({ holders: 2, buyers: 0, sellers: 0 })).toBeNull()
  })
  it('reports buyers and sellers', () => {
    expect(activity({ holders: 1, buyers: 3, sellers: 1 })).toEqual({ buyers: 3, sellers: 1 })
    expect(activityLabel({ holders: 1, buyers: 3, sellers: 1 }, 90)).toBe('3 members of Congress bought and 1 sold in reports filed in the last 90 days · 1 holds it (estimated)')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/lib/congress.test.js`
Expected: FAIL, cannot resolve `./congress`.

- [ ] **Step 3: Implement**

`frontend/src/lib/congress.js`:

```js
import { fmtNum } from './format'

const PARTY = { Democrat: 'D', Republican: 'R', Independent: 'I' }
const KIND = { purchase: 'Bought', sale: 'Sold', partial_sale: 'Sold part', exchange: 'Exchanged' }

const dollars = (value) => `$${fmtNum(value)}`
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

export function partyLabel(party, stateDistrict) {
  const letter = PARTY[party] ?? (party ? party[0] : '')
  return letter ? `${letter}-${stateDistrict}` : stateDistrict
}

export function fmtRange(low, high) {
  return high == null ? `Over ${dollars(low)}` : `${dollars(low)}–${dollars(high)}`
}

export function tradeLabel({ kind, option, exercise }) {
  const base = KIND[kind] ?? kind
  if (exercise) return `${base} (exercise)`
  return option ? `${base} (${option})` : base
}

export function basisNote(basis = {}) {
  if (!basis.trades) return 'No parsed trades yet.'
  const year = (basis.since ?? '2021').slice(0, 4)
  const parts = [`Estimated from ${plural(basis.trades, 'disclosed trade', 'disclosed trades')} since ${year} at the midpoint of each reported range`]
  if (basis.paper_reports) parts.push(`${plural(basis.paper_reports, 'paper report', 'paper reports')} not included`)
  if (basis.failed_reports) parts.push(`${plural(basis.failed_reports, 'report', 'reports')} could not be read`)
  if (basis.unparsed_rows) parts.push(`${plural(basis.unparsed_rows, 'row', 'rows')} could not be read`)
  if (basis.unseen_sales) parts.push(`${plural(basis.unseen_sales, 'sale', 'sales')} of holdings bought before ${year} ignored`)
  if (basis.unpriced) parts.push(`${plural(basis.unpriced, 'trade', 'trades')} without a price left out`)
  return parts.join(' · ')
}

export function activity(stock) {
  if (!stock || (!stock.buyers && !stock.sellers)) return null
  return { buyers: stock.buyers, sellers: stock.sellers }
}

export function activityLabel(stock, windowDays) {
  const traded = `${stock.buyers} ${stock.buyers === 1 ? 'member' : 'members'} of Congress bought and ${stock.sellers} sold in reports filed in the last ${windowDays} days`
  return stock.holders ? `${traded} · ${stock.holders} ${stock.holders === 1 ? 'holds' : 'hold'} it (estimated)` : traded
}
```

`frontend/src/api/client/congress.js`:

```js
import { apiFetch } from './http'

export const getCongressMembers = () => apiFetch('/api/congress/members/')

export const getCongressMember = (slug) => apiFetch(`/api/congress/members/${encodeURIComponent(slug)}/`)

export const getCongressOwnershipSummary = (tickers) =>
  apiFetch(`/api/congress/ownership/?${new URLSearchParams({ tickers: tickers.join(',') }).toString()}`)

export const getCongressOwnership = (ticker) => apiFetch(`/api/congress/ownership/${encodeURIComponent(ticker)}/`)
```

`frontend/src/api/queries/congress.js`:

```js
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { getCongressMember, getCongressMembers, getCongressOwnership, getCongressOwnershipSummary } from '../client'

export const congressKeys = {
  members: ['congress-members'],
  member: (slug) => ['congress-member', slug],
  ownershipSummary: (tickers) => ['congress-ownership', 'summary', tickers.join(',')],
  ownership: (ticker) => ['congress-ownership', 'detail', ticker],
}

export function useCongressMembers() {
  return useQuery({ queryKey: congressKeys.members, queryFn: getCongressMembers })
}

export function useCongressMember(slug) {
  return useQuery({ queryKey: congressKeys.member(slug), queryFn: () => getCongressMember(slug), enabled: Boolean(slug) })
}

export function useCongressOwnershipSummary(tickers) {
  return useQuery({
    queryKey: congressKeys.ownershipSummary(tickers),
    queryFn: () => getCongressOwnershipSummary(tickers),
    enabled: tickers.length > 0,
    placeholderData: keepPreviousData,
  })
}

export function useCongressOwnership(ticker) {
  return useQuery({ queryKey: congressKeys.ownership(ticker), queryFn: () => getCongressOwnership(ticker), enabled: Boolean(ticker) })
}
```

Add `export * from './congress'` at the end of both `src/api/client/index.js` and `src/api/queries/index.js`.

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run src/lib/congress.test.js`
Expected: PASS. Check `fmtNum(15001)` renders `15,001`; if `fmtNum` has a different signature, read `src/lib/format.js` and use the integer formatter it exports.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api frontend/src/lib/congress.js frontend/src/lib/congress.test.js
git commit -m "feat(congress): frontend client, query hooks and label helpers"
```

---

### Task 10: Investors hub tab and member page

**Files:**
- Create: `frontend/src/components/congress/CongressDirectory.jsx`, `CongressDirectory.test.jsx`, `frontend/src/components/congress/TradeHistory.jsx`, `frontend/src/pages/CongressMember.jsx`, `frontend/src/pages/CongressMember.test.jsx`
- Modify: `frontend/src/pages/Investors.jsx`, `frontend/src/pages/Investors.test.jsx`, `frontend/src/components/investors/CopyPerformancePanel.jsx`, `frontend/src/App.jsx`

**Interfaces:**
- Consumes: hooks and lib from Task 9; `TabList`, `TabButton`, `Card`, `CardHeader`, `Th`, `Td`, `Tr`, `EmptyState`, `QueryState`, `MetricTile`, `Skeleton` from `components/ui`; `InvestorAvatar`.
- Produces: `CopyPerformanceView({ copy, name, subtitle })` exported from `CopyPerformancePanel.jsx` (default export `CopyPerformancePanel` keeps its behaviour for funds); route `investors/congress/:slug`.

- [ ] **Step 1: Split the copy panel (refactor, tests stay green)**

In `CopyPerformancePanel.jsx` move everything after the hook into a named export:

```jsx
export function CopyPerformanceView({ copy, name, subtitle }) {
  if (!copy) return null
  const title = `If you had copied ${name}`
  if (!copy.available) {
    return (
      <Card>
        <CardHeader
          title={title}
          subtitle="Not measured yet. Daily prices load overnight from Saxo; the comparison appears once they are in."
        />
      </Card>
    )
  }
  const rows = copySeries(copy.series)
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      {/* the existing Figures / chart / Legend / caveat markup, unchanged */}
    </Card>
  )
}

export default function CopyPerformancePanel({ slug, name }) {
  const { data: copy, isLoading } = useInvestorCopy(slug)
  if (isLoading) return <Skeleton className="h-64" />
  return (
    <CopyPerformanceView
      copy={copy}
      name={name}
      subtitle={copy?.available ? `Top ${copy.holdings} disclosed holdings, bought at the close of the first trading day after each filing and held until the next` : undefined}
    />
  )
}
```

Move the existing markup verbatim (the JSX comment above stands in for it in this plan only; the source carries no comments). Run `cd frontend && npx vitest run src/components/investors/CopyPerformancePanel.test.jsx` → PASS unchanged.

- [ ] **Step 2: Write the failing tests**

`frontend/src/components/congress/CongressDirectory.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import CongressDirectory from './CongressDirectory'

vi.mock('../../api/queries', () => ({
  useCongressMembers: () => ({
    isLoading: false,
    data: {
      window_days: 90,
      most_bought: [{ ticker: 'NVDA', buyers: 4, sellers: 1 }],
      members: [
        { slug: 'nancy-pelosi', name: 'Nancy Pelosi', party: 'Democrat', state_district: 'CA11', photo_url: '', trades: 40, last_filed: '2026-10-02', excess_cagr_pct: 12.3 },
        { slug: 'dan-crenshaw', name: 'Dan Crenshaw', party: 'Republican', state_district: 'TX02', photo_url: '', trades: 12, last_filed: '2026-09-01', excess_cagr_pct: null },
      ],
    },
  }),
}))

describe('CongressDirectory', () => {
  it('lists members with party, trades and copy edge, linking to their page', () => {
    renderWithProviders(<CongressDirectory />)
    const pelosi = screen.getByRole('link', { name: 'Nancy Pelosi' })
    expect(pelosi).toHaveAttribute('href', '/investors/congress/nancy-pelosi')
    expect(screen.getByText('D-CA11')).toBeInTheDocument()
    expect(screen.getByText('+12.3 pts')).toBeInTheDocument()
  })

  it('shows the most bought shelf with its window', () => {
    renderWithProviders(<CongressDirectory />)
    expect(screen.getByRole('heading', { name: 'Most bought by Congress, last 90 days' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /NVDA/ })).toHaveAttribute('href', '/research?symbol=NVDA&tab=congress')
  })
})
```

`frontend/src/pages/CongressMember.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { renderWithProviders } from '../test/renderWithProviders'
import CongressMember from './CongressMember'

vi.mock('../api/queries', () => ({
  useCongressMember: () => ({
    isLoading: false,
    data: {
      slug: 'nancy-pelosi', name: 'Nancy Pelosi', party: 'Democrat', state_district: 'CA11', photo_url: '', trades: 2,
      last_filed: '2026-10-02', excess_cagr_pct: null,
      basis: { trades: 2, paper_reports: 1, since: '2021-01-01' },
      holdings: [{ ticker: 'NVDA', value: 1000, weight_pct: 100 }],
      trades: [{ asset: 'NVIDIA Corporation (NVDA)', ticker: 'NVDA', asset_type: 'OP', owner: 'SP', kind: 'purchase', option: 'call', exercise: false,
        traded_on: '2025-01-14', filed_on: '2025-01-17', amount_low: 250001, amount_high: 500000, priceable: true }],
      copy: { available: false, benchmark: 'S&P 500', holdings: null },
    },
  }),
}))

function render() {
  return renderWithProviders(
    <Routes><Route path="/investors/congress/:slug" element={<CongressMember />} /></Routes>,
    { route: '/investors/congress/nancy-pelosi' },
  )
}

describe('CongressMember', () => {
  it('shows the member, the estimated basis and the holdings', () => {
    render()
    expect(screen.getByRole('heading', { level: 1, name: 'Nancy Pelosi' })).toBeInTheDocument()
    expect(screen.getByText(/Estimated from 2 disclosed trades since 2021/)).toBeInTheDocument()
    expect(screen.getByText(/1 paper report not included/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'NVDA' })).toHaveAttribute('href', '/research?symbol=NVDA&tab=congress')
  })

  it('lists trades with owner, label and range', () => {
    render()
    expect(screen.getByText('Bought (call)')).toBeInTheDocument()
    expect(screen.getByText('$250,001–$500,000')).toBeInTheDocument()
    expect(screen.getByText('Spouse')).toBeInTheDocument()
  })
})
```

Check `renderWithProviders`'s signature in `src/test/renderWithProviders.jsx` first; if it takes the initial route differently (e.g. `{ initialEntries }`), use that.

In `frontend/src/pages/Investors.test.jsx` add a test (keeping existing ones) that clicking the "Congress" tab sets `?tab=congress` and renders the Congress directory; mock `useCongressMembers` in the existing `vi.mock('../api/queries', …)` factory with an empty `{ members: [], most_bought: [], window_days: 90 }`.

- [ ] **Step 3: Run to verify failure**

Run: `cd frontend && npx vitest run src/components/congress src/pages/CongressMember.test.jsx src/pages/Investors.test.jsx`
Expected: FAIL, missing modules / tab.

- [ ] **Step 4: Implement**

`frontend/src/components/congress/CongressDirectory.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { useCongressMembers } from '../../api/queries'
import { partyLabel } from '../../lib/congress'
import { fmtDate, fmtNum, fmtPct } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { Card, CardHeader, EmptyState, QueryState, Td, Th, Tr } from '../ui'
import InvestorAvatar from '../investors/InvestorAvatar'

const points = (value) => (value == null ? '—' : `${fmtPct(value, { decimals: 1 }).replace('%', '')} pts`)

function MostBought({ items, windowDays }) {
  if (items.length === 0) return null
  return (
    <Card>
      <CardHeader title={`Most bought by Congress, last ${windowDays} days`} subtitle="Distinct members with a purchase or call in reports filed in the window" />
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.ticker}>
            <Link to={researchHref(item.ticker, 'congress')} className="inline-flex items-baseline gap-2 rounded-md border border-white/[0.06] px-2.5 py-1.5 hover:border-blue-400/40">
              <span className="font-mono text-zinc-100">{item.ticker}</span>
              <span className="num text-[var(--fig-xs)] text-zinc-400">{`${item.buyers} ↑ / ${item.sellers} ↓`}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default function CongressDirectory() {
  const query = useCongressMembers()
  if (query.isLoading || query.error) {
    return <QueryState isLoading={query.isLoading} error={query.error} onRetry={query.refetch} label="members of Congress" />
  }
  const { members = [], most_bought: mostBought = [], window_days: windowDays = 90 } = query.data ?? {}
  if (members.length === 0) {
    return <EmptyState title="No House trades imported yet" hint="They load daily from the House Clerk; run backfill_house once to import history." />
  }
  return (
    <div className="flex flex-col gap-6">
      <MostBought items={mostBought} windowDays={windowDays} />
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[var(--fig-sm)]">
            <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
              <tr>
                <Th edge>Member</Th>
                <Th>Party</Th>
                <Th align="right">Trades</Th>
                <Th align="right">Last filed</Th>
                <Th edge align="right">Copy edge / yr</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <Tr key={member.slug}>
                  <Td edge>
                    <span className="flex items-center gap-2.5">
                      <InvestorAvatar name={member.name} size={24} />
                      <Link to={`/investors/congress/${member.slug}`} className="font-medium text-zinc-100 hover:text-blue-300">{member.name}</Link>
                    </span>
                  </Td>
                  <Td className="text-zinc-400">{partyLabel(member.party, member.state_district)}</Td>
                  <Td align="right" className="num text-zinc-300">{fmtNum(member.trades)}</Td>
                  <Td align="right" className="num text-zinc-400">{member.last_filed ? fmtDate(member.last_filed) : '—'}</Td>
                  <Td edge align="right" className="num text-zinc-200">{points(member.excess_cagr_pct)}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
```

`frontend/src/components/congress/TradeHistory.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { fmtRange, tradeLabel } from '../../lib/congress'
import { fmtDate } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { Card, CardHeader, Td, Th, Tr } from '../ui'

const OWNERS = { self: 'Member', SP: 'Spouse', JT: 'Joint', DC: 'Child' }

export default function TradeHistory({ trades }) {
  return (
    <Card padding={false}>
      <div className="p-4 pb-3">
        <CardHeader title="Disclosed trades" subtitle="As filed with the House Clerk. Amounts are the reported range." />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[var(--fig-sm)]">
          <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
            <tr>
              <Th edge>Asset</Th>
              <Th>Trade</Th>
              <Th>Owner</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Traded</Th>
              <Th edge align="right">Filed</Th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, index) => (
              <Tr key={`${trade.filed_on}-${trade.traded_on}-${trade.asset}-${index}`}>
                <Td edge>
                  {trade.ticker && trade.priceable ? (
                    <Link to={researchHref(trade.ticker, 'congress')} className="font-mono text-zinc-100 hover:text-blue-300">{trade.ticker}</Link>
                  ) : (
                    <span className="text-zinc-400">{trade.asset}</span>
                  )}
                </Td>
                <Td className="text-zinc-300">{tradeLabel(trade)}</Td>
                <Td className="text-zinc-400">{OWNERS[trade.owner] ?? trade.owner}</Td>
                <Td align="right" className="num text-zinc-300">{fmtRange(trade.amount_low, trade.amount_high)}</Td>
                <Td align="right" className="num text-zinc-400">{fmtDate(trade.traded_on)}</Td>
                <Td edge align="right" className="num text-zinc-400">{fmtDate(trade.filed_on)}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
```

`frontend/src/pages/CongressMember.jsx`:

```jsx
import { Link, useParams } from 'react-router-dom'

import { useCongressMember } from '../api/queries'
import { Card, CardHeader, EmptyState, PageHeader, QueryState, Td, Th, Tr } from '../components/ui'
import { CopyPerformanceView } from '../components/investors/CopyPerformancePanel'
import TradeHistory from '../components/congress/TradeHistory'
import { basisNote, partyLabel } from '../lib/congress'
import { fmtPct } from '../lib/format'
import { researchHref } from '../lib/research'

const COPY_SUBTITLE = 'Estimated holdings after each report, bought at the close of the first trading day after it was filed and held until the next. Calls count as the stock, which understates their leverage.'

function Holdings({ holdings }) {
  if (holdings.length === 0) return <EmptyState title="No estimated holdings" hint="Nothing priceable has been bought since 2021." />
  return (
    <Card padding={false}>
      <div className="p-4 pb-3"><CardHeader title="Estimated holdings" subtitle="From disclosed trades since 2021" /></div>
      <table className="w-full text-[var(--fig-sm)]">
        <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
          <tr><Th edge>Ticker</Th><Th edge align="right">Weight</Th></tr>
        </thead>
        <tbody>
          {holdings.map((held) => (
            <Tr key={held.ticker}>
              <Td edge><Link to={researchHref(held.ticker, 'congress')} className="font-mono text-zinc-100 hover:text-blue-300">{held.ticker}</Link></Td>
              <Td edge align="right" className="num text-zinc-300">{fmtPct(held.weight_pct, { sign: false, decimals: 1 })}</Td>
            </Tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export default function CongressMember() {
  const { slug } = useParams()
  const query = useCongressMember(slug)
  if (query.isLoading || query.error) {
    return <QueryState isLoading={query.isLoading} error={query.error} onRetry={query.refetch} label="this member" />
  }
  const member = query.data
  return (
    <div className="flex flex-col gap-6">
      <Link to="/investors?tab=congress" className="inline-block text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">← Congress</Link>
      <PageHeader title={member.name} subtitle={`House · ${partyLabel(member.party, member.state_district)}`} />
      <p className="text-[var(--fig-xs)] text-zinc-500 max-w-[80ch]">{basisNote(member.basis)}</p>
      <CopyPerformanceView copy={member.copy} name={member.name} subtitle={COPY_SUBTITLE} />
      <Holdings holdings={member.holdings} />
      <TradeHistory trades={member.trades} />
    </div>
  )
}
```

`frontend/src/pages/Investors.jsx` — wrap the existing body in tabs:

```jsx
import { useSearchParams } from 'react-router-dom'
import { TabButton, TabList } from '../components/ui'
import CongressDirectory from '../components/congress/CongressDirectory'

const TABS = [['funds', 'Funds'], ['congress', 'Congress']]
```

Inside `Investors()`:

```jsx
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'congress' ? 'congress' : 'funds'
  const pick = (key) => setParams(key === 'funds' ? {} : { tab: key }, { replace: true })
```

Render `<TabList label="Investor type">{TABS.map(([key, label]) => <TabButton key={key} active={tab === key} onClick={() => pick(key)}>{label}</TabButton>)}</TabList>` under the `PageHeader`; when `tab === 'congress'` render `<CongressDirectory />` instead of shelves + directory + `LimitsNote`, and hide the "Add investor" button (pass `right={tab === 'funds' ? <Button …/> : null}`). Check `TabList`/`TabButton` props in `components/ui.jsx:289-336` and follow them exactly.

`frontend/src/App.jsx` — import `CongressMember` and add, before the `investors/:slug` route:

```jsx
          <Route path='investors/congress/:slug' element={<CongressMember />} />
```

- [ ] **Step 5: Run tests**

Run: `cd frontend && npx vitest run src/components/congress src/pages/CongressMember.test.jsx src/pages/Investors.test.jsx src/components/investors`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/congress frontend/src/pages/CongressMember.jsx frontend/src/pages/CongressMember.test.jsx frontend/src/pages/Investors.jsx frontend/src/pages/Investors.test.jsx frontend/src/components/investors/CopyPerformancePanel.jsx frontend/src/App.jsx
git commit -m "feat(congress): Congress tab on the Investors hub and a member page with copy performance and trades"
```

---

### Task 11: Portfolio column, Research tab, stocks column

**Files:**
- Create: `frontend/src/components/congress/CongressActivity.jsx`, `CongressActivity.test.jsx`, `frontend/src/components/research/CongressTab.jsx`, `CongressTab.test.jsx`
- Modify: `frontend/src/pages/Portfolio.jsx` (header ~159-161, cells ~210-215, total row ~229-230), `frontend/src/pages/Research.jsx` (TABS ~34, render ~235), `frontend/src/pages/InvestorStocks.jsx`

**Interfaces:**
- Consumes: `useCongressOwnershipSummary`, `useCongressOwnership`, `activity`, `activityLabel`, `tradeLabel`, `fmtRange`, `partyLabel`, `ownershipTicker`, `ownershipTickers`, `researchHref`.
- Produces: `CongressActivity({ ticker, stock, windowDays })` cell component.

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/congress/CongressActivity.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import CongressActivity from './CongressActivity'

describe('CongressActivity', () => {
  it('shows buyers and sellers and links to the Research Congress tab', () => {
    renderWithProviders(<CongressActivity ticker="NVDA" stock={{ holders: 2, buyers: 3, sellers: 1 }} windowDays={90} />)
    const link = screen.getByRole('link', { name: /3 members of Congress bought and 1 sold/ })
    expect(link).toHaveAttribute('href', '/research?symbol=NVDA&tab=congress')
    expect(link).toHaveTextContent('3 ↑ / 1 ↓')
  })

  it('shows a dash for an unknown ticker or no recent trades', () => {
    const { rerender } = renderWithProviders(<CongressActivity ticker="ASML" stock={null} windowDays={90} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    rerender(<CongressActivity ticker="AAPL" stock={{ holders: 1, buyers: 0, sellers: 0 }} windowDays={90} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
```

`frontend/src/components/research/CongressTab.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import CongressTab from './CongressTab'

const ownership = vi.fn()
vi.mock('../../api/queries', () => ({ useCongressOwnership: (ticker) => ownership(ticker) }))

describe('CongressTab', () => {
  it('refuses a non-USD listing without asking', () => {
    ownership.mockReturnValue({ isLoading: false })
    renderWithProviders(<CongressTab symbol="ASML" currency="EUR" />)
    expect(screen.getByText('No House data for ASML')).toBeInTheDocument()
    expect(ownership).toHaveBeenLastCalledWith(null)
  })

  it('lists members and their trades', () => {
    ownership.mockReturnValue({
      isLoading: false,
      data: {
        window_days: 90, ticker: 'NVDA', stock: { holders: 1, buyers: 1, sellers: 0 },
        members: [{ slug: 'nancy-pelosi', name: 'Nancy Pelosi', party: 'Democrat', state_district: 'CA11', holds_weight_pct: 60,
          trades: [{ asset: 'NVIDIA', ticker: 'NVDA', asset_type: 'OP', owner: 'SP', kind: 'purchase', option: 'call', exercise: false,
            traded_on: '2025-01-14', filed_on: '2025-01-17', amount_low: 250001, amount_high: 500000, priceable: true }] }],
      },
    })
    renderWithProviders(<CongressTab symbol="NVDA" currency="USD" />)
    expect(screen.getByRole('link', { name: 'Nancy Pelosi' })).toHaveAttribute('href', '/investors/congress/nancy-pelosi')
    expect(screen.getByText('Bought (call)')).toBeInTheDocument()
    expect(screen.getByText('$250,001–$500,000')).toBeInTheDocument()
  })

  it('says when no member has traded the stock', () => {
    ownership.mockReturnValue({ isLoading: false, data: { window_days: 90, ticker: 'ZZZZ', stock: null, members: [] } })
    renderWithProviders(<CongressTab symbol="ZZZZ" currency="USD" />)
    expect(screen.getByText('No House member has disclosed a ZZZZ trade since 2021')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/components/congress/CongressActivity.test.jsx src/components/research/CongressTab.test.jsx`
Expected: FAIL, missing modules.

- [ ] **Step 3: Implement**

`frontend/src/components/congress/CongressActivity.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { activity, activityLabel } from '../../lib/congress'
import { researchHref } from '../../lib/research'

const LINK_CLASS = 'inline-flex items-baseline justify-end gap-1.5 num font-mono text-zinc-300 hover:text-blue-300'

export default function CongressActivity({ ticker, stock, windowDays }) {
  const traded = activity(stock)
  if (!traded) return <span className="text-zinc-600">—</span>
  const label = activityLabel(stock, windowDays)
  return (
    <Link to={researchHref(ticker, 'congress')} aria-label={label} title={label} className={LINK_CLASS}>
      {`${traded.buyers} ↑ / ${traded.sellers} ↓`}
    </Link>
  )
}
```

`frontend/src/components/research/CongressTab.jsx`:

```jsx
import { Link } from 'react-router-dom'

import { useCongressOwnership } from '../../api/queries'
import { fmtRange, partyLabel, tradeLabel } from '../../lib/congress'
import { fmtDate, fmtPct } from '../../lib/format'
import { ownershipTicker } from '../../lib/ownership'
import { Card, CardHeader, EmptyState, QueryState, StatRow, StatStrip, Td, Th, Tr } from '../ui'

const US_ONLY = 'House disclosures are matched by US ticker, so only US-dollar listings are looked up.'

export default function CongressTab({ symbol, currency }) {
  const ticker = ownershipTicker({ ticker: symbol, currency })
  const ownership = useCongressOwnership(ticker)

  if (!ticker) return <EmptyState title={`No House data for ${symbol}`} hint={US_ONLY} />
  if (ownership.isLoading || ownership.error) {
    return <QueryState isLoading={ownership.isLoading} error={ownership.error} onRetry={ownership.refetch} label="House trades" />
  }
  const { window_days: windowDays, stock, members = [] } = ownership.data ?? {}
  if (!stock || members.length === 0) {
    return <EmptyState title={`No House member has disclosed a ${symbol} trade since 2021`} />
  }
  return (
    <div className="space-y-3">
      <StatStrip>
        <StatRow label="Bought" value={String(stock.buyers)} note={`members, last ${windowDays} days`} lead />
        <StatRow label="Sold" value={String(stock.sellers)} note={`members, last ${windowDays} days`} />
        <StatRow label="Holding" value={String(stock.holders)} note="members (estimated)" />
      </StatStrip>
      {members.map((member) => (
        <Card key={member.slug} padding={false}>
          <div className="p-4 pb-3">
            <CardHeader
              title={<Link to={`/investors/congress/${member.slug}`} className="hover:text-blue-300">{member.name}</Link>}
              subtitle={`${partyLabel(member.party, member.state_district)}${member.holds_weight_pct != null ? ` · ${fmtPct(member.holds_weight_pct, { sign: false, decimals: 1 })} of estimated portfolio` : ''}`}
            />
          </div>
          <table className="w-full text-[var(--fig-sm)]">
            <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
              <tr><Th edge>Trade</Th><Th align="right">Amount</Th><Th align="right">Traded</Th><Th edge align="right">Filed</Th></tr>
            </thead>
            <tbody>
              {member.trades.map((trade, index) => (
                <Tr key={`${trade.filed_on}-${trade.traded_on}-${index}`}>
                  <Td edge className="text-zinc-300">{tradeLabel(trade)}</Td>
                  <Td align="right" className="num text-zinc-300">{fmtRange(trade.amount_low, trade.amount_high)}</Td>
                  <Td align="right" className="num text-zinc-400">{fmtDate(trade.traded_on)}</Td>
                  <Td edge align="right" className="num text-zinc-400">{fmtDate(trade.filed_on)}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  )
}
```

If `CardHeader`'s `title` must be a string (check `components/ui.jsx:31`), render the link as the card's first child instead and pass the name as `title`; the test only requires a link named after the member.

`frontend/src/pages/Research.jsx`: add `['congress', 'Congress'],` right after `['funds', 'Funds'],` in `TABS`, import `CongressTab`, and render `{shown('congress') ? <CongressTab symbol={symbol} currency={currency} /> : null}` after the Funds line.

`frontend/src/pages/Portfolio.jsx`:
- import `useCongressOwnershipSummary` from `../api/queries` and `CongressActivity` from `../components/congress/CongressActivity`;
- after `const ownership = useOwnershipSummary(fundTickers).data` add `const congress = useCongressOwnershipSummary(fundTickers).data`;
- add a header `<Th align="right" hideBelow="wide" className="sticky top-0 z-10 bg-zinc-900">Congress</Th>` after "Fund change";
- add a cell `<Td align="right" hideBelow="wide"><CongressActivity ticker={p.ticker} stock={congress?.stocks?.[ownershipTicker(p)]} windowDays={congress?.window_days} /></Td>` after the FundChange cell;
- add `<Td hideBelow="wide" />` to the total row after the two existing `hideBelow="wide"` cells.

`frontend/src/pages/InvestorStocks.jsx`: read how it renders rows; collect the visible tickers with `ownershipTickers`-equivalent (rows already carry `ticker`), call `useCongressOwnershipSummary(tickers)`, and add a right-aligned "Congress" column with `CongressActivity` per row, `hideBelow="md"`.

Add a Portfolio test case to `src/pages/Portfolio.test.jsx` (if it mocks `../api/queries`, add `useCongressOwnershipSummary: () => ({ data: { window_days: 90, stocks: { NVDA: { holders: 1, buyers: 2, sellers: 0 } } } })` to the mock and assert a link named `/2 members of Congress bought/`).

- [ ] **Step 4: Run the whole frontend suite, lint and build**

Run: `cd frontend && npx vitest run && npx eslint src && npm run build`
Expected: all tests PASS, no lint errors, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(congress): Congress column on Portfolio and Investor stocks, Congress tab on Research"
```

---

### Task 12: Dev database, backfill and docs

**Files:**
- Modify: `AGENTS.md` (append a "Decided" entry), `docs/running-the-stack.md` only if it lists periodic tasks.
- Create: `learning/learning-records/NNNN-house-ptr-text.md` (gitignored, not committed).

- [ ] **Step 1: Full backend suite**

Run: `cd backend && python manage.py test`
Expected: all PASS.

- [ ] **Step 2: Migrate the dev database**

Run: `cd backend && python manage.py migrate && python manage.py migrate --check`
Expected: `congress.0001_initial` and `core.0010_seed_house_sync` applied; `--check` exits 0. (The worktree shares the dev `db.sqlite3` only if `backend/.env` points at it; check `DATABASES` in settings before running, and run it in the checkout whose server you use.)

- [ ] **Step 3: Backfill and spot-check**

Run: `cd backend && python manage.py backfill_house --since 2021`
Expected: about 2,500 e-filed PDFs at 1 s each (~45 minutes); keep the Mac awake. Afterwards:

```bash
python manage.py shell -c "from django.db.models import Count; from congress.models import Report; print(list(Report.objects.values('status').annotate(n=Count('id'))))"
```

Expected: mostly `parsed`, `paper` around 12%, `failed` small. For each failed report, `python manage.py reparse_reports --doc-id <id>` after fixing the parser with a new fixture and test (Task 2 rules). Then check Pelosi's estimated holdings in the admin or at `/api/congress/members/nancy-pelosi/` against the trades on her latest reports.

Prices for newly wanted tickers arrive with the nightly `refresh_copy_performance` (01:30 UTC); after it runs, `python manage.py shell -c "from congress import performance; print(performance.rebuild_all())"` fills copy performance for every member.

- [ ] **Step 4: Record the decision in AGENTS.md**

Append to the "Decided" section:

```markdown
**House trades are parsed from the Clerk's PDFs, not bought.** `congress` downloads the House Clerk's
yearly index ZIP (ETag-conditional, daily at 14:00 UTC) and parses each e-filed PTR PDF with `pypdf`;
paper reports (DocID `8…`/`9…`) have no text and are counted, never downloaded. pypdf drops the bold
header letters, so "Filing Status: New" reads `F      S     : New`; rows wrap, page headers interrupt
rows and descriptions wrap — `congress/parse.py` handles all three and is pinned by real PDFs in
`congress/testdata`. A member's portfolio is an estimate: each trade is the midpoint of its range (an
open range its lower bound), calls count as the stock, an exercise replaces the call position, and a
sale of something never seen bought is ignored and counted. Those estimated holdings go through
`investors.copying.measure` unchanged. `congress` imports `investors`, never the reverse:
`price_feed.add_ticker_source` is how congress tickers get daily bars. The Senate's eFD site is
geo-blocked from where the app runs, so the Senate is out until the backend is hosted in the US.
```

- [ ] **Step 5: Learning record (not committed)**

Write `learning/learning-records/NNNN-house-ptr-text.md` (next free number) capturing: pypdf drops bold header glyphs; page headers and descriptions split rows; exercises double-count unless they replace the call book; Senate eFD geo-block confirmed in the user's own browser.

- [ ] **Step 6: Commit and open the PR**

```bash
git add AGENTS.md
git commit -m "docs: record how House trades are imported and estimated"
git push -u origin HEAD
gh pr create --title "Congress trades: House STOCK Act portfolios in Investors, Portfolio and Research" --body "Implements docs/superpowers/specs/2026-10-15-congress-trades-design.md per docs/superpowers/plans/2026-10-15-congress-trades.md."
```

Rename the branch first if it is still `docs/congress-trades-spec`: `git branch -m feat/congress-trades`.
