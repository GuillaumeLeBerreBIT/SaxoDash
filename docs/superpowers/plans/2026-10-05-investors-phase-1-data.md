# Famous investors — Phase 1 (Data) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `investors` Django app that imports 5 years of 13F filings for a curated list of fund managers from SEC EDGAR, resolves CUSIPs to tickers via OpenFIGI, keeps itself current on a schedule, and serves `/api/investors/` (cards) and `/api/investors/<slug>/` (one quarter's holdings) so the import can be inspected.

**Architecture:** Small call → shape → store modules (`edgar.py`, `parse.py`, `figi.py`, `importer.py`) write `Investor` / `Filing` / `Holding` / `Security` rows. Reads never touch the network: `quarters.py` turns stored filings into a quarter's effective holdings (applying amendments), `changes.py` owns the one quarter-over-quarter rule, `summaries.py` shapes API payloads, views stay thin. A Celery task under `@synced(reports_health=False)` refreshes every investor.

**Tech Stack:** Django 6 + DRF, `requests`, stdlib `xml.etree.ElementTree`, Celery + `django_celery_beat`, SQLite.

**Spec:** `docs/superpowers/specs/2026-10-04-famous-investors-design.md` — this plan is its **Build phase 1 (Data)**. Phases 2–4 get their own plans.

## Global Constraints

- Generated code carries **zero comments** (AGENTS.md "Code style"). Tests included.
- Backend tests are DRF/Django `TestCase` / `APITestCase`, one test file per module: `backend/investors/test_<module>.py`.
- Run tests with: `cd backend && .venv/bin/python manage.py test investors -v 2` (plus `saxo` / `core` where a task touches them).
- **A new migration isn't done until `manage.py migrate` has run against the dev database** (`cd backend && .venv/bin/python manage.py migrate`).
- SEC fair access: descriptive `User-Agent` with a contact email from the `SEC_USER_AGENT` setting; ≥ 0.12 s between EDGAR requests (≤ 10/s).
- OpenFIGI: keyless 25 requests/min and 10 jobs/request; with `OPENFIGI_API_KEY` 250 requests/min and 100 jobs/request. Take the `exchCode == 'US'` listing.
- History window: 5 years back from today.
- Holdings aggregate per (`filing`, `cusip`, `put_call`), shares and value summed.
- `RESTATEMENT` amendment replaces the quarter; `NEW HOLDINGS` adds its rows to the quarter.
- Change rule: **new** = key absent from the previous stored quarter; **added/trimmed** = shares moved ≥ 1 %; smaller = **unchanged**; **sold out** = present before, absent now; first stored quarter has no change.
- Stale = no 13F filed for over 2 quarters.
- API: JWT like every other endpoint (the DRF default `IsAuthenticated` — no override).
- Weights are **percent numbers** (`22.04`, not `0.2204`) — that is what `frontend/src/lib/format.js::fmtPct` formats.
- `Security` is a global cache; deleting an investor never deletes `Security` rows.
- Copy describes, never recommends (no scores or ranks) — applies to field names too.

### Corrections to the spec found while planning (verified live 2026-10-05)

1. **Value-unit cutoff is the filing date, not the quarter end.** Berkshire's Q4 2022 13F (filed 2023-02-14) totals `299,007,622,119` — already dollars — while Q3 2022 (filed 2022-11-14) totals `296,096,640` — thousands. The spec's `quarter_end < 2023-01-01 → ×1000` would inflate every Q4 2022 filing 1000×. Rule used here: **`filed_on < 2023-01-03` → value × 1000**. Task 3 corrects the spec line.
2. **The amendment type is not in the information table.** It is `amendmentInfo/amendmentType` in the filing's `primary_doc.xml`. So a filing costs 3 EDGAR requests (index, primary doc, table), not 2.
3. **`@synced` needs a Saxo credential today** and skips when Saxo is disconnected. EDGAR needs none. Task 1 adds `needs_credential=False`, and a `SyncReport(rows, detail)` return so skipped filings reach the `SyncRun` detail as the spec asks.
4. **The change key is (`cusip`, `put_call`)**, matching how holdings are stored, so a newly opened call on a stock already held reads as *new* rather than silently merging into the stock row.
5. The spec's `Filing` unique (`investor`, `quarter_end`, `accession`) is implied by `accession` being unique; both are kept as written.
6. **Turnover** (stats strip, History) has no formula in the spec and no Phase 1 consumer; it is defined in the Phase 2/3 plan.

## Review Focus

1. **Q4 2022 filings (filed 2023) must not be multiplied by 1000** — a wrong cutoff makes one quarter 1000× its neighbours and every change look like *added ▲ 99,900 %*. Pinned in Task 3 (`test_a_q4_2022_report_filed_in_2023_is_already_dollars`).
2. **A sync that hits EDGAR downtime halfway must keep what it already stored** — one transaction per filing, so filings imported before the failure survive and the next run resumes. Pinned in Task 8 (`test_an_edgar_failure_keeps_filings_already_stored`).
3. **An amended quarter must not double-count** — a `RESTATEMENT` after an original replaces it; a `NEW HOLDINGS` amendment for the same CUSIP adds to it. Pinned in Task 7 (`test_a_restatement_replaces_the_original`, `test_new_holdings_add_to_the_same_cusip`).
4. **OpenFIGI throttling must not fail the import** — holdings stay with `ticker = null` and are retried later, up to `Security.MAX_ATTEMPTS`. Pinned in Task 8 (`test_an_openfigi_failure_leaves_tickers_pending_without_failing`).
5. **Share-class tickers come back as `BRK/B` from OpenFIGI** but the user's positions and `research/universe.csv` spell it `BRK.B` — without normalising, Berkshire's own class B never matches "You own" or a sector. Pinned in Task 5 (`test_a_share_class_slash_becomes_a_dot`).

---

## File Structure

```
backend/
  backend/settings.py                 modify: INSTALLED_APPS += 'investors', SEC_USER_AGENT, OPENFIGI_API_KEY
  backend/urls.py                     modify: path('api/investors/', include('investors.urls'))
  saxo/tasks.py                       modify: synced(needs_credential=...), SyncReport
  saxo/test_tasks.py                  modify: tests for the above
  core/scheduling.py                  modify: crontab day_of_week/month_of_year, two investor entries
  core/test_scheduling.py             modify
  core/migrations/0008_seed_investor_sync.py   create
  investors/
    __init__.py  apps.py  admin.py    create
    models.py                         Investor, Filing, Holding, Security
    migrations/0001_initial.py        generated
    parse.py                          XML → row dicts, amendment type, aggregation
    edgar.py                          EDGAR HTTP: filings list, filing documents, pacing
    figi.py                           OpenFIGI CUSIP → ticker, batched + paced
    changes.py                        the one quarter-over-quarter rule
    quarters.py                       stored filings → a quarter's effective holdings
    importer.py                       sync_investor, backfill, resolve_securities
    curated.py  curated.csv           curated list loader
    sectors.py                        ticker → sector from research/universe.csv
    summaries.py                      API payload shaping
    views.py  urls.py
    tasks.py                          sync_investors
    factories.py                      test builders (not named test_* so the runner skips it)
    management/__init__.py
    management/commands/__init__.py
    management/commands/load_investors.py
    management/commands/backfill_investors.py
    testdata/                         recorded + hand-made 13F XML
    test_models.py test_parse.py test_edgar.py test_figi.py test_changes.py
    test_quarters.py test_importer.py test_curated.py test_tasks.py
    test_list_api.py test_detail_api.py
```

---

### Task 1: `@synced` can run without a Saxo credential and report a detail

**Files:**
- Modify: `backend/saxo/tasks.py:49-89`
- Test: `backend/saxo/test_tasks.py` (append a class)

**Interfaces:**
- Produces: `saxo.tasks.SyncReport(rows: int, detail: str = '')` (a `NamedTuple`); `saxo.tasks.synced(fn=None, *, reports_health=True, task=None, needs_credential=True)`. With `needs_credential=False` the wrapped function is called with the caller's arguments only and its own signature is reported. A function may return an `int` (as today) or a `SyncReport`; the wrapper returns the row count either way and stores `detail[:200]`.

- [ ] **Step 1: Write the failing tests** — append to `backend/saxo/test_tasks.py` (add `import inspect` and `SyncReport`, `synced` to the existing `from .tasks import …` / `from . import tasks` imports as the file already does):

```python
class SyncedWithoutCredentialTest(TestCase):
    def test_runs_when_saxo_is_not_connected(self):
        @synced(reports_health=False, task='keyless_job', needs_credential=False)
        def job():
            return 3

        self.assertEqual(job(), 3)
        run = SyncRun.objects.get(task='keyless_job')
        self.assertEqual((run.outcome, run.rows), ('ok', 3))

    def test_a_sync_report_carries_its_detail_to_the_run(self):
        @synced(reports_health=False, task='keyless_job', needs_credential=False)
        def job():
            return SyncReport(rows=2, detail='skipped 1 unreadable filing')

        self.assertEqual(job(), 2)
        run = SyncRun.objects.get(task='keyless_job')
        self.assertEqual((run.rows, run.detail), (2, 'skipped 1 unreadable filing'))

    def test_a_long_detail_is_cut_to_the_column(self):
        @synced(reports_health=False, task='keyless_job', needs_credential=False)
        def job():
            return SyncReport(rows=0, detail='x' * 500)

        job()
        self.assertEqual(len(SyncRun.objects.get(task='keyless_job').detail), 200)

    def test_reports_the_wrapped_functions_own_arguments(self):
        @synced(reports_health=False, task='keyless_job', needs_credential=False)
        def job(slug=None):
            return 0

        self.assertEqual(list(inspect.signature(job).parameters), ['slug'])

    def test_a_failure_is_recorded_and_raised(self):
        @synced(reports_health=False, task='keyless_job', needs_credential=False)
        def job():
            raise RuntimeError('edgar down')

        with self.assertRaises(RuntimeError):
            job()
        run = SyncRun.objects.get(task='keyless_job')
        self.assertEqual((run.outcome, run.detail), ('failed', 'edgar down'))
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test saxo.test_tasks.SyncedWithoutCredentialTest -v 2`
Expected: ImportError / TypeError on `SyncReport` or `needs_credential`.

- [ ] **Step 3: Implement** — in `backend/saxo/tasks.py` add `from typing import NamedTuple` to the imports, and replace `synced` (keep its existing docstring and comment untouched, write none new):

```python
class SyncReport(NamedTuple):
    rows: int
    detail: str = ''


def synced(fn=None, *, reports_health=True, task=None, needs_credential=True):
    """<existing docstring, unchanged>"""
    if fn is None:
        return functools.partial(
            synced, reports_health=reports_health, task=task, needs_credential=needs_credential,
        )
    name = task or fn.__name__
    if reports_health and name not in SYNC_TASKS:
        raise ValueError(f'{name} is not declared in saxo.credentials.SYNC_TASKS')

    @functools.wraps(fn)
    def run(*args, **kwargs):
        leading = ()
        if needs_credential:
            try:
                leading = (active_credential(),)
            except SaxoNotConnected as exc:
                SyncRun.objects.create(task=name, outcome='skipped', detail=str(exc))
                logger.info('Skipping %s: %s', name, exc)
                return

        try:
            result = fn(*leading, *args, **kwargs)
        except Exception as exc:
            SyncRun.objects.create(
                task=name, outcome='failed', detail=str(exc)[:200]
            )
            raise

        report = result if isinstance(result, SyncReport) else SyncReport(result)
        SyncRun.objects.create(task=name, outcome='ok', rows=report.rows, detail=report.detail[:200])
        return report.rows

    <existing comment, unchanged>
    if needs_credential:
        run.__signature__ = inspect.Signature(
            list(inspect.signature(fn).parameters.values())[1:]
        )
    return run
```

Note: today a credential task can return `None` rows only if its body does; `SyncReport(None)` keeps that behaviour identical (`rows=None` was already what got written).

- [ ] **Step 4: Run the whole saxo + research suites** (existing `@synced` users must be unaffected)

Run: `cd backend && .venv/bin/python manage.py test saxo research -v 1`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/saxo/tasks.py backend/saxo/test_tasks.py
git commit -m "feat(saxo): @synced runs keyless tasks and records a SyncReport detail"
```

---

### Task 2: `investors` app, models, settings, migration

**Files:**
- Create: `backend/investors/__init__.py` (empty), `apps.py`, `admin.py`, `models.py`, `migrations/__init__.py` (empty)
- Modify: `backend/backend/settings.py` (INSTALLED_APPS after `'analytics'`; settings next to `FINNHUB_API_KEY` at line ~265)
- Test: `backend/investors/test_models.py`

**Interfaces:**
- Produces (fields exactly as below — every later task uses these names):
  - `Investor(name, firm, cik:int unique, slug unique, blurb, curated:bool, added_at, last_checked_at|None, last_filing_at:date|None, quarters_expected:int|None)`
  - `Filing(investor→related_name='filings', quarter_end:date, filed_on:date, accession unique, form, amendment_type, total_value:int, positions:int)`; constants `Filing.ORIGINAL=''`, `Filing.RESTATEMENT='RESTATEMENT'`, `Filing.NEW_HOLDINGS='NEW HOLDINGS'`
  - `Holding(filing→related_name='holdings', cusip, issuer, title_of_class, shares:int, amount_type, value:int, put_call, discretion)`
  - `Security(cusip pk, ticker|None, name, figi, security_type, resolved_at|None, attempts:int)`; `Security.MAX_ATTEMPTS = 3`
  - settings `SEC_USER_AGENT: str`, `OPENFIGI_API_KEY: str` (both default `''`)

- [ ] **Step 1: Write the failing tests** — `backend/investors/test_models.py`:

```python
from datetime import date

from django.db import IntegrityError, transaction
from django.test import TestCase

from .models import Filing, Holding, Investor, Security


def make_filing(investor, accession='0001-26-000001'):
    return Filing.objects.create(
        investor=investor, quarter_end=date(2026, 6, 30), filed_on=date(2026, 8, 14),
        accession=accession, form='13F-HR', total_value=100, positions=1,
    )


class InvestorModelTest(TestCase):
    def setUp(self):
        self.investor = Investor.objects.create(
            name='Warren Buffett', firm='Berkshire Hathaway', cik=1067983, slug='berkshire-hathaway',
        )

    def test_a_stock_and_its_call_option_are_two_holdings(self):
        filing = make_filing(self.investor)
        Holding.objects.create(filing=filing, cusip='037833100', issuer='APPLE INC', shares=10, value=100)
        Holding.objects.create(
            filing=filing, cusip='037833100', issuer='APPLE INC', shares=5, value=50, put_call='CALL',
        )
        self.assertEqual(filing.holdings.count(), 2)

    def test_one_cusip_is_stored_once_per_filing_and_side(self):
        filing = make_filing(self.investor)
        Holding.objects.create(filing=filing, cusip='037833100', issuer='APPLE INC', shares=10, value=100)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Holding.objects.create(filing=filing, cusip='037833100', issuer='APPLE INC', shares=1, value=1)

    def test_an_accession_is_stored_once(self):
        make_filing(self.investor)
        with self.assertRaises(IntegrityError), transaction.atomic():
            make_filing(self.investor)

    def test_deleting_an_investor_keeps_the_shared_security_cache(self):
        filing = make_filing(self.investor)
        Holding.objects.create(filing=filing, cusip='037833100', issuer='APPLE INC', shares=10, value=100)
        Security.objects.create(cusip='037833100', ticker='AAPL')

        self.investor.delete()

        self.assertFalse(Holding.objects.exists())
        self.assertTrue(Security.objects.filter(cusip='037833100').exists())

    def test_an_unresolved_security_has_no_ticker_and_no_attempts(self):
        security = Security.objects.create(cusip='02005N100')
        self.assertIsNone(security.ticker)
        self.assertEqual(security.attempts, 0)
```

- [ ] **Step 2: Create the app shell and settings** so the test module imports (it still fails on missing models):

`backend/investors/apps.py`:
```python
from django.apps import AppConfig


class InvestorsConfig(AppConfig):
    name = 'investors'
```

`backend/backend/settings.py` — add `'investors',` as the last `INSTALLED_APPS` entry, and below `FINNHUB_API_KEY`:
```python
SEC_USER_AGENT = os.environ.get('SEC_USER_AGENT', '')
OPENFIGI_API_KEY = os.environ.get('OPENFIGI_API_KEY', '')
```

Run: `cd backend && .venv/bin/python manage.py test investors.test_models -v 2`
Expected: FAIL — `ImportError: cannot import name 'Filing'`.

- [ ] **Step 3: Write the models** — `backend/investors/models.py`:

```python
from django.db import models


class Investor(models.Model):
    name = models.CharField(max_length=120)
    firm = models.CharField(max_length=160)
    cik = models.PositiveIntegerField(unique=True)
    slug = models.SlugField(max_length=80, unique=True)
    blurb = models.TextField(blank=True, default='')
    curated = models.BooleanField(default=False)
    added_at = models.DateTimeField(auto_now_add=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_filing_at = models.DateField(null=True, blank=True)
    quarters_expected = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.firm})'


class Filing(models.Model):
    ORIGINAL = ''
    RESTATEMENT = 'RESTATEMENT'
    NEW_HOLDINGS = 'NEW HOLDINGS'
    FORM_CHOICES = [('13F-HR', '13F-HR'), ('13F-HR/A', '13F-HR/A')]
    AMENDMENT_CHOICES = [
        (ORIGINAL, 'Original'), (RESTATEMENT, 'Restatement'), (NEW_HOLDINGS, 'New holdings'),
    ]

    investor = models.ForeignKey(Investor, related_name='filings', on_delete=models.CASCADE)
    quarter_end = models.DateField()
    filed_on = models.DateField()
    accession = models.CharField(max_length=20, unique=True)
    form = models.CharField(max_length=10, choices=FORM_CHOICES)
    amendment_type = models.CharField(
        max_length=12, choices=AMENDMENT_CHOICES, blank=True, default=ORIGINAL,
    )
    total_value = models.BigIntegerField()
    positions = models.PositiveIntegerField()

    class Meta:
        ordering = ['-quarter_end', 'filed_on', 'accession']
        constraints = [
            models.UniqueConstraint(
                fields=['investor', 'quarter_end', 'accession'], name='filing_investor_quarter_accession',
            ),
        ]
        indexes = [models.Index(fields=['investor', '-quarter_end'], name='filing_investor_quarter_idx')]

    def __str__(self):
        return f'{self.investor.slug} {self.quarter_end} {self.accession}'


class Holding(models.Model):
    AMOUNT_TYPE_CHOICES = [('SH', 'Shares'), ('PRN', 'Principal')]
    PUT_CALL_CHOICES = [('', 'None'), ('PUT', 'Put'), ('CALL', 'Call')]

    filing = models.ForeignKey(Filing, related_name='holdings', on_delete=models.CASCADE)
    cusip = models.CharField(max_length=9)
    issuer = models.CharField(max_length=200)
    title_of_class = models.CharField(max_length=150, blank=True, default='')
    shares = models.BigIntegerField()
    amount_type = models.CharField(max_length=3, choices=AMOUNT_TYPE_CHOICES, default='SH')
    value = models.BigIntegerField()
    put_call = models.CharField(max_length=4, choices=PUT_CALL_CHOICES, blank=True, default='')
    discretion = models.CharField(max_length=10, blank=True, default='')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['filing', 'cusip', 'put_call'], name='holding_filing_cusip_side'),
        ]
        indexes = [models.Index(fields=['cusip'], name='holding_cusip_idx')]


class Security(models.Model):
    MAX_ATTEMPTS = 3

    cusip = models.CharField(max_length=9, primary_key=True)
    ticker = models.CharField(max_length=16, null=True, blank=True)
    name = models.CharField(max_length=200, blank=True, default='')
    figi = models.CharField(max_length=12, blank=True, default='')
    security_type = models.CharField(max_length=60, blank=True, default='')
    resolved_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)

    def __str__(self):
        return f'{self.cusip} {self.ticker or "?"}'
```

`backend/investors/admin.py`:
```python
from django.contrib import admin

from .models import Filing, Holding, Investor, Security


@admin.register(Investor)
class InvestorAdmin(admin.ModelAdmin):
    list_display = ('name', 'firm', 'cik', 'curated', 'last_filing_at')


@admin.register(Filing)
class FilingAdmin(admin.ModelAdmin):
    list_display = ('investor', 'quarter_end', 'filed_on', 'form', 'amendment_type', 'positions')
    list_filter = ('investor',)


@admin.register(Holding)
class HoldingAdmin(admin.ModelAdmin):
    list_display = ('filing', 'cusip', 'issuer', 'shares', 'value', 'put_call')


@admin.register(Security)
class SecurityAdmin(admin.ModelAdmin):
    list_display = ('cusip', 'ticker', 'name', 'attempts')
    search_fields = ('cusip', 'ticker', 'name')
```

- [ ] **Step 4: Make the migration, run the tests, migrate the dev DB**

```bash
cd backend
.venv/bin/python manage.py makemigrations investors
.venv/bin/python manage.py test investors.test_models -v 2
.venv/bin/python manage.py migrate
```
Expected: `0001_initial.py` created; 5 tests pass; `Applying investors.0001_initial... OK`.

- [ ] **Step 5: Tell the user to set the SEC contact** (do not invent one): `backend/.env` needs `SEC_USER_AGENT="SaxoDash your-email@example.com"` before any live import; `OPENFIGI_API_KEY` is optional. Add both names with empty values to `backend/.env.example` if that file exists (`ls backend/.env.example`).

- [ ] **Step 6: Commit**

```bash
git add backend/investors backend/backend/settings.py
git add backend/.env.example 2>/dev/null; true
git commit -m "feat(investors): app with Investor, Filing, Holding and Security models"
```

---

### Task 3: Parse information tables and amendment types

**Files:**
- Create: `backend/investors/parse.py`, `backend/investors/testdata/` (4 XML files)
- Modify: `docs/superpowers/specs/2026-10-04-famous-investors-design.md` (the value-normalization bullet)
- Test: `backend/investors/test_parse.py`

**Interfaces:**
- Produces:
  - `parse.FilingUnreadable(Exception)`
  - `parse.DOLLAR_VALUES_SINCE = date(2023, 1, 3)`
  - `parse.parse_information_table(xml: bytes | str, filed_on: date) -> list[dict]` — each dict has exactly the `Holding` field names: `cusip, issuer, title_of_class, shares, amount_type, value, put_call, discretion`
  - `parse.aggregate(rows: list[dict]) -> list[dict]` — one dict per (`cusip`, `put_call`), `shares`/`value` summed, other fields from the first row
  - `parse.parse_amendment_type(primary_xml: bytes | str) -> str` — `''`, `'RESTATEMENT'` or `'NEW HOLDINGS'`

- [ ] **Step 1: Record the Berkshire fixture and write the hand-made ones**

```bash
mkdir -p backend/investors/testdata
set -a; . backend/.env; set +a
curl -s -A "$SEC_USER_AGENT" \
  -o backend/investors/testdata/berkshire-2026q2.xml \
  https://www.sec.gov/Archives/edgar/data/1067983/000119312526352200/56757.xml
grep -c "<infoTable>" backend/investors/testdata/berkshire-2026q2.xml
```
Expected: `89`. (Values recorded on 2026-10-05: 89 rows → 29 aggregated holdings, total `299253556246`, AAPL `037833100` = 227,917,808 shares / `65950296923`.)

`backend/investors/testdata/thousands-2022q3.xml` (no namespace, values in thousands):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<informationTable>
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>037833100</cusip>
    <value>1234</value>
    <shrsOrPrnAmt><sshPrnamt>10000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
    <investmentDiscretion>SOLE</investmentDiscretion>
    <votingAuthority><Sole>10000</Sole><Shared>0</Shared><None>0</None></votingAuthority>
  </infoTable>
</informationTable>
```

`backend/investors/testdata/prefixed-namespace.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<ns1:informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <ns1:infoTable>
    <ns1:nameOfIssuer>ALLY FINL INC</ns1:nameOfIssuer>
    <ns1:titleOfClass>COM</ns1:titleOfClass>
    <ns1:cusip>02005n100</ns1:cusip>
    <ns1:value>1240650000</ns1:value>
    <ns1:shrsOrPrnAmt><ns1:sshPrnamt>27000000</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>
    <ns1:investmentDiscretion>DFND</ns1:investmentDiscretion>
  </ns1:infoTable>
</ns1:informationTable>
```

`backend/investors/testdata/options.xml` (same CUSIP: two stock rows under different managers, one call):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable>
    <nameOfIssuer>NVIDIA CORP</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>67066G104</cusip>
    <value>1000</value>
    <shrsOrPrnAmt><sshPrnamt>10</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
    <investmentDiscretion>DFND</investmentDiscretion><otherManager>1</otherManager>
  </infoTable>
  <infoTable>
    <nameOfIssuer>NVIDIA CORP</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>67066G104</cusip>
    <value>500</value>
    <shrsOrPrnAmt><sshPrnamt>5</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
    <investmentDiscretion>DFND</investmentDiscretion><otherManager>2</otherManager>
  </infoTable>
  <infoTable>
    <nameOfIssuer>NVIDIA CORP</nameOfIssuer><titleOfClass>CALL</titleOfClass><cusip>67066G104</cusip>
    <value>300</value>
    <shrsOrPrnAmt><sshPrnamt>3</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
    <putCall>Call</putCall>
    <investmentDiscretion>SOLE</investmentDiscretion>
  </infoTable>
</informationTable>
```

- [ ] **Step 2: Write the failing tests** — `backend/investors/test_parse.py`:

```python
from datetime import date
from pathlib import Path

from django.test import SimpleTestCase

from . import parse

TESTDATA = Path(__file__).resolve().parent / 'testdata'
DOLLARS_ERA = date(2026, 8, 14)


def fixture(name):
    return (TESTDATA / name).read_bytes()


def by_key(rows):
    return {(row['cusip'], row['put_call']): row for row in rows}


class ParseInformationTableTest(SimpleTestCase):
    def test_reads_every_berkshire_row(self):
        rows = parse.parse_information_table(fixture('berkshire-2026q2.xml'), DOLLARS_ERA)
        self.assertEqual(len(rows), 89)

    def test_aggregates_berkshire_per_cusip_and_keeps_the_filed_total(self):
        rows = parse.aggregate(parse.parse_information_table(fixture('berkshire-2026q2.xml'), DOLLARS_ERA))

        self.assertEqual(len(rows), 29)
        self.assertEqual(sum(row['value'] for row in rows), 299253556246)
        apple = by_key(rows)[('037833100', '')]
        self.assertEqual((apple['shares'], apple['value']), (227917808, 65950296923))
        self.assertEqual(apple['issuer'], 'APPLE INC')

    def test_a_row_carries_exactly_the_holding_fields(self):
        row = parse.parse_information_table(fixture('thousands-2022q3.xml'), DOLLARS_ERA)[0]
        self.assertEqual(
            row,
            {
                'cusip': '037833100', 'issuer': 'APPLE INC', 'title_of_class': 'COM',
                'shares': 10000, 'amount_type': 'SH', 'value': 1234, 'put_call': '', 'discretion': 'SOLE',
            },
        )

    def test_a_filing_made_before_2023_is_in_thousands(self):
        row = parse.parse_information_table(fixture('thousands-2022q3.xml'), date(2022, 11, 14))[0]
        self.assertEqual(row['value'], 1234000)

    def test_a_q4_2022_report_filed_in_2023_is_already_dollars(self):
        row = parse.parse_information_table(fixture('thousands-2022q3.xml'), date(2023, 2, 14))[0]
        self.assertEqual(row['value'], 1234)

    def test_a_prefixed_namespace_parses_and_the_cusip_is_uppercased(self):
        row = parse.parse_information_table(fixture('prefixed-namespace.xml'), DOLLARS_ERA)[0]
        self.assertEqual((row['cusip'], row['shares'], row['value']), ('02005N100', 27000000, 1240650000))

    def test_a_call_stays_apart_from_the_stock_and_managers_are_summed(self):
        rows = by_key(parse.aggregate(parse.parse_information_table(fixture('options.xml'), DOLLARS_ERA)))

        self.assertEqual(set(rows), {('67066G104', ''), ('67066G104', 'CALL')})
        self.assertEqual((rows[('67066G104', '')]['shares'], rows[('67066G104', '')]['value']), (15, 1500))
        self.assertEqual(rows[('67066G104', 'CALL')]['value'], 300)

    def test_malformed_xml_is_unreadable(self):
        with self.assertRaises(parse.FilingUnreadable):
            parse.parse_information_table(b'<informationTable><infoTable>', DOLLARS_ERA)

    def test_a_row_without_a_cusip_is_unreadable(self):
        xml = b'<informationTable><infoTable><nameOfIssuer>X</nameOfIssuer><value>1</value></infoTable></informationTable>'
        with self.assertRaises(parse.FilingUnreadable):
            parse.parse_information_table(xml, DOLLARS_ERA)

    def test_a_non_numeric_value_is_unreadable(self):
        xml = fixture('thousands-2022q3.xml').replace(b'<value>1234</value>', b'<value>n/a</value>')
        with self.assertRaises(parse.FilingUnreadable):
            parse.parse_information_table(xml, DOLLARS_ERA)


PRIMARY = (
    '<edgarSubmission xmlns="http://www.sec.gov/edgar/thirteenffiler">'
    '<formData><coverPage>{}</coverPage></formData></edgarSubmission>'
)


class ParseAmendmentTypeTest(SimpleTestCase):
    def test_an_original_filing_has_no_amendment_type(self):
        self.assertEqual(parse.parse_amendment_type(PRIMARY.format('')), '')

    def test_reads_a_restatement(self):
        info = '<amendmentInfo><amendmentType>RESTATEMENT</amendmentType></amendmentInfo>'
        self.assertEqual(parse.parse_amendment_type(PRIMARY.format(info)), 'RESTATEMENT')

    def test_reads_new_holdings_case_insensitively(self):
        info = '<amendmentInfo><amendmentType>New Holdings</amendmentType></amendmentInfo>'
        self.assertEqual(parse.parse_amendment_type(PRIMARY.format(info)), 'NEW HOLDINGS')

    def test_an_unknown_type_reads_as_original(self):
        info = '<amendmentInfo><amendmentType>OTHER</amendmentType></amendmentInfo>'
        self.assertEqual(parse.parse_amendment_type(PRIMARY.format(info)), '')

    def test_malformed_primary_document_is_unreadable(self):
        with self.assertRaises(parse.FilingUnreadable):
            parse.parse_amendment_type('<edgarSubmission>')
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_parse -v 2`
Expected: `ModuleNotFoundError: investors.parse`.

- [ ] **Step 4: Implement** — `backend/investors/parse.py`:

```python
import xml.etree.ElementTree as ET
from datetime import date
from decimal import Decimal, InvalidOperation

DOLLAR_VALUES_SINCE = date(2023, 1, 3)
AMENDMENT_TYPES = ('RESTATEMENT', 'NEW HOLDINGS')


class FilingUnreadable(Exception):
    pass


def _local(tag):
    return tag.rsplit('}', 1)[-1].rsplit(':', 1)[-1]


def _root(xml, what):
    try:
        return ET.fromstring(xml)
    except ET.ParseError as exc:
        raise FilingUnreadable(f'{what} is not valid XML: {exc}') from exc


def _fields(info_table):
    return {_local(node.tag): (node.text or '').strip() for node in info_table.iter()}


def _whole(text):
    return Decimal(text.replace(',', ''))


def _row(fields, scale):
    try:
        return {
            'cusip': fields['cusip'].upper(),
            'issuer': fields['nameOfIssuer'],
            'title_of_class': fields.get('titleOfClass', ''),
            'shares': int(_whole(fields['sshPrnamt'])),
            'amount_type': fields.get('sshPrnamtType', 'SH').upper() or 'SH',
            'value': int(_whole(fields['value']) * scale),
            'put_call': fields.get('putCall', '').upper(),
            'discretion': fields.get('investmentDiscretion', ''),
        }
    except (KeyError, InvalidOperation) as exc:
        raise FilingUnreadable(f'information table row is missing or garbles {exc}') from exc


def parse_information_table(xml, filed_on):
    scale = 1 if filed_on >= DOLLAR_VALUES_SINCE else 1000
    return [
        _row(_fields(node), scale)
        for node in _root(xml, 'information table').iter()
        if _local(node.tag) == 'infoTable'
    ]


def aggregate(rows):
    merged = {}
    for row in rows:
        key = (row['cusip'], row['put_call'])
        if key in merged:
            merged[key]['shares'] += row['shares']
            merged[key]['value'] += row['value']
        else:
            merged[key] = dict(row)
    return list(merged.values())


def parse_amendment_type(primary_xml):
    for node in _root(primary_xml, 'primary document').iter():
        if _local(node.tag) == 'amendmentType':
            kind = (node.text or '').strip().upper()
            return kind if kind in AMENDMENT_TYPES else ''
    return ''
```

`_local` strips both `{uri}` (how ElementTree spells a namespace) and any literal `prefix:`; ElementTree resolves declared prefixes to `{uri}`, so the second split is a no-op in practice and is harmless.

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv/bin/python manage.py test investors.test_parse -v 2`
Expected: 15 tests pass.

- [ ] **Step 6: Correct the spec** — in `docs/superpowers/specs/2026-10-04-famous-investors-design.md`, replace the bullet
`- **Value normalization:** for filings with \`quarter_end < 2023-01-01\`, \`value × 1000\`, because SEC changed the unit from thousands to dollars in January 2023.`
with
`- **Value normalization:** for filings **filed** before 2023-01-03, \`value × 1000\`. SEC switched from thousands to dollars for filings made from that date, so a Q4 2022 report (filed Feb 2023) is already in dollars — verified on Berkshire's Q3 vs Q4 2022 totals.`
and in the EDGAR bullet list add: `- The amendment type is \`amendmentInfo/amendmentType\` in the filing's \`primary_doc.xml\`, so a filing costs three requests (index, primary doc, table).`

- [ ] **Step 7: Commit**

```bash
git add backend/investors/parse.py backend/investors/test_parse.py backend/investors/testdata docs/superpowers/specs/2026-10-04-famous-investors-design.md
git commit -m "feat(investors): parse 13F information tables and amendment types"
```

---

### Task 4: EDGAR client

**Files:**
- Create: `backend/investors/edgar.py`
- Test: `backend/investors/test_edgar.py`

**Interfaces:**
- Consumes: `core.http_client.request_json, REQUEST_TIMEOUT`; `settings.SEC_USER_AGENT`
- Produces:
  - `edgar.EdgarError(Exception)` — EDGAR unreachable/erroring; fails the run
  - `edgar.EdgarNotConfigured(EdgarError)`
  - `edgar.FilingIncomplete(Exception)` — one filing has no primary doc or no table; that filing is skipped
  - `edgar.filings(cik: int, since: date) -> list[dict]`, each `{'accession': str, 'form': '13F-HR'|'13F-HR/A', 'filed_on': date, 'quarter_end': date}`, quarters with `quarter_end >= since`, sorted **newest quarter first**, and within a quarter by `filed_on` then `accession` ascending
  - `edgar.filing_documents(cik: int, accession: str) -> tuple[bytes, bytes]` — `(primary_doc_xml, information_table_xml)`

- [ ] **Step 1: Write the failing tests** — `backend/investors/test_edgar.py`:

```python
from datetime import date
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from . import edgar

UA = 'SaxoDash test@example.com'


def columns(*entries):
    keys = ('accessionNumber', 'filingDate', 'reportDate', 'form')
    return {key: [entry[i] for entry in entries] for i, key in enumerate(keys)}


def ok_json(payload):
    return Mock(ok=True, status_code=200, json=lambda: payload)


@override_settings(SEC_USER_AGENT=UA)
@patch('investors.edgar.time.sleep')
@patch('investors.edgar.requests.get')
class FilingsTest(SimpleTestCase):
    def test_lists_13f_filings_newest_quarter_first_with_amendments_after_their_original(self, get, sleep):
        get.return_value = ok_json({'filings': {'recent': columns(
            ('A-3', '2026-08-14', '2026-06-30', '13F-HR'),
            ('A-4', '2026-09-01', '2026-03-31', '13F-HR/A'),
            ('A-9', '2026-08-01', '2026-06-30', '10-K'),
            ('A-2', '2026-05-15', '2026-03-31', '13F-HR'),
        ), 'files': []}})

        found = edgar.filings(1067983, date(2021, 10, 5))

        self.assertEqual([f['accession'] for f in found], ['A-3', 'A-2', 'A-4'])
        self.assertEqual(found[0], {
            'accession': 'A-3', 'form': '13F-HR',
            'filed_on': date(2026, 8, 14), 'quarter_end': date(2026, 6, 30),
        })
        self.assertEqual(get.call_args.args[0], 'https://data.sec.gov/submissions/CIK0001067983.json')
        self.assertEqual(get.call_args.kwargs['headers'], {'User-Agent': UA})

    def test_drops_quarters_before_the_window_and_notices(self, get, sleep):
        get.return_value = ok_json({'filings': {'recent': columns(
            ('A-1', '2026-08-14', '2026-06-30', '13F-HR'),
            ('A-0', '2020-08-14', '2020-06-30', '13F-HR'),
            ('A-N', '2026-08-14', '2026-06-30', '13F-NT'),
        ), 'files': []}})

        found = edgar.filings(1, date(2021, 10, 5))

        self.assertEqual([f['accession'] for f in found], ['A-1'])

    def test_follows_older_pages_that_reach_into_the_window_only(self, get, sleep):
        recent = {'filings': {
            'recent': columns(('A-5', '2026-08-14', '2026-06-30', '13F-HR')),
            'files': [
                {'name': 'CIK0000000001-submissions-001.json', 'filingFrom': '2019-01-01', 'filingTo': '2023-01-01'},
                {'name': 'CIK0000000001-submissions-002.json', 'filingFrom': '2001-01-01', 'filingTo': '2018-12-31'},
            ],
        }}
        page = columns(('A-4', '2022-08-14', '2022-06-30', '13F-HR'))
        get.side_effect = [ok_json(recent), ok_json(page)]

        found = edgar.filings(1, date(2021, 10, 5))

        self.assertEqual([f['accession'] for f in found], ['A-5', 'A-4'])
        self.assertEqual(get.call_count, 2)
        self.assertEqual(
            get.call_args.args[0], 'https://data.sec.gov/submissions/CIK0000000001-submissions-001.json',
        )

    def test_a_server_error_is_an_edgar_error(self, get, sleep):
        get.return_value = Mock(ok=False, status_code=503, text='busy')
        with self.assertRaises(edgar.EdgarError):
            edgar.filings(1, date(2021, 10, 5))


@override_settings(SEC_USER_AGENT='')
class NotConfiguredTest(SimpleTestCase):
    def test_refuses_to_call_edgar_without_a_contact(self):
        with self.assertRaises(edgar.EdgarNotConfigured):
            edgar.filings(1, date(2021, 10, 5))


@override_settings(SEC_USER_AGENT=UA)
@patch('investors.edgar.time.sleep')
@patch('investors.edgar.requests.get')
class FilingDocumentsTest(SimpleTestCase):
    def index(self, *names):
        return ok_json({'directory': {'item': [{'name': name} for name in names]}})

    def test_fetches_the_primary_document_and_the_information_table(self, get, sleep):
        get.side_effect = [
            self.index('0001-index.html', '56757.xml', 'primary_doc.xml'),
            Mock(ok=True, status_code=200, content=b'<primary/>'),
            Mock(ok=True, status_code=200, content=b'<table/>'),
        ]

        primary, table = edgar.filing_documents(1067983, '0001193125-26-352200')

        self.assertEqual((primary, table), (b'<primary/>', b'<table/>'))
        urls = [call.args[0] for call in get.call_args_list]
        base = 'https://www.sec.gov/Archives/edgar/data/1067983/000119312526352200/'
        self.assertEqual(urls, [base + 'index.json', base + 'primary_doc.xml', base + '56757.xml'])

    def test_a_filing_without_an_information_table_is_incomplete(self, get, sleep):
        get.side_effect = [self.index('primary_doc.xml', 'x-index.html')]
        with self.assertRaises(edgar.FilingIncomplete):
            edgar.filing_documents(1, '0001-26-1')

    def test_a_failed_document_download_is_an_edgar_error(self, get, sleep):
        get.side_effect = [
            self.index('primary_doc.xml', 'table.xml'),
            Mock(ok=False, status_code=500, content=b''),
        ]
        with self.assertRaises(edgar.EdgarError):
            edgar.filing_documents(1, '0001-26-1')


@override_settings(SEC_USER_AGENT=UA)
class PacingTest(SimpleTestCase):
    @patch('investors.edgar.time.sleep')
    @patch('investors.edgar.time.monotonic', side_effect=[100.0, 100.0, 100.05, 100.12])
    @patch('investors.edgar.requests.get')
    def test_waits_between_back_to_back_requests(self, get, monotonic, sleep):
        edgar._last_request = 0.0
        get.return_value = ok_json({'filings': {'recent': columns(), 'files': []}})

        edgar.filings(1, date(2021, 10, 5))
        edgar.filings(1, date(2021, 10, 5))

        sleep.assert_called_once()
        self.assertAlmostEqual(sleep.call_args.args[0], 0.07, places=2)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_edgar -v 2`
Expected: `ModuleNotFoundError: investors.edgar`.

- [ ] **Step 3: Implement** — `backend/investors/edgar.py`:

```python
import time
from datetime import date

import requests
from django.conf import settings

from core.http_client import REQUEST_TIMEOUT, request_json

SUBMISSIONS_URL = 'https://data.sec.gov/submissions/CIK{cik:010d}.json'
SUBMISSIONS_PAGE_URL = 'https://data.sec.gov/submissions/{name}'
ARCHIVE_URL = 'https://www.sec.gov/Archives/edgar/data/{cik}/{folder}/{name}'
PRIMARY_DOCUMENT = 'primary_doc.xml'
FORMS = ('13F-HR', '13F-HR/A')
MIN_SPACING = 0.12

_last_request = 0.0


class EdgarError(Exception):
    pass


class EdgarNotConfigured(EdgarError):
    pass


class FilingIncomplete(Exception):
    pass


def _headers():
    if not settings.SEC_USER_AGENT:
        raise EdgarNotConfigured('SEC_USER_AGENT is not set.')
    return {'User-Agent': settings.SEC_USER_AGENT}


def _pace():
    global _last_request
    wait = _last_request + MIN_SPACING - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_request = time.monotonic()


def _json(url):
    headers = _headers()
    _pace()
    return request_json(requests.get, url, url, transient=EdgarError, permanent=EdgarError, headers=headers)


def _document(url):
    headers = _headers()
    _pace()
    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as exc:
        raise EdgarError(f'{url} failed: {exc}') from exc
    if not response.ok:
        raise EdgarError(f'{url} failed: {response.status_code}')
    return response.content


def _entries(block):
    return [dict(zip(block, values)) for values in zip(*block.values())]


def _thirteen_f(entry, since):
    if entry['form'] not in FORMS or not entry.get('reportDate'):
        return None
    quarter_end = date.fromisoformat(entry['reportDate'])
    if quarter_end < since:
        return None
    return {
        'accession': entry['accessionNumber'],
        'form': entry['form'],
        'filed_on': date.fromisoformat(entry['filingDate']),
        'quarter_end': quarter_end,
    }


def filings(cik, since):
    submissions = _json(SUBMISSIONS_URL.format(cik=cik))['filings']
    blocks = [submissions['recent']]
    for page in submissions.get('files', []):
        if date.fromisoformat(page['filingTo']) >= since:
            blocks.append(_json(SUBMISSIONS_PAGE_URL.format(name=page['name'])))

    found = {}
    for block in blocks:
        for entry in _entries(block):
            filing = _thirteen_f(entry, since)
            if filing:
                found[filing['accession']] = filing
    return sorted(
        found.values(),
        key=lambda f: (-f['quarter_end'].toordinal(), f['filed_on'], f['accession']),
    )


def filing_documents(cik, accession):
    folder = accession.replace('-', '')
    index = _json(ARCHIVE_URL.format(cik=cik, folder=folder, name='index.json'))
    names = [item['name'] for item in index['directory']['item']]
    xml_names = [name for name in names if name.lower().endswith('.xml')]
    tables = [name for name in xml_names if name.lower() != PRIMARY_DOCUMENT]
    if PRIMARY_DOCUMENT not in [name.lower() for name in xml_names] or not tables:
        raise FilingIncomplete(f'{accession} has no primary document or information table')
    primary = _document(ARCHIVE_URL.format(cik=cik, folder=folder, name=PRIMARY_DOCUMENT))
    table = _document(ARCHIVE_URL.format(cik=cik, folder=folder, name=tables[0]))
    return primary, table
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/bin/python manage.py test investors.test_edgar -v 2`
Expected: 9 tests pass. If `PacingTest` fails on the monotonic side-effect count, check the call order is `_pace` → `monotonic()` (wait calc) → `monotonic()` (stamp) per request: request 1 = 100.0, 100.0; request 2 = 100.05 → wait 0.07, then 100.12.

- [ ] **Step 5: Commit**

```bash
git add backend/investors/edgar.py backend/investors/test_edgar.py
git commit -m "feat(investors): EDGAR client for 13F listings and filing documents"
```

---

### Task 5: OpenFIGI CUSIP resolution

**Files:**
- Create: `backend/investors/figi.py`
- Test: `backend/investors/test_figi.py`

**Interfaces:**
- Consumes: `core.http_client.request_json`; `settings.OPENFIGI_API_KEY`
- Produces:
  - `figi.FigiError(Exception)`
  - `figi.resolve(cusips: list[str])` — a **generator** yielding one dict per batch, `{cusip: {'ticker', 'name', 'figi', 'security_type'} | None}` covering every CUSIP in the batch (`None` = no US listing). Paced between batches. Raises `FigiError` from the batch that failed; batches already yielded stay with the caller.
  - `figi.batch_limits() -> tuple[int, float]` — `(10, 2.5)` keyless, `(100, 0.25)` keyed

- [ ] **Step 1: Write the failing tests** — `backend/investors/test_figi.py`:

```python
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from . import figi

APPLE = {'data': [
    {'figi': 'BBG000B9XSK7', 'name': 'APPLE INC', 'ticker': 'AAPL', 'exchCode': 'UA', 'securityType': 'Common Stock'},
    {'figi': 'BBG000B9XRY4', 'name': 'APPLE INC', 'ticker': 'AAPL', 'exchCode': 'US', 'securityType': 'Common Stock'},
]}
MISSING = {'warning': 'No identifier found.'}


def ok(results):
    return Mock(ok=True, status_code=200, json=lambda: results)


@override_settings(OPENFIGI_API_KEY='')
@patch('investors.figi.time.sleep')
@patch('investors.figi.requests.post')
class ResolveTest(SimpleTestCase):
    def test_prefers_the_us_composite_listing(self, post, sleep):
        post.return_value = ok([APPLE])

        batches = list(figi.resolve(['037833100']))

        self.assertEqual(batches, [{'037833100': {
            'ticker': 'AAPL', 'name': 'APPLE INC', 'figi': 'BBG000B9XRY4', 'security_type': 'Common Stock',
        }}])
        self.assertEqual(
            post.call_args.kwargs['json'], [{'idType': 'ID_CUSIP', 'idValue': '037833100'}],
        )
        self.assertNotIn('X-OPENFIGI-APIKEY', post.call_args.kwargs['headers'])

    def test_a_cusip_with_no_us_listing_or_no_match_is_none(self, post, sleep):
        foreign = {'data': [{'figi': 'F', 'name': 'X', 'ticker': 'X', 'exchCode': 'LN', 'securityType': 'Common Stock'}]}
        post.return_value = ok([foreign, MISSING])

        batches = list(figi.resolve(['AAAAAAAAA', 'BBBBBBBBB']))

        self.assertEqual(batches, [{'AAAAAAAAA': None, 'BBBBBBBBB': None}])

    def test_a_share_class_slash_becomes_a_dot(self, post, sleep):
        post.return_value = ok([{'data': [
            {'figi': 'G', 'name': 'BERKSHIRE HATHAWAY INC-CL B', 'ticker': 'BRK/B', 'exchCode': 'US', 'securityType': 'Common Stock'},
        ]}])

        batch = next(figi.resolve(['084670702']))

        self.assertEqual(batch['084670702']['ticker'], 'BRK.B')

    def test_keyless_batches_ten_and_waits_between_requests(self, post, sleep):
        post.side_effect = lambda *a, **kw: ok([MISSING] * len(kw['json']))
        cusips = [f'{i:09d}' for i in range(23)]

        batches = list(figi.resolve(cusips))

        self.assertEqual([len(batch) for batch in batches], [10, 10, 3])
        self.assertEqual(sleep.call_count, 2)
        self.assertEqual(sleep.call_args.args[0], 2.5)

    def test_a_rate_limit_raises_after_earlier_batches_were_yielded(self, post, sleep):
        post.side_effect = [ok([MISSING] * 10), Mock(ok=False, status_code=429, text='slow down')]
        cusips = [f'{i:09d}' for i in range(15)]
        received = []

        with self.assertRaises(figi.FigiError):
            for batch in figi.resolve(cusips):
                received.append(batch)

        self.assertEqual(len(received), 1)

    def test_nothing_to_resolve_makes_no_request(self, post, sleep):
        self.assertEqual(list(figi.resolve([])), [])
        post.assert_not_called()


@override_settings(OPENFIGI_API_KEY='k')
@patch('investors.figi.time.sleep')
@patch('investors.figi.requests.post')
class KeyedResolveTest(SimpleTestCase):
    def test_a_key_sends_the_header_and_batches_a_hundred(self, post, sleep):
        post.side_effect = lambda *a, **kw: ok([MISSING] * len(kw['json']))

        batches = list(figi.resolve([f'{i:09d}' for i in range(150)]))

        self.assertEqual([len(batch) for batch in batches], [100, 50])
        self.assertEqual(post.call_args.kwargs['headers']['X-OPENFIGI-APIKEY'], 'k')
        self.assertEqual(sleep.call_args.args[0], 0.25)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_figi -v 2`
Expected: `ModuleNotFoundError: investors.figi`.

- [ ] **Step 3: Implement** — `backend/investors/figi.py`:

```python
import time

import requests
from django.conf import settings

from core.http_client import request_json

MAPPING_URL = 'https://api.openfigi.com/v3/mapping'
KEYLESS_LIMITS = (10, 2.5)
KEYED_LIMITS = (100, 0.25)
US_COMPOSITE = 'US'


class FigiError(Exception):
    pass


def batch_limits():
    return KEYED_LIMITS if settings.OPENFIGI_API_KEY else KEYLESS_LIMITS


def _headers():
    headers = {'Content-Type': 'application/json'}
    if settings.OPENFIGI_API_KEY:
        headers['X-OPENFIGI-APIKEY'] = settings.OPENFIGI_API_KEY
    return headers


def _shape(result):
    listing = next((item for item in result.get('data') or [] if item.get('exchCode') == US_COMPOSITE), None)
    if listing is None or not listing.get('ticker'):
        return None
    return {
        'ticker': listing['ticker'].replace('/', '.'),
        'name': listing.get('name') or '',
        'figi': listing.get('figi') or '',
        'security_type': listing.get('securityType') or '',
    }


def resolve(cusips):
    size, spacing = batch_limits()
    cusips = list(cusips)
    for start in range(0, len(cusips), size):
        if start:
            time.sleep(spacing)
        batch = cusips[start:start + size]
        results = request_json(
            requests.post, MAPPING_URL, 'OpenFIGI mapping',
            transient=FigiError, permanent=FigiError,
            json=[{'idType': 'ID_CUSIP', 'idValue': cusip} for cusip in batch],
            headers=_headers(),
        )
        yield {cusip: _shape(result) for cusip, result in zip(batch, results)}
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/bin/python manage.py test investors.test_figi -v 2`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/investors/figi.py backend/investors/test_figi.py
git commit -m "feat(investors): resolve CUSIPs to US tickers through OpenFIGI"
```

---

### Task 6: The quarter-over-quarter rule

**Files:**
- Create: `backend/investors/changes.py`
- Test: `backend/investors/test_changes.py`

**Interfaces:**
- Produces:
  - constants `NEW='new'`, `ADDED='added'`, `TRIMMED='trimmed'`, `UNCHANGED='unchanged'`, `SOLD_OUT='sold_out'`, `THRESHOLD_PCT=1`
  - `changes.position_change(shares: int, previous_shares: int | None) -> tuple[str, float | None]` — `(kind, shares_change_pct)`; pct rounded to 2 places, `None` for *new*
  - `changes.compare(current: dict[key, int], previous: dict[key, int] | None) -> tuple[dict[key, tuple|None], list[key]]` — per current key its `position_change` (all `None` when `previous is None`, i.e. first stored quarter), plus the sold-out keys (empty for a first quarter). `key` is any hashable — callers use `(cusip, put_call)`.

- [ ] **Step 1: Write the failing tests** — `backend/investors/test_changes.py`:

```python
from django.test import SimpleTestCase

from . import changes

AAPL = ('037833100', '')
ALLY = ('02005N100', '')
AAPL_CALL = ('037833100', 'CALL')


class PositionChangeTest(SimpleTestCase):
    def test_absent_before_is_new(self):
        self.assertEqual(changes.position_change(100, None), (changes.NEW, None))

    def test_one_percent_more_is_added(self):
        self.assertEqual(changes.position_change(101, 100), (changes.ADDED, 1.0))

    def test_one_percent_less_is_trimmed(self):
        self.assertEqual(changes.position_change(99, 100), (changes.TRIMMED, -1.0))

    def test_under_one_percent_is_unchanged(self):
        self.assertEqual(changes.position_change(1005, 1000), (changes.UNCHANGED, 0.5))

    def test_identical_is_unchanged(self):
        self.assertEqual(changes.position_change(100, 100), (changes.UNCHANGED, 0.0))

    def test_growth_from_a_zero_share_row_is_added_without_a_percentage(self):
        self.assertEqual(changes.position_change(50, 0), (changes.ADDED, None))

    def test_the_percentage_is_rounded_to_two_places(self):
        self.assertEqual(changes.position_change(200, 300), (changes.TRIMMED, -33.33))


class CompareTest(SimpleTestCase):
    def test_a_first_quarter_has_no_change_column_and_nothing_sold(self):
        per_key, sold_out = changes.compare({AAPL: 100}, None)
        self.assertEqual(per_key, {AAPL: None})
        self.assertEqual(sold_out, [])

    def test_classifies_each_position_and_lists_sold_out_ones(self):
        per_key, sold_out = changes.compare(
            {AAPL: 120, AAPL_CALL: 5},
            {AAPL: 100, ALLY: 50},
        )
        self.assertEqual(per_key[AAPL], (changes.ADDED, 20.0))
        self.assertEqual(per_key[AAPL_CALL], (changes.NEW, None))
        self.assertEqual(sold_out, [ALLY])

    def test_an_empty_previous_quarter_makes_everything_new(self):
        per_key, sold_out = changes.compare({AAPL: 1}, {})
        self.assertEqual(per_key, {AAPL: (changes.NEW, None)})
        self.assertEqual(sold_out, [])
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_changes -v 2`
Expected: `ModuleNotFoundError: investors.changes`.

- [ ] **Step 3: Implement** — `backend/investors/changes.py`:

```python
NEW = 'new'
ADDED = 'added'
TRIMMED = 'trimmed'
UNCHANGED = 'unchanged'
SOLD_OUT = 'sold_out'
THRESHOLD_PCT = 1


def position_change(shares, previous_shares):
    if previous_shares is None:
        return NEW, None
    if previous_shares == 0:
        return (ADDED, None) if shares > 0 else (UNCHANGED, None)
    pct = round((shares - previous_shares) / previous_shares * 100, 2)
    if pct >= THRESHOLD_PCT:
        return ADDED, pct
    if pct <= -THRESHOLD_PCT:
        return TRIMMED, pct
    return UNCHANGED, pct


def compare(current, previous):
    if previous is None:
        return {key: None for key in current}, []
    per_key = {key: position_change(shares, previous.get(key)) for key, shares in current.items()}
    sold_out = [key for key in previous if key not in current]
    return per_key, sold_out
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/bin/python manage.py test investors.test_changes -v 2`
Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/investors/changes.py backend/investors/test_changes.py
git commit -m "feat(investors): one quarter-over-quarter change rule"
```

---

### Task 7: A quarter's effective holdings (amendments applied)

**Files:**
- Create: `backend/investors/quarters.py`, `backend/investors/factories.py`
- Test: `backend/investors/test_quarters.py`

**Interfaces:**
- Consumes: models from Task 2.
- Produces:
  - `factories.make_investor(**overrides) -> Investor` (defaults: Berkshire, cik 1067983, slug `berkshire-hathaway`)
  - `factories.store_quarter(investor, quarter_end: date, holdings: list[tuple], *, filed_on=None, amendment_type='', form=None) -> Filing` — each holding tuple is `(cusip, issuer, shares, value)` or `(cusip, issuer, shares, value, put_call)`; `filed_on` defaults to `quarter_end + 45 days`; `form` defaults to `'13F-HR/A'` when `amendment_type` else `'13F-HR'`; accession auto-generated and unique
  - `quarters.quarter_ends(investor) -> list[date]` newest first, distinct
  - `quarters.effective_filings(filings: list[Filing]) -> list[Filing]` for **one quarter's** filings ordered by `filed_on, accession`: an original or `RESTATEMENT` (or an amendment with no type) resets the list, a `NEW HOLDINGS` appends
  - `quarters.snapshot(investor, quarter_end) -> dict[(cusip, put_call), dict]` with keys `cusip, put_call, issuer, title_of_class, amount_type, shares, value`
  - `quarters.held_keys_by_quarter(investor) -> dict[date, set[(cusip, put_call)]]` — two queries total
  - `quarters.quarters_held(keys_by_quarter, quarter_end) -> dict[key, int]` — consecutive quarters each key in `keys_by_quarter[quarter_end]` has been held, counting back from `quarter_end` through stored quarters

- [ ] **Step 1: Write the factories** — `backend/investors/factories.py`:

```python
import itertools
from datetime import timedelta

from .models import Filing, Holding, Investor

_accessions = itertools.count(1)


def make_investor(**overrides):
    fields = {
        'name': 'Warren Buffett', 'firm': 'Berkshire Hathaway', 'cik': 1067983,
        'slug': 'berkshire-hathaway', 'curated': True,
    }
    fields.update(overrides)
    return Investor.objects.create(**fields)


def store_quarter(investor, quarter_end, holdings, *, filed_on=None, amendment_type='', form=None):
    rows = [
        {'cusip': h[0], 'issuer': h[1], 'shares': h[2], 'value': h[3], 'put_call': h[4] if len(h) > 4 else ''}
        for h in holdings
    ]
    filing = Filing.objects.create(
        investor=investor,
        quarter_end=quarter_end,
        filed_on=filed_on or quarter_end + timedelta(days=45),
        accession=f'0000000000-00-{next(_accessions):06d}',
        form=form or ('13F-HR/A' if amendment_type else '13F-HR'),
        amendment_type=amendment_type,
        total_value=sum(row['value'] for row in rows),
        positions=len(rows),
    )
    Holding.objects.bulk_create(Holding(filing=filing, **row) for row in rows)
    return filing
```

- [ ] **Step 2: Write the failing tests** — `backend/investors/test_quarters.py`:

```python
from datetime import date, timedelta

from django.test import TestCase

from . import quarters
from .factories import make_investor, store_quarter
from .models import Filing

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)
Q4 = date(2025, 12, 31)
Q3 = date(2025, 9, 30)
AAPL = ('037833100', '')
ALLY = ('02005N100', '')


class SnapshotTest(TestCase):
    def setUp(self):
        self.investor = make_investor()

    def test_lists_stored_quarters_newest_first_once_each(self):
        store_quarter(self.investor, Q1, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(self.investor, Q2, [('02005N100', 'ALLY', 1, 1)], amendment_type=Filing.NEW_HOLDINGS)

        self.assertEqual(quarters.quarter_ends(self.investor), [Q2, Q1])

    def test_a_restatement_replaces_the_original(self):
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100), ('02005N100', 'ALLY', 5, 50)])
        store_quarter(
            self.investor, Q2, [('037833100', 'APPLE INC', 12, 120)],
            amendment_type=Filing.RESTATEMENT, filed_on=Q2 + timedelta(days=60),
        )

        snap = quarters.snapshot(self.investor, Q2)

        self.assertEqual(set(snap), {AAPL})
        self.assertEqual((snap[AAPL]['shares'], snap[AAPL]['value']), (12, 120))

    def test_new_holdings_add_to_the_quarter(self):
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(
            self.investor, Q2, [('02005N100', 'ALLY', 5, 50)],
            amendment_type=Filing.NEW_HOLDINGS, filed_on=Q2 + timedelta(days=200),
        )

        self.assertEqual(set(quarters.snapshot(self.investor, Q2)), {AAPL, ALLY})

    def test_new_holdings_add_to_the_same_cusip(self):
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(
            self.investor, Q2, [('037833100', 'APPLE INC', 4, 40)],
            amendment_type=Filing.NEW_HOLDINGS, filed_on=Q2 + timedelta(days=200),
        )

        snap = quarters.snapshot(self.investor, Q2)

        self.assertEqual((snap[AAPL]['shares'], snap[AAPL]['value']), (14, 140))

    def test_a_restatement_after_new_holdings_starts_over(self):
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(
            self.investor, Q2, [('02005N100', 'ALLY', 5, 50)],
            amendment_type=Filing.NEW_HOLDINGS, filed_on=Q2 + timedelta(days=60),
        )
        store_quarter(
            self.investor, Q2, [('037833100', 'APPLE INC', 11, 110)],
            amendment_type=Filing.RESTATEMENT, filed_on=Q2 + timedelta(days=90),
        )

        self.assertEqual(set(quarters.snapshot(self.investor, Q2)), {AAPL})

    def test_an_amendment_with_no_type_replaces(self):
        store_quarter(self.investor, Q2, [('037833100', 'APPLE INC', 10, 100)])
        store_quarter(
            self.investor, Q2, [('02005N100', 'ALLY', 5, 50)],
            form='13F-HR/A', filed_on=Q2 + timedelta(days=60),
        )

        self.assertEqual(set(quarters.snapshot(self.investor, Q2)), {ALLY})

    def test_a_quarter_with_nothing_stored_is_empty(self):
        self.assertEqual(quarters.snapshot(self.investor, Q2), {})


class QuartersHeldTest(TestCase):
    def test_counts_consecutive_quarters_back_from_the_one_asked(self):
        investor = make_investor()
        store_quarter(investor, Q3, [('037833100', 'APPLE INC', 1, 1), ('02005N100', 'ALLY', 1, 1)])
        store_quarter(investor, Q4, [('037833100', 'APPLE INC', 1, 1)])
        store_quarter(investor, Q1, [('037833100', 'APPLE INC', 1, 1), ('02005N100', 'ALLY', 1, 1)])
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 1, 1), ('02005N100', 'ALLY', 1, 1)])

        keys = quarters.held_keys_by_quarter(investor)

        self.assertEqual(quarters.quarters_held(keys, Q2), {AAPL: 4, ALLY: 2})
        self.assertEqual(quarters.quarters_held(keys, Q4), {AAPL: 2})

    def test_held_keys_respect_amendments(self):
        investor = make_investor()
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 1, 1)])
        store_quarter(
            investor, Q2, [('02005N100', 'ALLY', 1, 1)],
            amendment_type=Filing.RESTATEMENT, filed_on=Q2 + timedelta(days=90),
        )

        self.assertEqual(quarters.held_keys_by_quarter(investor), {Q2: {ALLY}})
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_quarters -v 2`
Expected: `ModuleNotFoundError: investors.quarters`.

- [ ] **Step 4: Implement** — `backend/investors/quarters.py`:

```python
from collections import defaultdict

from .models import Filing, Holding


def quarter_ends(investor):
    return sorted(set(investor.filings.values_list('quarter_end', flat=True)), reverse=True)


def effective_filings(filings):
    chosen = []
    for filing in filings:
        if filing.amendment_type == Filing.NEW_HOLDINGS:
            chosen.append(filing)
        else:
            chosen = [filing]
    return chosen


def _effective_ids_by_quarter(investor, quarter_end=None):
    filings = investor.filings.order_by('quarter_end', 'filed_on', 'accession')
    if quarter_end is not None:
        filings = filings.filter(quarter_end=quarter_end)
    grouped = defaultdict(list)
    for filing in filings:
        grouped[filing.quarter_end].append(filing)
    return {quarter: [f.pk for f in effective_filings(group)] for quarter, group in grouped.items()}


def snapshot(investor, quarter_end):
    filing_ids = _effective_ids_by_quarter(investor, quarter_end).get(quarter_end, [])
    merged = {}
    for holding in Holding.objects.filter(filing_id__in=filing_ids).order_by('filing__filed_on', 'pk'):
        key = (holding.cusip, holding.put_call)
        if key in merged:
            merged[key]['shares'] += holding.shares
            merged[key]['value'] += holding.value
            continue
        merged[key] = {
            'cusip': holding.cusip, 'put_call': holding.put_call, 'issuer': holding.issuer,
            'title_of_class': holding.title_of_class, 'amount_type': holding.amount_type,
            'shares': holding.shares, 'value': holding.value,
        }
    return merged


def held_keys_by_quarter(investor):
    ids_by_quarter = _effective_ids_by_quarter(investor)
    quarter_of = {pk: quarter for quarter, ids in ids_by_quarter.items() for pk in ids}
    keys = {quarter: set() for quarter in ids_by_quarter}
    rows = Holding.objects.filter(filing_id__in=quarter_of).values_list('filing_id', 'cusip', 'put_call')
    for filing_id, cusip, put_call in rows:
        keys[quarter_of[filing_id]].add((cusip, put_call))
    return keys


def quarters_held(keys_by_quarter, quarter_end):
    earlier = sorted((q for q in keys_by_quarter if q <= quarter_end), reverse=True)
    counts = {}
    for key in keys_by_quarter.get(quarter_end, set()):
        streak = 0
        for quarter in earlier:
            if key not in keys_by_quarter[quarter]:
                break
            streak += 1
        counts[key] = streak
    return counts
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv/bin/python manage.py test investors.test_quarters -v 2`
Expected: 9 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/investors/quarters.py backend/investors/factories.py backend/investors/test_quarters.py
git commit -m "feat(investors): read a quarter's holdings with amendments applied"
```

---

### Task 8: Importer

**Files:**
- Create: `backend/investors/importer.py`
- Test: `backend/investors/test_importer.py`

**Interfaces:**
- Consumes: `edgar.filings`, `edgar.filing_documents`, `edgar.EdgarError`, `edgar.FilingIncomplete` (Task 4); `parse.*` (Task 3); `figi.resolve`, `figi.FigiError` (Task 5); models (Task 2).
- Produces:
  - `importer.HISTORY_YEARS = 5`
  - `importer.history_start(today: date | None = None) -> date` — `today - (365 * 5 + 1) days`
  - `importer.SyncResult` dataclass: `imported: int = 0`, `skipped: list[str]` (accessions)
  - `importer.sync_investor(investor, since: date, *, track_progress=False) -> SyncResult` — newest quarter first; one `transaction.atomic()` per filing; unreadable/incomplete filings skipped and logged; `EdgarError` propagates (filings already stored stay). Afterwards updates `last_checked_at` / `last_filing_at` and calls `resolve_securities()`. With `track_progress`, sets `quarters_expected` to the number of distinct quarters listed before importing and back to `None` when done (also on error).
  - `importer.backfill(investor, today=None) -> SyncResult` = `sync_investor(investor, history_start(today), track_progress=True)`
  - `importer.resolve_securities() -> int` — resolves every `Security` with `ticker IS NULL and attempts < MAX_ATTEMPTS`; each looked-up CUSIP's `attempts += 1`; a hit sets ticker/name/figi/security_type/resolved_at; `FigiError` is logged and stops resolution without raising. Returns hits.
  - `importer.progress(investor) -> dict | None` — `None` unless `quarters_expected` is set, else `{'quarters_imported', 'quarters_expected', 'cusips_resolved', 'cusips_seen'}`

- [ ] **Step 1: Write the failing tests** — `backend/investors/test_importer.py`:

```python
from datetime import date
from unittest.mock import patch

from django.test import TestCase

from . import edgar, figi, importer, parse
from .factories import make_investor
from .models import Filing, Holding, Investor, Security

NS = 'http://www.sec.gov/edgar/document/thirteenf/informationtable'


def table(*rows):
    body = ''.join(
        f'<infoTable><nameOfIssuer>{issuer}</nameOfIssuer><titleOfClass>COM</titleOfClass>'
        f'<cusip>{cusip}</cusip><value>{value}</value><shrsOrPrnAmt><sshPrnamt>{shares}</sshPrnamt>'
        f'<sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt><investmentDiscretion>SOLE</investmentDiscretion>'
        f'</infoTable>'
        for cusip, issuer, shares, value in rows
    )
    return f'<informationTable xmlns="{NS}">{body}</informationTable>'.encode()


def primary(amendment_type=''):
    info = f'<amendmentInfo><amendmentType>{amendment_type}</amendmentType></amendmentInfo>' if amendment_type else ''
    return f'<edgarSubmission><formData><coverPage>{info}</coverPage></formData></edgarSubmission>'.encode()


def listing(accession, quarter_end, filed_on, form='13F-HR'):
    return {'accession': accession, 'form': form, 'quarter_end': quarter_end, 'filed_on': filed_on}


Q2 = date(2026, 6, 30)
Q1 = date(2026, 3, 31)
NEWEST = listing('A-2', Q2, date(2026, 8, 14))
OLDER = listing('A-1', Q1, date(2026, 5, 15))
APPLE = ('037833100', 'APPLE INC', 10, 1000)
ALLY = ('02005N100', 'ALLY FINL INC', 5, 500)


@patch('investors.importer.figi.resolve', return_value=iter([]))
@patch('investors.importer.edgar.filing_documents')
@patch('investors.importer.edgar.filings')
class SyncInvestorTest(TestCase):
    def setUp(self):
        self.investor = make_investor()

    def test_imports_each_filing_with_aggregated_holdings_newest_quarter_first(self, filings, documents, resolve):
        filings.return_value = [NEWEST, OLDER]
        documents.side_effect = [(primary(), table(APPLE, APPLE)), (primary(), table(ALLY))]

        result = importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(result.imported, 2)
        self.assertEqual([c.args[1] for c in documents.call_args_list], ['A-2', 'A-1'])
        filing = Filing.objects.get(accession='A-2')
        self.assertEqual((filing.quarter_end, filing.total_value, filing.positions), (Q2, 2000, 1))
        self.assertEqual(filing.holdings.get().shares, 20)

    def test_skips_accessions_already_stored(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.return_value = (primary(), table(APPLE))
        importer.sync_investor(self.investor, date(2021, 10, 5))

        documents.reset_mock()
        result = importer.sync_investor(self.investor, date(2021, 10, 5))

        documents.assert_not_called()
        self.assertEqual(result.imported, 0)
        self.assertEqual(Filing.objects.count(), 1)

    def test_records_both_amendment_types_from_the_primary_document(self, filings, documents, resolve):
        filings.return_value = [
            listing('A-3', Q2, date(2026, 9, 1), form='13F-HR/A'),
            listing('A-4', Q2, date(2026, 9, 2), form='13F-HR/A'),
        ]
        documents.side_effect = [
            (primary('RESTATEMENT'), table(APPLE)),
            (primary('NEW HOLDINGS'), table(ALLY)),
        ]

        importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(Filing.objects.get(accession='A-3').amendment_type, Filing.RESTATEMENT)
        self.assertEqual(Filing.objects.get(accession='A-4').amendment_type, Filing.NEW_HOLDINGS)

    def test_an_original_filing_ignores_any_amendment_markup(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.return_value = (primary('RESTATEMENT'), table(APPLE))

        importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(Filing.objects.get().amendment_type, '')

    def test_an_unreadable_filing_is_skipped_and_the_rest_import(self, filings, documents, resolve):
        filings.return_value = [NEWEST, OLDER]
        documents.side_effect = [(primary(), b'<informationTable><infoTable>'), (primary(), table(ALLY))]

        result = importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(result.skipped, ['A-2'])
        self.assertEqual(list(Filing.objects.values_list('accession', flat=True)), ['A-1'])

    def test_a_filing_with_no_table_is_skipped(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.side_effect = edgar.FilingIncomplete('no table')

        result = importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(result.skipped, ['A-2'])

    def test_an_edgar_failure_keeps_filings_already_stored(self, filings, documents, resolve):
        filings.return_value = [NEWEST, OLDER]
        documents.side_effect = [(primary(), table(APPLE)), edgar.EdgarError('503')]

        with self.assertRaises(edgar.EdgarError):
            importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(list(Filing.objects.values_list('accession', flat=True)), ['A-2'])
        self.assertEqual(Holding.objects.count(), 1)

    def test_records_when_it_checked_and_the_latest_filing(self, filings, documents, resolve):
        filings.return_value = [NEWEST, OLDER]
        documents.side_effect = [(primary(), table(APPLE)), (primary(), table(ALLY))]

        importer.sync_investor(self.investor, date(2021, 10, 5))

        self.investor.refresh_from_db()
        self.assertEqual(self.investor.last_filing_at, date(2026, 8, 14))
        self.assertIsNotNone(self.investor.last_checked_at)

    def test_every_new_cusip_enters_the_security_cache_unresolved(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.return_value = (primary(), table(APPLE, ALLY))

        importer.sync_investor(self.investor, date(2021, 10, 5))

        self.assertEqual(set(Security.objects.values_list('cusip', flat=True)), {'037833100', '02005N100'})

    def test_progress_counts_against_the_quarters_listed_while_importing(self, filings, documents, resolve):
        filings.return_value = [NEWEST, OLDER]
        seen = []

        def fetch(cik, accession):
            seen.append(importer.progress(Investor.objects.get(pk=self.investor.pk)))
            return primary(), table(APPLE)

        documents.side_effect = fetch

        importer.sync_investor(self.investor, date(2021, 10, 5), track_progress=True)

        self.assertEqual(seen[0]['quarters_expected'], 2)
        self.assertEqual(seen[0]['quarters_imported'], 0)
        self.assertEqual(seen[1]['quarters_imported'], 1)
        self.investor.refresh_from_db()
        self.assertIsNone(self.investor.quarters_expected)
        self.assertIsNone(importer.progress(self.investor))

    def test_progress_clears_even_when_the_import_fails(self, filings, documents, resolve):
        filings.return_value = [NEWEST]
        documents.side_effect = edgar.EdgarError('503')

        with self.assertRaises(edgar.EdgarError):
            importer.sync_investor(self.investor, date(2021, 10, 5), track_progress=True)

        self.investor.refresh_from_db()
        self.assertIsNone(self.investor.quarters_expected)


class ResolveSecuritiesTest(TestCase):
    @patch('investors.importer.figi.resolve')
    def test_stores_hits_and_counts_misses(self, resolve):
        Security.objects.create(cusip='037833100')
        Security.objects.create(cusip='999999999')
        resolve.return_value = iter([{
            '037833100': {'ticker': 'AAPL', 'name': 'APPLE INC', 'figi': 'BBG000B9XRY4', 'security_type': 'Common Stock'},
            '999999999': None,
        }])

        self.assertEqual(importer.resolve_securities(), 1)

        apple = Security.objects.get(cusip='037833100')
        self.assertEqual((apple.ticker, apple.attempts), ('AAPL', 1))
        self.assertIsNotNone(apple.resolved_at)
        missing = Security.objects.get(cusip='999999999')
        self.assertEqual((missing.ticker, missing.attempts), (None, 1))

    @patch('investors.importer.figi.resolve')
    def test_resolved_and_exhausted_cusips_are_not_looked_up_again(self, resolve):
        Security.objects.create(cusip='037833100', ticker='AAPL')
        Security.objects.create(cusip='888888888', attempts=Security.MAX_ATTEMPTS)
        Security.objects.create(cusip='777777777', attempts=Security.MAX_ATTEMPTS - 1)
        resolve.return_value = iter([])

        importer.resolve_securities()

        self.assertEqual(list(resolve.call_args.args[0]), ['777777777'])

    @patch('investors.importer.figi.resolve')
    def test_an_openfigi_failure_leaves_tickers_pending_without_failing(self, resolve):
        Security.objects.create(cusip='037833100')
        Security.objects.create(cusip='02005N100')

        def batches(cusips):
            yield {'037833100': {'ticker': 'AAPL', 'name': 'APPLE INC', 'figi': 'F', 'security_type': 'Common Stock'}}
            raise figi.FigiError('429')

        resolve.side_effect = batches

        self.assertEqual(importer.resolve_securities(), 1)
        self.assertEqual(Security.objects.get(cusip='037833100').ticker, 'AAPL')
        self.assertEqual(Security.objects.get(cusip='02005N100').attempts, 0)


class HistoryStartTest(TestCase):
    def test_reaches_five_years_back(self):
        self.assertEqual(importer.history_start(date(2026, 10, 5)), date(2021, 10, 5))

    def test_a_leap_day_does_not_crash(self):
        self.assertEqual(importer.history_start(date(2028, 2, 29)), date(2023, 3, 1))


class BackfillTest(TestCase):
    @patch('investors.importer.sync_investor')
    def test_backfills_five_years_with_progress(self, sync_investor):
        investor = make_investor()

        importer.backfill(investor, today=date(2026, 10, 5))

        sync_investor.assert_called_once_with(investor, date(2021, 10, 5), track_progress=True)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_importer -v 2`
Expected: `ModuleNotFoundError: investors.importer`.

- [ ] **Step 3: Implement** — `backend/investors/importer.py`:

```python
import logging
from dataclasses import dataclass, field
from datetime import date, timedelta

from django.db import transaction
from django.db.models import F, Max
from django.utils import timezone

from . import edgar, figi, parse
from .models import Filing, Holding, Investor, Security

logger = logging.getLogger(__name__)

HISTORY_YEARS = 5


@dataclass
class SyncResult:
    imported: int = 0
    skipped: list = field(default_factory=list)


def history_start(today=None):
    return (today or date.today()) - timedelta(days=365 * HISTORY_YEARS + 1)


def _import_filing(investor, entry):
    primary, table = edgar.filing_documents(investor.cik, entry['accession'])
    amendment_type = parse.parse_amendment_type(primary) if entry['form'] == '13F-HR/A' else Filing.ORIGINAL
    rows = parse.aggregate(parse.parse_information_table(table, entry['filed_on']))
    with transaction.atomic():
        filing = Filing.objects.create(
            investor=investor,
            quarter_end=entry['quarter_end'],
            filed_on=entry['filed_on'],
            accession=entry['accession'],
            form=entry['form'],
            amendment_type=amendment_type,
            total_value=sum(row['value'] for row in rows),
            positions=len(rows),
        )
        Holding.objects.bulk_create(Holding(filing=filing, **row) for row in rows)
        Security.objects.bulk_create(
            [Security(cusip=cusip) for cusip in {row['cusip'] for row in rows}], ignore_conflicts=True,
        )


def _set_expected(investor, quarters):
    Investor.objects.filter(pk=investor.pk).update(quarters_expected=quarters)
    investor.quarters_expected = quarters


def sync_investor(investor, since, *, track_progress=False):
    entries = edgar.filings(investor.cik, since)
    stored = set(
        Filing.objects.filter(accession__in=[e['accession'] for e in entries]).values_list('accession', flat=True)
    )
    result = SyncResult()
    if track_progress:
        _set_expected(investor, len({e['quarter_end'] for e in entries}))
    try:
        for entry in entries:
            if entry['accession'] in stored:
                continue
            try:
                _import_filing(investor, entry)
            except (parse.FilingUnreadable, edgar.FilingIncomplete) as exc:
                logger.warning('Skipping %s filing %s: %s', investor.slug, entry['accession'], exc)
                result.skipped.append(entry['accession'])
                continue
            result.imported += 1
    finally:
        if track_progress:
            _set_expected(investor, None)
        Investor.objects.filter(pk=investor.pk).update(
            last_checked_at=timezone.now(),
            last_filing_at=investor.filings.aggregate(latest=Max('filed_on'))['latest'],
        )
    resolve_securities()
    return result


def backfill(investor, today=None):
    return sync_investor(investor, history_start(today), track_progress=True)


def _store_batch(batch):
    hits = 0
    now = timezone.now()
    with transaction.atomic():
        for cusip, shaped in batch.items():
            pending = Security.objects.filter(pk=cusip)
            if shaped is None:
                pending.update(attempts=F('attempts') + 1)
                continue
            pending.update(attempts=F('attempts') + 1, resolved_at=now, **shaped)
            hits += 1
    return hits


def resolve_securities():
    pending = list(
        Security.objects.filter(ticker__isnull=True, attempts__lt=Security.MAX_ATTEMPTS)
        .order_by('cusip').values_list('cusip', flat=True)
    )
    hits = 0
    try:
        for batch in figi.resolve(pending):
            hits += _store_batch(batch)
    except figi.FigiError as exc:
        logger.warning('OpenFIGI stopped resolving: %s', exc)
    return hits


def progress(investor):
    if investor.quarters_expected is None:
        return None
    cusips = Holding.objects.filter(filing__investor=investor).values('cusip').distinct()
    return {
        'quarters_imported': investor.filings.values('quarter_end').distinct().count(),
        'quarters_expected': investor.quarters_expected,
        'cusips_resolved': Security.objects.filter(cusip__in=cusips, ticker__isnull=False).count(),
        'cusips_seen': cusips.count(),
    }
```

Note on the `finally`: it records `last_checked_at` even when EDGAR failed — "we tried at this time" is still true; the `SyncRun` is what says it failed.

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/bin/python manage.py test investors.test_importer -v 2`
Expected: 17 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/investors/importer.py backend/investors/test_importer.py
git commit -m "feat(investors): import 13F filings newest quarter first and resolve tickers"
```

---

### Task 9: Curated list and management commands

**Files:**
- Create: `backend/investors/curated.csv`, `backend/investors/curated.py`, `backend/investors/management/__init__.py`, `backend/investors/management/commands/__init__.py`, `backend/investors/management/commands/load_investors.py`, `backend/investors/management/commands/backfill_investors.py`
- Test: `backend/investors/test_curated.py`

**Interfaces:**
- Consumes: `importer.backfill` (Task 8).
- Produces: `curated.CURATED_CSV: Path`; `curated.load_curated(path=CURATED_CSV) -> {'created': int, 'updated': int}` — upsert by `cik`, `curated=True`, `slug = slugify(firm)` on create only, never deletes. Commands `load_investors` and `backfill_investors [--slug SLUG]`.

- [ ] **Step 1: Write the CSV** — `backend/investors/curated.csv` (CIKs verified against EDGAR 2026-10-04 per spec; `blurb` left empty for Phase 2 to decide):

```csv
name,firm,cik,blurb
Warren Buffett,Berkshire Hathaway,1067983,
Bill Ackman,Pershing Square Capital Management,1336528,
Michael Burry,Scion Asset Management,1649339,
Seth Klarman,Baupost Group,1061768,
Stanley Druckenmiller,Duquesne Family Office,1536411,
David Tepper,Appaloosa,1656456,
Li Lu,Himalaya Capital Management,1709323,
Mohnish Pabrai,"Dalal Street, LLC",1549575,
Carl Icahn,Icahn Carl C,921669,
Dan Loeb,Third Point,1040273,
Chase Coleman,Tiger Global Management,1167483,
Ray Dalio,Bridgewater Associates,1350694,
Howard Marks,Oaktree Capital Management,949509,
Bill & Melinda Gates Foundation Trust,Gates Foundation Trust,1166559,
Cathie Wood,ARK Investment Management,1697748,
Terry Smith,Fundsmith,1569205,
Chuck Akre,Akre Capital Management,1112520,
Stephen Mandel,Lone Pine Capital,1061165,
Philippe Laffont,Coatue Management,1135730,
```

- [ ] **Step 2: Write the failing tests** — `backend/investors/test_curated.py`:

```python
import csv
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from .curated import CURATED_CSV, load_curated
from .factories import make_investor
from .importer import SyncResult
from .models import Investor


class LoadCuratedTest(TestCase):
    def test_loads_the_shipped_list(self):
        result = load_curated()

        self.assertEqual(result, {'created': 19, 'updated': 0})
        berkshire = Investor.objects.get(cik=1067983)
        self.assertEqual(
            (berkshire.name, berkshire.firm, berkshire.slug, berkshire.curated),
            ('Warren Buffett', 'Berkshire Hathaway', 'berkshire-hathaway', True),
        )
        self.assertEqual(Investor.objects.get(cik=1549575).slug, 'dalal-street-llc')

    def test_reloading_changes_nothing(self):
        load_curated()
        self.assertEqual(load_curated(), {'created': 0, 'updated': 0})

    def test_an_edited_row_updates_in_place_and_keeps_the_slug(self):
        load_curated()
        Investor.objects.filter(cik=1067983).update(name='W. Buffett')

        self.assertEqual(load_curated(), {'created': 0, 'updated': 1})
        berkshire = Investor.objects.get(cik=1067983)
        self.assertEqual((berkshire.name, berkshire.slug), ('Warren Buffett', 'berkshire-hathaway'))

    def test_never_removes_an_investor_the_user_added(self):
        make_investor(name='Someone', firm='Some Fund', cik=1, slug='some-fund', curated=False)
        load_curated()
        self.assertTrue(Investor.objects.filter(slug='some-fund').exists())

    def test_an_investor_the_user_added_becomes_curated_when_listed(self):
        make_investor(curated=False)
        load_curated()
        self.assertTrue(Investor.objects.get(cik=1067983).curated)

    def test_the_shipped_list_has_unique_ciks(self):
        with open(CURATED_CSV, newline='') as handle:
            ciks = [row['cik'] for row in csv.DictReader(handle)]
        self.assertEqual(len(ciks), 19)
        self.assertEqual(len(set(ciks)), 19)


class CommandsTest(TestCase):
    def test_load_investors_reports_counts(self):
        out = StringIO()
        call_command('load_investors', stdout=out)
        self.assertIn('created 19, updated 0', out.getvalue())

    @patch('investors.management.commands.backfill_investors.backfill', return_value=SyncResult(imported=3))
    def test_backfill_one_investor_by_slug(self, backfill):
        make_investor()
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')
        out = StringIO()

        call_command('backfill_investors', '--slug', 'pershing-square', stdout=out)

        backfill.assert_called_once()
        self.assertEqual(backfill.call_args.args[0].slug, 'pershing-square')
        self.assertIn('pershing-square: imported 3, skipped 0', out.getvalue())

    @patch('investors.management.commands.backfill_investors.backfill', return_value=SyncResult())
    def test_backfill_everyone_by_default(self, backfill):
        make_investor()
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

        call_command('backfill_investors', stdout=StringIO())

        self.assertEqual(backfill.call_count, 2)
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_curated -v 2`
Expected: `ModuleNotFoundError: investors.curated`.

- [ ] **Step 4: Implement**

`backend/investors/curated.py`:
```python
import csv
from pathlib import Path

from django.db import transaction
from django.utils.text import slugify

from .models import Investor

CURATED_CSV = Path(__file__).resolve().parent / 'curated.csv'


@transaction.atomic
def load_curated(path=CURATED_CSV):
    with open(path, newline='') as handle:
        entries = list(csv.DictReader(handle))

    existing = {investor.cik: investor for investor in Investor.objects.all()}
    created = updated = 0
    for entry in entries:
        cik = int(entry['cik'])
        values = {
            'name': entry['name'].strip(),
            'firm': entry['firm'].strip(),
            'blurb': (entry.get('blurb') or '').strip(),
            'curated': True,
        }
        investor = existing.get(cik)
        if investor is None:
            Investor.objects.create(cik=cik, slug=slugify(values['firm']), **values)
            created += 1
        elif any(getattr(investor, name) != value for name, value in values.items()):
            Investor.objects.filter(pk=investor.pk).update(**values)
            updated += 1
    return {'created': created, 'updated': updated}
```

`backend/investors/management/commands/load_investors.py`:
```python
from django.core.management.base import BaseCommand

from investors.curated import load_curated


class Command(BaseCommand):
    help = 'Load investors/curated.csv into Investor.'

    def handle(self, *args, **options):
        result = load_curated()
        self.stdout.write(f"created {result['created']}, updated {result['updated']}")
```

`backend/investors/management/commands/backfill_investors.py`:
```python
from django.core.management.base import BaseCommand, CommandError

from investors.importer import backfill
from investors.models import Investor


class Command(BaseCommand):
    help = 'Import five years of 13F filings for every investor, or one with --slug.'

    def add_arguments(self, parser):
        parser.add_argument('--slug')

    def handle(self, *args, **options):
        investors = Investor.objects.all()
        if options['slug']:
            investors = investors.filter(slug=options['slug'])
            if not investors.exists():
                raise CommandError(f"No investor with slug {options['slug']!r}")
        for investor in investors:
            result = backfill(investor)
            self.stdout.write(f'{investor.slug}: imported {result.imported}, skipped {len(result.skipped)}')
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv/bin/python manage.py test investors.test_curated -v 2`
Expected: 9 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/investors/curated.csv backend/investors/curated.py backend/investors/management backend/investors/test_curated.py
git commit -m "feat(investors): curated investor list with load and backfill commands"
```

---

### Task 10: Scheduled sync

**Files:**
- Create: `backend/investors/tasks.py`, `backend/core/migrations/0008_seed_investor_sync.py`
- Modify: `backend/core/scheduling.py` (`PERIODIC_TASKS` + crontab fields in `sync_periodic_tasks`)
- Test: `backend/investors/test_tasks.py`, `backend/core/test_scheduling.py`

**Interfaces:**
- Consumes: `saxo.tasks.synced`, `saxo.tasks.SyncReport` (Task 1); `importer.sync_investor`, `importer.history_start` (Task 8); `edgar.EdgarError`.
- Produces: Celery task `investors.tasks.sync_investors`; `SyncRun.task == 'sync_investors'`; `PERIODIC_TASKS` crontab entries may carry `day_of_week`, `day_of_month`, `month_of_year` (default `'*'`).

- [ ] **Step 1: Write the failing task tests** — `backend/investors/test_tasks.py`:

```python
from unittest.mock import patch

from django.test import TestCase

from saxo.credentials import SYNC_TASKS
from saxo.models import SyncRun

from . import edgar, tasks
from .factories import make_investor
from .importer import SyncResult


@patch('investors.tasks.importer.sync_investor')
class SyncInvestorsTaskTest(TestCase):
    def setUp(self):
        self.berkshire = make_investor()
        self.pershing = make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

    def test_syncs_every_investor_without_a_saxo_connection(self, sync_investor):
        sync_investor.return_value = SyncResult(imported=2)

        tasks.sync_investors()

        self.assertEqual(sync_investor.call_count, 2)
        run = SyncRun.objects.get(task=tasks.SYNC_TASK)
        self.assertEqual((run.outcome, run.rows, run.detail), ('ok', 4, ''))

    def test_skipped_filings_are_named_in_the_run(self, sync_investor):
        sync_investor.side_effect = [SyncResult(imported=1, skipped=['A-9']), SyncResult()]

        tasks.sync_investors()

        run = SyncRun.objects.get(task=tasks.SYNC_TASK)
        self.assertEqual(run.detail, 'skipped 1 unreadable filing(s): A-9')

    def test_one_investor_failing_still_syncs_the_others_and_fails_the_run(self, sync_investor):
        sync_investor.side_effect = [edgar.EdgarError('503 busy'), SyncResult(imported=1)]

        with self.assertRaises(edgar.EdgarError):
            tasks.sync_investors()

        self.assertEqual(sync_investor.call_count, 2)
        run = SyncRun.objects.get(task=tasks.SYNC_TASK)
        self.assertEqual(run.outcome, 'failed')
        self.assertIn('503 busy', run.detail)

    def test_the_run_never_counts_toward_saxo_health(self, sync_investor):
        self.assertNotIn(tasks.SYNC_TASK, SYNC_TASKS)
```

- [ ] **Step 2: Write the failing scheduling tests** — append to `SyncPeriodicTasksTest` in `backend/core/test_scheduling.py`:

```python
    def test_investors_sync_daily_in_13f_deadline_months(self):
        sync_periodic_tasks()
        task = PeriodicTask.objects.get(name='Sync investors (13F deadline months)')
        self.assertEqual(task.task, 'investors.tasks.sync_investors')
        self.assertEqual(
            (task.crontab.minute, task.crontab.hour, task.crontab.day_of_week, task.crontab.month_of_year),
            ('15', '6', '*', '2,5,8,11'),
        )

    def test_investors_sync_weekly_in_the_other_months(self):
        sync_periodic_tasks()
        task = PeriodicTask.objects.get(name='Sync investors (weekly)')
        self.assertEqual(
            (task.crontab.day_of_week, task.crontab.month_of_year),
            ('1', '1,3,4,6,7,9,10,12'),
        )
```

- [ ] **Step 3: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_tasks core.test_scheduling -v 2`
Expected: `ModuleNotFoundError: investors.tasks`; scheduling tests fail with `PeriodicTask.DoesNotExist`.

- [ ] **Step 4: Implement the task** — `backend/investors/tasks.py`:

```python
from celery import shared_task

from saxo.tasks import SyncReport, synced

from . import edgar, importer
from .models import Investor

SYNC_TASK = 'sync_investors'


def _detail(skipped):
    if not skipped:
        return ''
    return f'skipped {len(skipped)} unreadable filing(s): {", ".join(skipped)}'


@synced(reports_health=False, task=SYNC_TASK, needs_credential=False)
def _sync_all():
    since = importer.history_start()
    imported = 0
    skipped = []
    failures = []
    for investor in Investor.objects.all():
        try:
            result = importer.sync_investor(investor, since)
        except edgar.EdgarError as exc:
            failures.append(f'{investor.slug}: {exc}')
            continue
        imported += result.imported
        skipped += result.skipped
    if failures:
        raise edgar.EdgarError('; '.join(failures))
    return SyncReport(rows=imported, detail=_detail(skipped))


@shared_task
def sync_investors():
    return _sync_all()
```

- [ ] **Step 5: Implement the schedule** — in `backend/core/scheduling.py`, add after `'Scan Discover universe'` (leave existing comments as they are):

```python
    'Sync investors (13F deadline months)': {
        'task': 'investors.tasks.sync_investors',
        'crontab': {'minute': '15', 'hour': '6', 'month_of_year': '2,5,8,11'},
    },
    'Sync investors (weekly)': {
        'task': 'investors.tasks.sync_investors',
        'crontab': {'minute': '15', 'hour': '6', 'day_of_week': '1', 'month_of_year': '1,3,4,6,7,9,10,12'},
    },
```

and in `sync_periodic_tasks` replace the `crontab_model.objects.get_or_create(...)` call with:

```python
            schedule, _ = crontab_model.objects.get_or_create(
                minute=crontab['minute'], hour=crontab['hour'],
                day_of_week=crontab.get('day_of_week', '*'),
                day_of_month=crontab.get('day_of_month', '*'),
                month_of_year=crontab.get('month_of_year', '*'),
            )
```

`backend/core/migrations/0008_seed_investor_sync.py`:
```python
from django.db import migrations


def seed(apps, schema_editor):
    from core.scheduling import sync_periodic_tasks
    sync_periodic_tasks(apps=apps)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_networthsnapshot_bank_only_total'),
    ]

    operations = [
        migrations.RunPython(seed, noop),
    ]
```

- [ ] **Step 6: Run the tests, then migrate the dev DB**

```bash
cd backend
.venv/bin/python manage.py test investors.test_tasks core.test_scheduling saxo -v 1
.venv/bin/python manage.py migrate
.venv/bin/python manage.py shell -c "from django_celery_beat.models import PeriodicTask as P; print(list(P.objects.filter(task='investors.tasks.sync_investors').values_list('name', 'crontab__month_of_year')))"
```
Expected: all pass; `Applying core.0008_seed_investor_sync... OK`; the two schedule rows print.

- [ ] **Step 7: Commit**

```bash
git add backend/investors/tasks.py backend/investors/test_tasks.py backend/core/scheduling.py backend/core/test_scheduling.py backend/core/migrations/0008_seed_investor_sync.py
git commit -m "feat(investors): scheduled 13F sync, daily in deadline months and weekly otherwise"
```

---

### Task 11: `GET /api/investors/` — investor cards

**Files:**
- Create: `backend/investors/sectors.py`, `backend/investors/summaries.py`, `backend/investors/views.py`, `backend/investors/urls.py`
- Modify: `backend/backend/urls.py` (add `path('api/investors/', include('investors.urls')),` after the analytics line)
- Test: `backend/investors/test_list_api.py`

**Interfaces:**
- Consumes: `quarters.quarter_ends`, `quarters.snapshot` (Task 7); `changes.compare` (Task 6); `importer.progress` (Task 8); `research.universe.UNIVERSE_CSV`.
- Produces:
  - `sectors.sector_for(ticker: str | None) -> str | None` (cached read of `research/universe.csv`)
  - `summaries.STALE_AFTER = timedelta(days=183)`
  - `summaries.weighted(snap: dict, tickers: dict[str, str|None]) -> list[dict]` — rows sorted by value desc with `ticker` and `weight` (percent, 2 places) added
  - `summaries.tickers_for(cusips) -> dict[cusip, ticker | None]`
  - `summaries.card(investor, today: date) -> dict` with keys: `name, firm, slug, blurb, curated, latest_quarter (iso|None), total_value (int|None), positions (int|None), top_holdings ([{cusip, ticker, issuer, weight}] ≤3), new_count (int|None), exited_count (int|None), last_filing_at (iso|None), stale (bool), import (progress dict|None)`
  - URL name `investor-list`

- [ ] **Step 1: Write the failing tests** — `backend/investors/test_list_api.py`:

```python
from datetime import date

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from .factories import make_investor, store_quarter
from .models import Investor, Security

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)


class InvestorListApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        self.url = reverse('investor-list')

    def card(self, slug):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        return next(card for card in response.data if card['slug'] == slug)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.url).status_code, 401)

    def test_a_card_summarises_the_latest_quarter(self):
        investor = make_investor(last_filing_at=date(2026, 8, 14))
        store_quarter(investor, Q1, [('037833100', 'APPLE INC', 10, 600), ('02005N100', 'ALLY', 5, 400)])
        store_quarter(investor, Q2, [
            ('037833100', 'APPLE INC', 10, 500), ('67066G104', 'NVIDIA CORP', 1, 300),
            ('594918104', 'MICROSOFT CORP', 1, 150), ('88160R101', 'TESLA INC', 1, 50),
        ])
        Security.objects.create(cusip='037833100', ticker='AAPL')

        card = self.card('berkshire-hathaway')

        self.assertEqual(card['latest_quarter'], '2026-06-30')
        self.assertEqual((card['total_value'], card['positions']), (1000, 4))
        self.assertEqual(card['top_holdings'], [
            {'cusip': '037833100', 'ticker': 'AAPL', 'issuer': 'APPLE INC', 'weight': 50.0},
            {'cusip': '67066G104', 'ticker': None, 'issuer': 'NVIDIA CORP', 'weight': 30.0},
            {'cusip': '594918104', 'ticker': None, 'issuer': 'MICROSOFT CORP', 'weight': 15.0},
        ])
        self.assertEqual((card['new_count'], card['exited_count']), (3, 1))
        self.assertEqual(card['last_filing_at'], '2026-08-14')
        self.assertFalse(card['stale'])
        self.assertIsNone(card['import'])
        self.assertTrue(card['curated'])

    def test_a_first_quarter_has_no_change_counts(self):
        store_quarter(make_investor(), Q2, [('037833100', 'APPLE INC', 10, 500)])

        card = self.card('berkshire-hathaway')

        self.assertEqual((card['new_count'], card['exited_count']), (None, None))

    def test_an_investor_with_nothing_imported_yet_is_listed_empty(self):
        make_investor()

        card = self.card('berkshire-hathaway')

        self.assertEqual(
            (card['latest_quarter'], card['total_value'], card['positions'], card['top_holdings']),
            (None, None, None, []),
        )
        self.assertFalse(card['stale'])

    def test_no_filing_for_over_two_quarters_is_stale_but_keeps_its_last_portfolio(self):
        investor = make_investor(
            name='Michael Burry', firm='Scion Asset Management', cik=1649339, slug='scion-asset-management',
            last_filing_at=date(2025, 11, 14),
        )
        store_quarter(investor, date(2025, 9, 30), [('037833100', 'APPLE INC', 10, 500)])

        card = self.card('scion-asset-management')

        self.assertTrue(card['stale'])
        self.assertEqual(card['positions'], 1)

    def test_a_running_backfill_reports_its_progress(self):
        investor = make_investor(quarters_expected=20)
        store_quarter(investor, Q2, [('037833100', 'APPLE INC', 10, 500), ('02005N100', 'ALLY', 5, 400)])
        Security.objects.create(cusip='037833100', ticker='AAPL')
        Security.objects.create(cusip='02005N100')

        card = self.card('berkshire-hathaway')

        self.assertEqual(card['import'], {
            'quarters_imported': 1, 'quarters_expected': 20, 'cusips_resolved': 1, 'cusips_seen': 2,
        })

    def test_lists_every_investor_by_name(self):
        make_investor()
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

        names = [card['name'] for card in self.client.get(self.url).data]

        self.assertEqual(names, ['Bill Ackman', 'Warren Buffett'])
```

`stale` uses `date.today()`; the Scion case (last filed 2025-11-14) is > 183 days before 2026-10-05 and the Berkshire case (2026-08-14) is not, so these hold until ~Feb 2027. To keep them durable, the view passes `today` into `card()`; the test can pin it with `@patch('investors.views.date')` if it starts flaking — not needed now.

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_list_api -v 2`
Expected: `NoReverseMatch: 'investor-list'`.

- [ ] **Step 3: Implement**

`backend/investors/sectors.py`:
```python
import csv
from functools import cache

from research.universe import UNIVERSE_CSV


@cache
def _sectors():
    with open(UNIVERSE_CSV, newline='') as handle:
        return {
            row['ticker'].strip().upper(): (row.get('sector') or '').strip() or None
            for row in csv.DictReader(handle)
        }


def sector_for(ticker):
    return _sectors().get(ticker.upper()) if ticker else None
```

`backend/investors/summaries.py`:
```python
from datetime import timedelta

from . import changes, importer, quarters
from .models import Security

STALE_AFTER = timedelta(days=183)
TOP_HOLDINGS = 3


def tickers_for(cusips):
    return dict(Security.objects.filter(cusip__in=list(cusips)).values_list('cusip', 'ticker'))


def _weight(value, total):
    return round(value / total * 100, 2) if total else 0.0


def weighted(snap, tickers):
    total = sum(row['value'] for row in snap.values())
    rows = [
        {**row, 'ticker': tickers.get(row['cusip']), 'weight': _weight(row['value'], total)}
        for row in snap.values()
    ]
    return sorted(rows, key=lambda row: (-row['value'], row['cusip'], row['put_call']))


def is_stale(investor, today):
    return investor.last_filing_at is not None and today - investor.last_filing_at > STALE_AFTER


def _shares(snap):
    return {key: row['shares'] for key, row in snap.items()}


def card(investor, today):
    ends = quarters.quarter_ends(investor)
    base = {
        'name': investor.name,
        'firm': investor.firm,
        'slug': investor.slug,
        'blurb': investor.blurb,
        'curated': investor.curated,
        'last_filing_at': investor.last_filing_at.isoformat() if investor.last_filing_at else None,
        'stale': is_stale(investor, today),
        'import': importer.progress(investor),
        'latest_quarter': None,
        'total_value': None,
        'positions': None,
        'top_holdings': [],
        'new_count': None,
        'exited_count': None,
    }
    if not ends:
        return base

    snap = quarters.snapshot(investor, ends[0])
    rows = weighted(snap, tickers_for(row['cusip'] for row in snap.values()))
    base.update({
        'latest_quarter': ends[0].isoformat(),
        'total_value': sum(row['value'] for row in rows),
        'positions': len(rows),
        'top_holdings': [
            {'cusip': row['cusip'], 'ticker': row['ticker'], 'issuer': row['issuer'], 'weight': row['weight']}
            for row in rows[:TOP_HOLDINGS]
        ],
    })
    if len(ends) > 1:
        per_key, sold_out = changes.compare(_shares(snap), _shares(quarters.snapshot(investor, ends[1])))
        base['new_count'] = sum(1 for change in per_key.values() if change[0] == changes.NEW)
        base['exited_count'] = len(sold_out)
    return base
```

`backend/investors/views.py`:
```python
from datetime import date

from rest_framework.response import Response
from rest_framework.views import APIView

from . import summaries
from .models import Investor


class InvestorListView(APIView):
    def get(self, request):
        today = date.today()
        return Response([summaries.card(investor, today) for investor in Investor.objects.all()])
```

`backend/investors/urls.py`:
```python
from django.urls import path

from .views import InvestorListView

urlpatterns = [
    path('', InvestorListView.as_view(), name='investor-list'),
]
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/bin/python manage.py test investors.test_list_api -v 2`
Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/investors/sectors.py backend/investors/summaries.py backend/investors/views.py backend/investors/urls.py backend/investors/test_list_api.py backend/backend/urls.py
git commit -m "feat(investors): GET /api/investors/ investor cards"
```

---

### Task 12: `GET /api/investors/<slug>/?quarter=` — one quarter's holdings

**Files:**
- Modify: `backend/investors/summaries.py` (add `detail`), `backend/investors/views.py`, `backend/investors/urls.py`
- Test: `backend/investors/test_detail_api.py`

**Interfaces:**
- Consumes: everything from Task 11; `quarters.held_keys_by_quarter`, `quarters.quarters_held` (Task 7); `portfolio.models.Position.ticker`; `research.models.WatchlistItem.symbol`.
- Produces:
  - `summaries.detail(investor, quarter_end: date | None, today: date) -> dict` — the card's header keys (`name, firm, slug, blurb, curated, last_filing_at, stale, import`) plus `quarters` (iso list, newest first), `quarter` (iso|None), `previous_quarter` (iso|None), `total_value`, `positions`, `top10_weight`, `holdings`. Each holding: `cusip, ticker, issuer, class, put_call, amount_type, shares, value, weight, change (str|None), shares_change_pct (float|None), quarters_held, sector, owned, watched`; sorted by value desc.
  - `summaries.QuarterNotFound(Exception)`
  - URL name `investor-detail`; 404 unknown slug or unstored quarter; 400 malformed `quarter`.

- [ ] **Step 1: Write the failing tests** — `backend/investors/test_detail_api.py`:

```python
from datetime import date

from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework.test import APITestCase

from portfolio.models import Position
from research.models import Watchlist, WatchlistItem

from .factories import make_investor, store_quarter
from .models import Security

Q1 = date(2026, 3, 31)
Q2 = date(2026, 6, 30)


class InvestorDetailApiTest(APITestCase):
    def setUp(self):
        self.client.force_authenticate(User.objects.create_user('me', password='x'))
        self.investor = make_investor(last_filing_at=date(2026, 8, 14))
        store_quarter(self.investor, Q1, [
            ('037833100', 'APPLE INC', 100, 600), ('02005N100', 'ALLY FINL INC', 5, 400),
            ('084670702', 'BERKSHIRE HATHAWAY INC', 10, 100),
        ])
        store_quarter(self.investor, Q2, [
            ('037833100', 'APPLE INC', 110, 700), ('67066G104', 'NVIDIA CORP', 1, 200),
            ('67066G104', 'NVIDIA CORP', 1, 50, 'CALL'), ('084670702', 'BERKSHIRE HATHAWAY INC', 10, 50),
        ])
        Security.objects.create(cusip='037833100', ticker='AAPL')
        Security.objects.create(cusip='67066G104', ticker='NVDA')
        Security.objects.create(cusip='084670702', ticker='BRK.B')

    def url(self, slug='berkshire-hathaway'):
        return reverse('investor-detail', args=[slug])

    def holdings(self, **params):
        response = self.client.get(self.url(), params)
        self.assertEqual(response.status_code, 200)
        return {(h['cusip'], h['put_call']): h for h in response.data['holdings']}

    def test_defaults_to_the_latest_quarter_with_header_facts(self):
        data = self.client.get(self.url()).data

        self.assertEqual((data['quarter'], data['previous_quarter']), ('2026-06-30', '2026-03-31'))
        self.assertEqual(data['quarters'], ['2026-06-30', '2026-03-31'])
        self.assertEqual((data['total_value'], data['positions']), (1000, 4))
        self.assertEqual(data['top10_weight'], 100.0)
        self.assertEqual(data['name'], 'Warren Buffett')
        self.assertEqual(
            [h['cusip'] for h in data['holdings']], ['037833100', '67066G104', '084670702', '67066G104'],
        )

    def test_a_holding_carries_its_ticker_weight_change_and_tenure(self):
        apple = self.holdings()[('037833100', '')]

        self.assertEqual(apple, {
            'cusip': '037833100', 'ticker': 'AAPL', 'issuer': 'APPLE INC', 'class': '',
            'put_call': '', 'amount_type': 'SH', 'shares': 110, 'value': 700, 'weight': 70.0,
            'change': 'added', 'shares_change_pct': 10.0, 'quarters_held': 2,
            'sector': 'Information Technology', 'owned': False, 'watched': False,
        })

    def test_an_option_is_its_own_row_and_new(self):
        call = self.holdings()[('67066G104', 'CALL')]
        self.assertEqual((call['change'], call['quarters_held'], call['value']), ('new', 1, 50))

    def test_a_share_class_ticker_finds_its_sector(self):
        self.assertEqual(self.holdings()[('084670702', '')]['sector'], 'Financials')

    def test_a_ticker_outside_the_universe_or_unresolved_has_no_sector(self):
        Security.objects.filter(cusip='67066G104').update(ticker=None)
        nvda = self.holdings()[('67066G104', '')]
        self.assertEqual((nvda['ticker'], nvda['sector']), (None, None))

    def test_flags_what_you_own_and_watch(self):
        Position.objects.create(
            ticker='AAPL', name='Apple', qty=1, avg_cost=1, current_price=1,
            sector='Tech', type='STOCK', color='#000000',
        )
        WatchlistItem.objects.create(watchlist=Watchlist.objects.create(name='Tech'), symbol='nvda', uic=1)

        rows = self.holdings()

        self.assertTrue(rows[('037833100', '')]['owned'])
        self.assertTrue(rows[('67066G104', '')]['watched'])
        self.assertFalse(rows[('67066G104', '')]['owned'])

    def test_an_older_quarter_can_be_asked_for_and_is_a_first_quarter(self):
        data = self.client.get(self.url(), {'quarter': '2026-03-31'}).data

        self.assertEqual((data['quarter'], data['previous_quarter']), ('2026-03-31', None))
        self.assertTrue(all(h['change'] is None and h['shares_change_pct'] is None for h in data['holdings']))

    def test_a_quarter_not_stored_is_404(self):
        self.assertEqual(self.client.get(self.url(), {'quarter': '2025-12-31'}).status_code, 404)

    def test_a_malformed_quarter_is_400(self):
        self.assertEqual(self.client.get(self.url(), {'quarter': 'Q2-2026'}).status_code, 400)

    def test_an_unknown_investor_is_404(self):
        self.assertEqual(self.client.get(self.url('nobody')).status_code, 404)

    def test_an_investor_with_nothing_imported_answers_empty(self):
        make_investor(name='Bill Ackman', firm='Pershing Square', cik=1336528, slug='pershing-square')

        data = self.client.get(self.url('pershing-square')).data

        self.assertEqual((data['quarter'], data['quarters'], data['holdings']), (None, [], []))
        self.assertEqual((data['total_value'], data['positions'], data['top10_weight']), (None, None, None))
```

Check the `Position` required fields before running: `grep -n "models\." backend/portfolio/models.py | sed -n 1,25p`; add any other non-null field without a default to the `Position.objects.create` call.

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/python manage.py test investors.test_detail_api -v 2`
Expected: `NoReverseMatch: 'investor-detail'`.

- [ ] **Step 3: Implement** — append to `backend/investors/summaries.py` (and add the imports at the top: `from portfolio.models import Position`, `from research.models import WatchlistItem`, `from . import sectors`):

```python
TOP_TEN = 10


class QuarterNotFound(Exception):
    pass


def _header(investor, today):
    return {
        'name': investor.name,
        'firm': investor.firm,
        'slug': investor.slug,
        'blurb': investor.blurb,
        'curated': investor.curated,
        'last_filing_at': investor.last_filing_at.isoformat() if investor.last_filing_at else None,
        'stale': is_stale(investor, today),
        'import': importer.progress(investor),
    }


def _yours():
    owned = {ticker.upper() for ticker in Position.objects.values_list('ticker', flat=True)}
    watched = {symbol.upper() for symbol in WatchlistItem.objects.values_list('symbol', flat=True)}
    return owned, watched


def detail(investor, quarter_end, today):
    ends = quarters.quarter_ends(investor)
    base = {
        **_header(investor, today),
        'quarters': [end.isoformat() for end in ends],
        'quarter': None,
        'previous_quarter': None,
        'total_value': None,
        'positions': None,
        'top10_weight': None,
        'holdings': [],
    }
    if not ends:
        return base
    quarter_end = quarter_end or ends[0]
    if quarter_end not in ends:
        raise QuarterNotFound(quarter_end)
    position = ends.index(quarter_end)
    previous = ends[position + 1] if position + 1 < len(ends) else None

    snap = quarters.snapshot(investor, quarter_end)
    rows = weighted(snap, tickers_for(row['cusip'] for row in snap.values()))
    previous_shares = _shares(quarters.snapshot(investor, previous)) if previous else None
    per_key, _ = changes.compare(_shares(snap), previous_shares)
    held = quarters.quarters_held(quarters.held_keys_by_quarter(investor), quarter_end)
    owned, watched = _yours()

    holdings = []
    for row in rows:
        key = (row['cusip'], row['put_call'])
        change = per_key[key]
        ticker = row['ticker']
        holdings.append({
            'cusip': row['cusip'],
            'ticker': ticker,
            'issuer': row['issuer'],
            'class': row['title_of_class'],
            'put_call': row['put_call'],
            'amount_type': row['amount_type'],
            'shares': row['shares'],
            'value': row['value'],
            'weight': row['weight'],
            'change': change[0] if change else None,
            'shares_change_pct': change[1] if change else None,
            'quarters_held': held.get(key, 1),
            'sector': sectors.sector_for(ticker),
            'owned': bool(ticker) and ticker.upper() in owned,
            'watched': bool(ticker) and ticker.upper() in watched,
        })

    base.update({
        'quarter': quarter_end.isoformat(),
        'previous_quarter': previous.isoformat() if previous else None,
        'total_value': sum(row['value'] for row in rows),
        'positions': len(rows),
        'top10_weight': round(sum(row['weight'] for row in rows[:TOP_TEN]), 2),
        'holdings': holdings,
    })
    return base
```

Note: `test_a_holding_carries…` expects `'class': ''` because `factories.store_quarter` stores no `title_of_class`; real imports carry `COM` etc.

In `card()` replace the duplicated header keys with `**_header(investor, today)` so both payloads share one source:
```python
    base = {
        **_header(investor, today),
        'latest_quarter': None,
        'total_value': None,
        'positions': None,
        'top_holdings': [],
        'new_count': None,
        'exited_count': None,
    }
```

Append to `backend/investors/views.py` (add imports `from django.shortcuts import get_object_or_404`, `from rest_framework.exceptions import NotFound, ValidationError`):

```python
def _quarter_param(request):
    raw = request.query_params.get('quarter')
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ValidationError({'quarter': 'Use YYYY-MM-DD.'})


class InvestorDetailView(APIView):
    def get(self, request, slug):
        investor = get_object_or_404(Investor, slug=slug)
        try:
            return Response(summaries.detail(investor, _quarter_param(request), date.today()))
        except summaries.QuarterNotFound:
            raise NotFound('No filing is stored for that quarter.')
```

`backend/investors/urls.py`:
```python
from django.urls import path

from .views import InvestorDetailView, InvestorListView

urlpatterns = [
    path('', InvestorListView.as_view(), name='investor-list'),
    path('<slug:slug>/', InvestorDetailView.as_view(), name='investor-detail'),
]
```

- [ ] **Step 4: Run the investors suite and the full backend suite**

```bash
cd backend
.venv/bin/python manage.py test investors -v 1
.venv/bin/python manage.py test -v 1
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/investors/summaries.py backend/investors/views.py backend/investors/urls.py backend/investors/test_detail_api.py
git commit -m "feat(investors): GET /api/investors/<slug>/ holdings for a quarter"
```

---

### Task 13: Live import check against the dev database

No new code — this verifies the pipeline against real EDGAR/OpenFIGI. Requires `SEC_USER_AGENT` in `backend/.env` (Task 2, Step 5). If it is unset, stop and ask the user.

- [ ] **Step 1: Load the curated list and backfill one investor**

```bash
cd backend
.venv/bin/python manage.py load_investors
.venv/bin/python manage.py backfill_investors --slug berkshire-hathaway
```
Expected: `created 19, updated 0`; `berkshire-hathaway: imported ~22, skipped 0` (20 quarters plus amendments) within a few minutes.

- [ ] **Step 2: Spot-check against the recorded fixture**

```bash
.venv/bin/python manage.py shell -c "
from datetime import date
from investors.models import Investor, Security
from investors import quarters
b = Investor.objects.get(slug='berkshire-hathaway')
s = quarters.snapshot(b, date(2026, 6, 30))
print(len(s), sum(r['value'] for r in s.values()))
q3, q4 = (sum(r['value'] for r in quarters.snapshot(b, d).values()) for d in (date(2022, 9, 30), date(2022, 12, 31)))
print(round(q4 / q3, 2))
print(Security.objects.filter(ticker__isnull=False).count(), Security.objects.count())
"
```
Expected: `29 299253556246`; the Q4/Q3-2022 ratio near `1.0` (not ~1000 — Review Focus 1); most securities resolved.

- [ ] **Step 3: Hit the API with the dev server** (`scripts/dev.sh --no-ui` or the running stack; get a JWT the way the frontend does)

```bash
TOKEN=$(curl -s -X POST localhost:8000/api/token/ -H 'Content-Type: application/json' -d '{"username":"<user>","password":"<pw>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access"])')
curl -s -H "Authorization: Bearer $TOKEN" localhost:8000/api/investors/ | python3 -m json.tool | head -40
curl -s -H "Authorization: Bearer $TOKEN" "localhost:8000/api/investors/berkshire-hathaway/" | python3 -m json.tool | head -40
```
(Read the port from `backend/.env` if it is not 8000.) Expected: Berkshire card with top 3 and change counts; detail holdings sorted by weight with tickers.

- [ ] **Step 4: Backfill the rest** (keyless OpenFIGI: expect 20+ minutes; run in background)

```bash
.venv/bin/python manage.py backfill_investors > ../.dev/logs/investors-backfill.log 2>&1 &
```
Check the log for `skipped` counts; any skipped accession is worth a look (`grep -n skipped ../.dev/logs/investors-backfill.log`).

- [ ] **Step 5: Learning record** — append `learning/learning-records/0024-13f-values-switched-units-by-filing-date.md` capturing: SEC moved 13F `value` from thousands to dollars by **filing date** (from 2023-01-03), so the Q4 2022 report is already dollars; the obvious "quarter before 2023" reading is wrong by 1000× for one quarter; found by comparing Berkshire's Q3 and Q4 2022 `tableValueTotal`.

- [ ] **Step 6: Update `AGENTS.md` "Decided"** with one paragraph: *13F data is imported, not fetched* — `investors` stores EDGAR filings and reads only its tables; amendments are applied at read time (`quarters.effective_filings`); value unit by filing date; OpenFIGI tickers normalised `/`→`.`; `sync_investors` is `@synced(reports_health=False, needs_credential=False)`. Commit:

```bash
git add AGENTS.md
git commit -m "docs: record how 13F investor data is imported"
```

---

## Self-review notes

- **Spec coverage (Phase 1):** app/models/migrations → T2; EDGAR → T4; parser + normalisation → T3; OpenFIGI → T5; importer (skip stored, one txn per filing, newest first, resolve) → T8; backfill → T8/T9; curated CSV + both commands → T9; scheduled task + data-migration beat entry → T10; list + detail endpoints → T11/T12; `changes.py` single home → T6; amendments → T7; unresolved CUSIPs, failed fetch, malformed filing → T8; stopped filer → T11 stale test. Phase 2–4 endpoints (`changes/`, `history/`, `overview/`, `search/`, `POST`, `DELETE`, `held-by`) are deliberately not here.
- **Testing section of the spec:** parser fixtures (Berkshire, pre-2023, namespaced, put/call) → T3; importer cases (stored skip, both amendment types, unresolved, failed fetch, malformed) → T8; `changes.py` cases → T6; `APITestCase` per endpoint → T11/T12.
