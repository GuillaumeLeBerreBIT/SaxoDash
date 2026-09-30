# Discover Shelves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/discover` page of shelves (Overbought, Quality on sale, Strong trend, …) over the S&P 500 ∪ Nasdaq-100, served from a nightly snapshot table.

**Architecture:** A checked-in universe CSV is loaded into a `ScreenerRow` table. A nightly Celery task resolves each ticker to a Saxo uic, computes technicals from Saxo daily bars (`research/technicals.py`, parity-tested against `lib/indicators.js`) and stores Finnhub fundamentals. Shelves are declarative rules (`research/shelves.py`) queried by two read-only endpoints; the React page renders them as horizontal rows of cards.

**Tech Stack:** Django + DRF, Celery + django-celery-beat, SQLite; Vite + React 19 (JS), React Router, TanStack Query, Tailwind, Lucide, vitest.

**Spec:** `docs/superpowers/specs/2026-09-30-discover-shelves-design.md`

## Global Constraints

- **Zero comments in generated code** (AGENTS.md "Code style"). Docstrings count as comments. Tool directives (`# noqa`, `// eslint-disable-next-line`) are the only exception.
- **A missing metric is stored as null, never zero.** No `or 0`, no default of `0` on any metric field.
- **Prices stay Saxo-only**; fundamentals come from Finnhub. No new price provider.
- **An instrument is a uic *and* an asset type** — store and pass both.
- Finnhub percentages are plain numbers (15 means 15%). Stored unchanged; shelf thresholds use the same units.
- Pace the scan at `PAUSE_SECONDS = 1.2` per symbol (≈50 Finnhub calls/min against a 60/min free tier).
- `STALE_AFTER = 36 hours`. Shelf card limit `20`.
- Frontend: `Card`/tokens from `components/ui.jsx`, the one gain/loss pair (`text-emerald-400` / `text-red-400` as `DayChange` uses), change always shown with its sign. `fmtMoney(value, 'USD')` for prices.
- A new migration is not done until `python manage.py migrate` has run against the dev database (AGENTS.md).
- Backend tests: `cd backend && source .venv/bin/activate && python manage.py test research core saxo`. Frontend tests: `cd frontend && npx vitest run`.
- Another session may be working on chart files on `main`. Do this work in a worktree on branch `feat/discover-shelves` (superpowers:using-git-worktrees). Touch no chart files.

## Deviations from the spec (decided while planning)

- **Not added to `SYNC_TASKS`.** `@synced` gains a `reports_health=False` mode instead. `SYNC_TASKS` feeds the header's Saxo sync-health badge; a Finnhub-key problem in a nightly scan must not turn "Saxo connected" amber. The scan still writes `SyncRun` rows (task `scan_universe`), which is what Discover's own health reads.
- **Saxo not connected skips the whole run**, fundamentals included (that is what `@synced` does). Rows keep their previous values and timestamps, which is the behaviour the spec cares about.
- **Finnhub not configured** (`FINNHUB_API_KEY` empty) disables the fundamentals step for the rest of that run; technicals still refresh and rows stay `ok`.

## Review Focus

1. **Class-share tickers** (`BRK.B`, `BF.B`): Saxo may spell them differently, so they may resolve to nothing. Expected: row becomes `unmatched`, is off every shelf, and the rest of the scan completes. Pinned in Task 4 (`test_unmatched_ticker_is_marked_and_skipped`).
2. **Recent listings with < 200 bars**: `ma200`, `pct_vs_ma200`, `change_1y` must be null — not computed over too few bars — so the stock is absent from 200-MA shelves rather than wrongly placed. Pinned in Task 1 (`test_short_history_leaves_long_lookbacks_null`).
3. **Negative or null P/E**: a loss-making company must never appear on "Cheap by P/E". Pinned in Task 5 (`test_cheap_pe_excludes_negative_and_null`).
4. **A ticker removed from the CSV**: its row must disappear on the next load so it stops appearing on shelves. Pinned in Task 2 (`test_ticker_removed_from_csv_is_deleted`).
5. **A failed latest run after an earlier success**: the page must say it failed, not show yesterday's date as if current. Pinned in Task 5 (`test_health_is_failed_when_latest_run_failed`).

---

## File Structure

Backend (`backend/research/`):
- `technicals.py` — pure indicator maths + `technical_fields(bars)`. No Django.
- `universe.csv` — the checked-in membership list.
- `universe.py` — `load_universe(path)` upserts/deletes `ScreenerRow`s.
- `models.py` — add `ScreenerRow`.
- `finnhub.py` — add `to_screener_fundamentals(financials)`.
- `scan.py` — `resolve`, `scan_row`, `scan_universe`: the per-symbol pipeline.
- `tasks.py` — add the `scan_universe` Celery task.
- `management/commands/load_universe.py`, `management/commands/scan_universe.py`.
- `shelves.py` — `Shelf`, `SHELVES`, `matching`, `card`.
- `discover.py` — `health`, `as_of`.
- `views.py` / `urls.py` — `DiscoverView`, `DiscoverShelfView`.
- Tests: `test_technicals.py`, `test_universe.py`, `test_scan.py`, `test_shelves.py`, `test_discover_views.py`.

Backend elsewhere: `saxo/tasks.py` (`synced` gains `reports_health`), `core/scheduling.py` + `core/migrations/0006_seed_discover_scan.py`.

Frontend (`frontend/src/`):
- `lib/fixtures/indicator-parity.json` — shared parity fixture (Task 1).
- `lib/discover.js` — metric formatting + health copy.
- `api/client/research.js`, `api/queries/research.js` — `getDiscover`, `getDiscoverShelf`, `useDiscover`, `useDiscoverShelf`.
- `components/discover/Sparkline.jsx`, `DiscoverCard.jsx`, `ShelfRow.jsx`, `DiscoverHealth.jsx`.
- `pages/Discover.jsx`, `pages/DiscoverShelf.jsx`; `App.jsx` routes; `components/Sidebar.jsx` nav entry.

---

### Task 1: Indicator maths in Python, parity-tested against `indicators.js`

**Files:**
- Create: `frontend/scripts/make-indicator-parity.mjs` (one-off generator, committed so the fixture is reproducible)
- Create: `frontend/src/lib/fixtures/indicator-parity.json` (generated)
- Create: `frontend/src/lib/indicatorParity.test.js`
- Create: `backend/research/technicals.py`
- Test: `backend/research/test_technicals.py`

**Interfaces:**
- Produces: `technicals.sma(values, period) -> list[float|None]`, `technicals.rsi(values, period=14) -> list[float|None]`, `technicals.relative_volume(bars, window=20) -> list[float|None]`, `technicals.technical_fields(bars) -> dict` with keys `last_close, change_1d, change_1m, change_3m, change_1y, ma50, ma200, pct_vs_ma200, rsi14, pct_from_52w_high, rvol, sparkline`. `bars` is a list of `{'date','open','high','low','close','volume'}` oldest first (the shape `market.chart` returns).

- [ ] **Step 1: Write the fixture generator**

`frontend/scripts/make-indicator-parity.mjs`:

```javascript
import { writeFileSync } from 'node:fs'
import { relativeVolume, rsi, sma } from '../src/lib/indicators.js'

const bars = Array.from({ length: 300 }, (_, i) => {
  const close = 100 + 10 * Math.sin(i / 7) + i * 0.1
  return {
    date: new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    open: close - 0.5,
    high: close + 1.5,
    low: close - 1.5,
    close,
    volume: i % 50 === 0 ? 0 : 1_000_000 + ((i * 7919) % 500_000),
  }
})
const closes = bars.map((bar) => bar.close)

writeFileSync(
  new URL('../src/lib/fixtures/indicator-parity.json', import.meta.url),
  `${JSON.stringify({ bars, expected: { sma50: sma(closes, 50), sma200: sma(closes, 200), rsi14: rsi(closes, 14), rvol: relativeVolume(bars, 20) } }, null, 1)}\n`,
)
```

- [ ] **Step 2: Generate the fixture**

Run: `cd frontend && mkdir -p src/lib/fixtures && node scripts/make-indicator-parity.mjs && head -c 200 src/lib/fixtures/indicator-parity.json`
Expected: JSON starting `{"bars": [` (pretty-printed).

- [ ] **Step 3: Write the frontend parity test**

`frontend/src/lib/indicatorParity.test.js`:

```javascript
import { describe, expect, it } from 'vitest'

import fixture from './fixtures/indicator-parity.json'
import { relativeVolume, rsi, sma } from './indicators'

const closes = fixture.bars.map((bar) => bar.close)

describe('indicator parity fixture', () => {
  it('still matches indicators.js, so the Python side is checked against live definitions', () => {
    expect(sma(closes, 50)).toEqual(fixture.expected.sma50)
    expect(sma(closes, 200)).toEqual(fixture.expected.sma200)
    expect(rsi(closes, 14)).toEqual(fixture.expected.rsi14)
    expect(relativeVolume(fixture.bars, 20)).toEqual(fixture.expected.rvol)
  })
})
```

Run: `cd frontend && npx vitest run src/lib/indicatorParity.test.js`
Expected: PASS.

- [ ] **Step 4: Write the failing Python tests**

`backend/research/test_technicals.py`:

```python
import json
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

from research import technicals

FIXTURE = Path(settings.BASE_DIR).parent / 'frontend' / 'src' / 'lib' / 'fixtures' / 'indicator-parity.json'


def bars_from(closes, volume=1_000_000):
    return [
        {'date': f'd{i}', 'open': c, 'high': c + 1, 'low': c - 1, 'close': c, 'volume': volume}
        for i, c in enumerate(closes)
    ]


class ParityTest(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.fixture = json.loads(FIXTURE.read_text())
        cls.closes = [bar['close'] for bar in cls.fixture['bars']]

    def assertSeriesEqual(self, actual, expected):
        self.assertEqual(len(actual), len(expected))
        for a, e in zip(actual, expected):
            if e is None:
                self.assertIsNone(a)
            else:
                self.assertAlmostEqual(a, e, places=9)

    def test_sma_matches_indicators_js(self):
        self.assertSeriesEqual(technicals.sma(self.closes, 50), self.fixture['expected']['sma50'])
        self.assertSeriesEqual(technicals.sma(self.closes, 200), self.fixture['expected']['sma200'])

    def test_rsi_matches_indicators_js(self):
        self.assertSeriesEqual(technicals.rsi(self.closes, 14), self.fixture['expected']['rsi14'])

    def test_relative_volume_matches_indicators_js(self):
        self.assertSeriesEqual(technicals.relative_volume(self.fixture['bars'], 20), self.fixture['expected']['rvol'])


class TechnicalFieldsTest(SimpleTestCase):
    def test_changes_are_percent_over_trading_sessions(self):
        fields = technicals.technical_fields(bars_from([100.0] * 252 + [110.0]))
        self.assertAlmostEqual(fields['change_1d'], 10.0)
        self.assertAlmostEqual(fields['change_1y'], 10.0)
        self.assertEqual(fields['last_close'], 110.0)

    def test_pct_vs_ma200_is_negative_below_the_average(self):
        fields = technicals.technical_fields(bars_from([100.0] * 199 + [90.0]))
        self.assertAlmostEqual(fields['ma200'], (100.0 * 199 + 90.0) / 200)
        self.assertLess(fields['pct_vs_ma200'], 0)

    def test_pct_from_52w_high_uses_the_highest_high(self):
        closes = [100.0] * 260
        closes[-10] = 150.0
        fields = technicals.technical_fields(bars_from(closes))
        self.assertAlmostEqual(fields['pct_from_52w_high'], (100.0 / 151.0 - 1) * 100)

    def test_short_history_leaves_long_lookbacks_null(self):
        fields = technicals.technical_fields(bars_from([100.0 + i for i in range(120)]))
        self.assertIsNone(fields['ma200'])
        self.assertIsNone(fields['pct_vs_ma200'])
        self.assertIsNone(fields['change_1y'])
        self.assertIsNotNone(fields['ma50'])
        self.assertIsNotNone(fields['change_3m'])

    def test_sparkline_is_the_last_63_closes(self):
        fields = technicals.technical_fields(bars_from([float(i) for i in range(100)]))
        self.assertEqual(fields['sparkline'], [float(i) for i in range(37, 100)])

    def test_no_bars_gives_every_field_null(self):
        fields = technicals.technical_fields([])
        self.assertEqual(fields['sparkline'], [])
        self.assertTrue(all(value is None for key, value in fields.items() if key != 'sparkline'))
```

- [ ] **Step 5: Run to verify failure**

Run: `cd backend && source .venv/bin/activate && python manage.py test research.test_technicals`
Expected: FAIL — `ImportError: cannot import name 'technicals'`.

- [ ] **Step 6: Implement `technicals.py`**

`backend/research/technicals.py`:

```python
RSI_PERIOD = 14
RVOL_WINDOW = 20
YEAR_SESSIONS = 252
SPARKLINE_LENGTH = 63
CHANGE_SESSIONS = {'change_1d': 1, 'change_1m': 21, 'change_3m': 63, 'change_1y': 252}


def sma(values, period):
    out = [None] * len(values)
    total = 0.0
    for i, value in enumerate(values):
        total += value
        if i >= period:
            total -= values[i - period]
        if i >= period - 1:
            out[i] = total / period
    return out


def rsi(values, period=RSI_PERIOD):
    out = [None] * len(values)
    gain = 0.0
    loss = 0.0
    for i in range(1, len(values)):
        change = values[i] - values[i - 1]
        up = max(0.0, change)
        down = max(0.0, -change)
        if i <= period:
            gain += up / period
            loss += down / period
            if i == period:
                out[i] = 100 - 100 / (1 + gain / (loss or 1e-9))
        else:
            gain = (gain * (period - 1) + up) / period
            loss = (loss * (period - 1) + down) / period
            out[i] = 100 - 100 / (1 + gain / (loss or 1e-9))
    return out


def relative_volume(bars, window=RVOL_WINDOW):
    min_samples = -(-window * 3 // 4)
    out = []
    for i, bar in enumerate(bars):
        volume = bar.get('volume') or 0
        if not volume > 0:
            out.append(None)
            continue
        prior = [b['volume'] for b in bars[max(0, i - window):i] if (b.get('volume') or 0) > 0]
        if len(prior) < min_samples:
            out.append(None)
            continue
        out.append(volume / (sum(prior) / len(prior)))
    return out


def _last(series):
    return series[-1] if series else None


def _pct(numerator, denominator):
    if numerator is None or not denominator:
        return None
    return (numerator / denominator - 1) * 100


def technical_fields(bars):
    closes = [bar['close'] for bar in bars]
    last_close = closes[-1] if closes else None
    ma50 = _last(sma(closes, 50))
    ma200 = _last(sma(closes, 200))
    year = bars[-YEAR_SESSIONS:]
    high = max((bar['high'] for bar in year), default=None)

    fields = {
        'last_close': last_close,
        'ma50': ma50,
        'ma200': ma200,
        'pct_vs_ma200': _pct(last_close, ma200),
        'rsi14': _last(rsi(closes)),
        'pct_from_52w_high': _pct(last_close, high),
        'rvol': _last(relative_volume(bars)),
        'sparkline': closes[-SPARKLINE_LENGTH:],
    }
    for name, sessions in CHANGE_SESSIONS.items():
        fields[name] = _pct(last_close, closes[-1 - sessions]) if len(closes) > sessions else None
    return fields
```

Note on `min_samples`: JS uses `Math.ceil(window * 0.75)`; `-(-window * 3 // 4)` is the integer ceiling of the same value (15 for 20).

- [ ] **Step 7: Run tests**

Run: `cd backend && python manage.py test research.test_technicals`
Expected: PASS (9 tests).

- [ ] **Step 8: Commit**

```bash
git add frontend/scripts/make-indicator-parity.mjs frontend/src/lib/fixtures/indicator-parity.json frontend/src/lib/indicatorParity.test.js backend/research/technicals.py backend/research/test_technicals.py
git commit -m "feat: indicator maths in Python, parity-tested against indicators.js"
```

---

### Task 2: `ScreenerRow`, the universe CSV and its loader

**Files:**
- Modify: `backend/research/models.py` (append `ScreenerRow`)
- Create: `backend/research/migrations/0008_screenerrow.py` (via `makemigrations`; use the next free number if 0008 is taken)
- Create: `backend/research/universe.csv`
- Create: `backend/research/universe.py`
- Create: `backend/research/management/__init__.py`, `backend/research/management/commands/__init__.py`, `backend/research/management/commands/load_universe.py`
- Test: `backend/research/test_universe.py`

**Interfaces:**
- Produces: `research.models.ScreenerRow` with constants `ScreenerRow.OK = 'ok'`, `ScreenerRow.UNMATCHED = 'unmatched'`, `ScreenerRow.FAILED = 'failed'`; fields listed below; `TECHNICAL_FIELDS` and `FUNDAMENTAL_FIELDS` tuples in `research.models`.
- Produces: `research.universe.load_universe(path=UNIVERSE_CSV) -> dict` with keys `created`, `updated`, `removed`.

- [ ] **Step 1: Write the failing tests**

`backend/research/test_universe.py`:

```python
import tempfile
from pathlib import Path

from django.test import TestCase

from research.models import ScreenerRow
from research.universe import UNIVERSE_CSV, load_universe

HEADER = 'ticker,name,sector,indexes\n'


def csv_file(body):
    handle = tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False)
    handle.write(HEADER + body)
    handle.close()
    return Path(handle.name)


class LoadUniverseTest(TestCase):
    def test_creates_one_row_per_ticker(self):
        result = load_universe(csv_file('AAPL,Apple Inc.,Information Technology,SP500|NDX\nKO,Coca-Cola,Consumer Staples,SP500\n'))
        self.assertEqual(result, {'created': 2, 'updated': 0, 'removed': 0})
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual(apple.indexes, 'SP500|NDX')
        self.assertIsNone(apple.uic)
        self.assertEqual(apple.status, ScreenerRow.UNMATCHED)

    def test_reload_updates_names_without_touching_resolution(self):
        load_universe(csv_file('AAPL,Apple,Information Technology,SP500\n'))
        ScreenerRow.objects.filter(ticker='AAPL').update(uic=211, status=ScreenerRow.OK, rsi14=55.0)
        result = load_universe(csv_file('AAPL,Apple Inc.,Information Technology,SP500|NDX\n'))
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual(result['updated'], 1)
        self.assertEqual((apple.name, apple.indexes, apple.uic, apple.rsi14), ('Apple Inc.', 'SP500|NDX', 211, 55.0))

    def test_ticker_removed_from_csv_is_deleted(self):
        load_universe(csv_file('AAPL,Apple,IT,SP500\nKO,Coca-Cola,Staples,SP500\n'))
        result = load_universe(csv_file('AAPL,Apple,IT,SP500\n'))
        self.assertEqual(result['removed'], 1)
        self.assertFalse(ScreenerRow.objects.filter(ticker='KO').exists())

    def test_tickers_are_stripped_and_uppercased(self):
        load_universe(csv_file(' brk.b ,Berkshire Hathaway,Financials,SP500\n'))
        self.assertTrue(ScreenerRow.objects.filter(ticker='BRK.B').exists())

    def test_checked_in_universe_is_large_and_unique(self):
        load_universe(UNIVERSE_CSV)
        self.assertGreater(ScreenerRow.objects.count(), 480)
        self.assertTrue(ScreenerRow.objects.filter(indexes__contains='NDX').exists())
        self.assertTrue(ScreenerRow.objects.filter(ticker='AAPL', indexes='SP500|NDX').exists())
```

- [ ] **Step 2: Run to verify failure**

Run: `python manage.py test research.test_universe`
Expected: FAIL — `ImportError: cannot import name 'ScreenerRow'`.

- [ ] **Step 3: Add the model**

Append to `backend/research/models.py`:

```python
TECHNICAL_FIELDS = (
    'last_close', 'change_1d', 'change_1m', 'change_3m', 'change_1y',
    'ma50', 'ma200', 'pct_vs_ma200', 'rsi14', 'pct_from_52w_high', 'rvol', 'sparkline',
)
FUNDAMENTAL_FIELDS = (
    'pe', 'forward_pe', 'roe', 'net_margin', 'eps_growth_5y',
    'debt_to_equity', 'dividend_yield', 'market_cap',
)


class ScreenerRow(models.Model):
    OK = 'ok'
    UNMATCHED = 'unmatched'
    FAILED = 'failed'
    STATUS_CHOICES = [(OK, 'OK'), (UNMATCHED, 'Unmatched'), (FAILED, 'Failed')]

    ticker = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=120)
    sector = models.CharField(max_length=60, blank=True, default='')
    indexes = models.CharField(max_length=20)
    uic = models.PositiveIntegerField(null=True, blank=True)
    asset_type = models.CharField(max_length=20, default='Stock')

    last_close = models.FloatField(null=True, blank=True)
    change_1d = models.FloatField(null=True, blank=True)
    change_1m = models.FloatField(null=True, blank=True)
    change_3m = models.FloatField(null=True, blank=True)
    change_1y = models.FloatField(null=True, blank=True)
    ma50 = models.FloatField(null=True, blank=True)
    ma200 = models.FloatField(null=True, blank=True)
    pct_vs_ma200 = models.FloatField(null=True, blank=True)
    rsi14 = models.FloatField(null=True, blank=True)
    pct_from_52w_high = models.FloatField(null=True, blank=True)
    rvol = models.FloatField(null=True, blank=True)
    sparkline = models.JSONField(default=list, blank=True)

    pe = models.FloatField(null=True, blank=True)
    forward_pe = models.FloatField(null=True, blank=True)
    roe = models.FloatField(null=True, blank=True)
    net_margin = models.FloatField(null=True, blank=True)
    eps_growth_5y = models.FloatField(null=True, blank=True)
    debt_to_equity = models.FloatField(null=True, blank=True)
    dividend_yield = models.FloatField(null=True, blank=True)
    market_cap = models.FloatField(null=True, blank=True)

    technicals_at = models.DateTimeField(null=True, blank=True)
    fundamentals_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=UNMATCHED)
    error = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        ordering = ['ticker']

    def __str__(self):
        return self.ticker
```

- [ ] **Step 4: Make and apply the migration (test DB and dev DB)**

Run: `python manage.py makemigrations research -n screenerrow && python manage.py migrate`
Expected: `Applying research.0008_screenerrow... OK` (number may differ).

- [ ] **Step 5: Build `universe.csv`**

One-off, not committed. S&P 500 from the datahub dataset, Nasdaq-100 from Wikipedia:

```bash
cd backend && uv run --with pandas --with lxml --with requests python - <<'EOF'
import io, csv, requests, pandas as pd
sp = pd.read_csv('https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv')
html = requests.get('https://en.wikipedia.org/wiki/Nasdaq-100', headers={'User-Agent': 'saxodash-universe'}).text
ndx = next(t for t in pd.read_html(io.StringIO(html)) if 'Ticker' in t.columns)
rows = {}
for _, r in sp.iterrows():
    rows[r['Symbol'].strip().upper()] = {'name': r['Security'], 'sector': r['GICS Sector'], 'indexes': ['SP500']}
for _, r in ndx.iterrows():
    t = str(r['Ticker']).strip().upper()
    entry = rows.setdefault(t, {'name': r.get('Company', t), 'sector': r.get('GICS Sector', ''), 'indexes': []})
    entry['indexes'].append('NDX')
with open('research/universe.csv', 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['ticker', 'name', 'sector', 'indexes'])
    for t in sorted(rows):
        w.writerow([t, rows[t]['name'], rows[t]['sector'], '|'.join(rows[t]['indexes'])])
print(len(rows))
EOF
```

Expected: prints ~515–525. Spot-check: `grep -E '^(AAPL|KO|BRK.B),' research/universe.csv` shows `AAPL,…,SP500|NDX`, `KO,…,SP500`, `BRK.B,…,SP500`. If a column name differs on Wikipedia, adjust the one-off script (it is throwaway), not the loader.

- [ ] **Step 6: Implement the loader and command**

`backend/research/universe.py`:

```python
import csv
from pathlib import Path

from django.db import transaction

from .models import ScreenerRow

UNIVERSE_CSV = Path(__file__).resolve().parent / 'universe.csv'


@transaction.atomic
def load_universe(path=UNIVERSE_CSV):
    with open(path, newline='') as handle:
        entries = {
            row['ticker'].strip().upper(): row
            for row in csv.DictReader(handle)
            if row['ticker'].strip()
        }

    existing = {row.ticker: row for row in ScreenerRow.objects.all()}
    created = updated = 0
    for ticker, entry in entries.items():
        values = {
            'name': entry['name'].strip(),
            'sector': (entry.get('sector') or '').strip(),
            'indexes': entry['indexes'].strip(),
        }
        row = existing.get(ticker)
        if row is None:
            ScreenerRow.objects.create(ticker=ticker, **values)
            created += 1
        elif any(getattr(row, field) != value for field, value in values.items()):
            ScreenerRow.objects.filter(pk=row.pk).update(**values)
            updated += 1

    removed, _ = ScreenerRow.objects.exclude(ticker__in=entries).delete()
    return {'created': created, 'updated': updated, 'removed': removed}
```

An unchanged row counts as neither created nor updated.

`backend/research/management/__init__.py` and `backend/research/management/commands/__init__.py`: empty files.

`backend/research/management/commands/load_universe.py`:

```python
from django.core.management.base import BaseCommand

from research.universe import load_universe


class Command(BaseCommand):
    help = 'Load research/universe.csv into ScreenerRow.'

    def handle(self, *args, **options):
        result = load_universe()
        self.stdout.write(f"created {result['created']}, updated {result['updated']}, removed {result['removed']}")
```

- [ ] **Step 7: Run tests**

Run: `python manage.py test research.test_universe`
Expected: PASS (5 tests).

- [ ] **Step 8: Load the dev database**

Run: `python manage.py load_universe`
Expected: `created ~520, updated 0, removed 0`.

- [ ] **Step 9: Commit**

```bash
git add backend/research/models.py backend/research/migrations/ backend/research/universe.csv backend/research/universe.py backend/research/management backend/research/test_universe.py
git commit -m "feat: ScreenerRow and the S&P 500 + Nasdaq-100 universe loader"
```

---

### Task 3: Finnhub fundamentals shaped for the screener

**Files:**
- Modify: `backend/research/finnhub.py` (add `SCREENER_METRICS` and `to_screener_fundamentals` after `_metric`)
- Test: `backend/research/test_fundamentals_shaping.py` (append a class)

**Interfaces:**
- Consumes: `finnhub._metric(financials, key)` (existing; reads `financials['metric'][key]`).
- Produces: `finnhub.to_screener_fundamentals(financials) -> dict` with exactly the keys of `research.models.FUNDAMENTAL_FIELDS`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/research/test_fundamentals_shaping.py`:

```python
class ScreenerFundamentalsTest(SimpleTestCase):
    def test_maps_every_screener_metric(self):
        financials = {'metric': {
            'peNormalizedAnnual': 24.5, 'forwardPE': 21.0, 'roeTTM': 31.2,
            'netProfitMarginTTM': 18.4, 'epsGrowth5Y': 12.0,
            'totalDebt/totalEquityAnnual': 0.8, 'dividendYieldIndicatedAnnual': 1.1,
            'marketCapitalization': 250000.0,
        }}
        self.assertEqual(finnhub.to_screener_fundamentals(financials), {
            'pe': 24.5, 'forward_pe': 21.0, 'roe': 31.2, 'net_margin': 18.4,
            'eps_growth_5y': 12.0, 'debt_to_equity': 0.8, 'dividend_yield': 1.1,
            'market_cap': 250000.0,
        })

    def test_missing_metrics_are_null_not_zero(self):
        shaped = finnhub.to_screener_fundamentals({'metric': {'peNormalizedAnnual': 10.0}})
        self.assertEqual(shaped['pe'], 10.0)
        self.assertIsNone(shaped['roe'])
        self.assertIsNone(shaped['market_cap'])

    def test_empty_payload_is_all_null(self):
        self.assertTrue(all(v is None for v in finnhub.to_screener_fundamentals({}).values()))
```

If `SimpleTestCase` or `finnhub` is not already imported at the top of that file, add `from django.test import SimpleTestCase` / `from research import finnhub`.

- [ ] **Step 2: Run to verify failure**

Run: `python manage.py test research.test_fundamentals_shaping`
Expected: FAIL — `AttributeError: module 'research.finnhub' has no attribute 'to_screener_fundamentals'`.

- [ ] **Step 3: Implement**

In `backend/research/finnhub.py`, directly after `_metric`:

```python
SCREENER_METRICS = {
    'pe': 'peNormalizedAnnual',
    'forward_pe': 'forwardPE',
    'roe': 'roeTTM',
    'net_margin': 'netProfitMarginTTM',
    'eps_growth_5y': 'epsGrowth5Y',
    'debt_to_equity': 'totalDebt/totalEquityAnnual',
    'dividend_yield': 'dividendYieldIndicatedAnnual',
    'market_cap': 'marketCapitalization',
}


def to_screener_fundamentals(financials):
    return {field: _metric(financials, key) for field, key in SCREENER_METRICS.items()}
```

- [ ] **Step 4: Run tests**

Run: `python manage.py test research.test_fundamentals_shaping`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/research/finnhub.py backend/research/test_fundamentals_shaping.py
git commit -m "feat: shape Finnhub basic financials for the screener"
```

---

### Task 4: The scan pipeline, its Celery task, command and schedule

**Files:**
- Modify: `backend/saxo/tasks.py` (`synced` gains `reports_health`)
- Create: `backend/research/scan.py`
- Modify: `backend/research/tasks.py` (add `scan_universe` task)
- Create: `backend/research/management/commands/scan_universe.py`
- Modify: `backend/core/scheduling.py` (add the schedule entry)
- Create: `backend/core/migrations/0006_seed_discover_scan.py` (use next free number)
- Test: `backend/research/test_scan.py`, `backend/core/test_scheduling.py` (append one test), `backend/saxo/` existing tests must stay green

**Interfaces:**
- Consumes: `market.search(keywords, asset_types) -> list[{'symbol','uic','asset_type','exchange','currency',…}]`, `market.chart(uic, asset_type, horizon, count) -> list[bar]`, `finnhub.get_basic_financials(symbol) -> dict`, `finnhub.to_screener_fundamentals`, `finnhub.FinnhubNotConfigured`, `technicals.technical_fields`, `ScreenerRow`, `TECHNICAL_FIELDS`, `FUNDAMENTAL_FIELDS`.
- Produces: `scan.scan_universe(pause=time.sleep) -> int` (count of `ok` rows); `scan.resolve(ticker) -> dict | None`; `scan.SCAN_TASK = 'scan_universe'`; Celery task `research.tasks.scan_universe`; `saxo.tasks.synced(fn=None, *, reports_health=True)`.

- [ ] **Step 1: Write the failing `synced` test**

Find the existing `synced` tests: `grep -rn "synced" backend/saxo/test*.py | head`. Append to that file (inside a `TestCase` subclass; reuse its credential fixture helper — if it has none, create one with `SaxoCredential.objects.create(...)` exactly as the neighbouring tests do):

```python
    def test_synced_without_health_accepts_an_undeclared_task_and_records_runs(self):
        from saxo.tasks import synced

        @synced(reports_health=False)
        def scan_something(credential):
            return 3

        self.assertEqual(scan_something(), 3)
        self.assertTrue(SyncRun.objects.filter(task='scan_something', outcome='ok', rows=3).exists())

    def test_synced_with_health_still_rejects_an_undeclared_task(self):
        from saxo.tasks import synced

        with self.assertRaises(ValueError):
            @synced
            def not_declared(credential):
                return 0
```

The first test needs a usable credential in the DB; place it in the class that already sets one up.

- [ ] **Step 2: Run to verify failure**

Run: `python manage.py test saxo`
Expected: the new "without health" test FAILS (`TypeError` — `synced()` got an unexpected keyword argument).

- [ ] **Step 3: Extend `synced`**

In `backend/saxo/tasks.py`, change the signature and the guard only; keep the body and its existing docstring/comments as they are:

```python
def synced(fn=None, *, reports_health=True):
    if fn is None:
        return functools.partial(synced, reports_health=reports_health)
    if reports_health and fn.__name__ not in SYNC_TASKS:
        raise ValueError(f'{fn.__name__} is not declared in saxo.credentials.SYNC_TASKS')
```

(The existing docstring stays directly under the `def` line, as today.)

Run: `python manage.py test saxo`
Expected: PASS.

- [ ] **Step 4: Write the failing scan tests**

`backend/research/test_scan.py`:

```python
from unittest import mock

from django.test import TestCase

from research import scan
from research.finnhub import FinnhubAPIError, FinnhubNotConfigured
from research.models import ScreenerRow
from research.providers import ProviderError, ProviderNotConnected

BARS = [
    {'date': f'2025-{i:04d}', 'open': 100.0, 'high': 101.0, 'low': 99.0, 'close': 100.0 + i * 0.1, 'volume': 1_000_000}
    for i in range(260)
]
FINANCIALS = {'metric': {'peNormalizedAnnual': 20.0, 'roeTTM': 25.0}}


def instrument(symbol, uic, exchange='NASDAQ', currency='USD'):
    return {'symbol': symbol, 'uic': uic, 'asset_type': 'Stock', 'exchange': exchange, 'currency': currency, 'description': symbol}


def no_pause(_seconds):
    return None


class ResolveTest(TestCase):
    @mock.patch('research.scan.market.search')
    def test_prefers_the_us_primary_listing(self, search):
        search.return_value = [instrument('NVDA', 1, 'XETR', 'EUR'), instrument('NVDA', 2, 'NASDAQ')]
        self.assertEqual(scan.resolve('NVDA')['uic'], 2)
        search.assert_called_once_with('NVDA', 'Stock')

    @mock.patch('research.scan.market.search')
    def test_ignores_a_different_symbol(self, search):
        search.return_value = [instrument('NVDX', 3)]
        self.assertIsNone(scan.resolve('NVDA'))


@mock.patch('research.scan.finnhub.get_basic_financials', return_value=FINANCIALS)
@mock.patch('research.scan.market.chart', return_value=BARS)
@mock.patch('research.scan.market.search')
class ScanUniverseTest(TestCase):
    def setUp(self):
        ScreenerRow.objects.create(ticker='AAPL', name='Apple', indexes='SP500|NDX')
        ScreenerRow.objects.create(ticker='BRK.B', name='Berkshire', indexes='SP500')

    def search_for(self, search, known):
        search.side_effect = lambda ticker, _types: [instrument(ticker, known[ticker])] if ticker in known else []

    def test_resolves_and_fills_technicals_and_fundamentals(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        self.assertEqual(scan.scan_universe(pause=no_pause), 2)
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual((apple.uic, apple.asset_type, apple.status), (211, 'Stock', ScreenerRow.OK))
        self.assertIsNotNone(apple.rsi14)
        self.assertEqual(apple.pe, 20.0)
        self.assertIsNone(apple.net_margin)
        self.assertIsNotNone(apple.technicals_at)
        self.assertIsNotNone(apple.fundamentals_at)
        chart.assert_any_call(211, 'Stock', scan.DAILY_HORIZON, scan.CHART_BARS)

    def test_unmatched_ticker_is_marked_and_skipped(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211})
        self.assertEqual(scan.scan_universe(pause=no_pause), 1)
        berkshire = ScreenerRow.objects.get(ticker='BRK.B')
        self.assertEqual(berkshire.status, ScreenerRow.UNMATCHED)
        self.assertIsNone(berkshire.rsi14)

    def test_resolved_uic_is_reused_without_searching(self, search, chart, financials):
        ScreenerRow.objects.filter(ticker='AAPL').update(uic=211)
        ScreenerRow.objects.filter(ticker='BRK.B').delete()
        scan.scan_universe(pause=no_pause)
        search.assert_not_called()

    def test_one_failing_symbol_does_not_stop_the_run(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})

        def chart_for(uic, *_):
            if uic == 211:
                raise RuntimeError('boom')
            return BARS

        chart.side_effect = chart_for
        self.assertEqual(scan.scan_universe(pause=no_pause), 1)
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual(apple.status, ScreenerRow.FAILED)
        self.assertIn('boom', apple.error)
        self.assertEqual(ScreenerRow.objects.get(ticker='BRK.B').status, ScreenerRow.OK)

    def test_finnhub_error_keeps_previous_fundamentals(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        ScreenerRow.objects.filter(ticker='AAPL').update(pe=15.0)
        financials.side_effect = FinnhubAPIError()
        scan.scan_universe(pause=no_pause)
        apple = ScreenerRow.objects.get(ticker='AAPL')
        self.assertEqual(apple.status, ScreenerRow.OK)
        self.assertEqual(apple.pe, 15.0)
        self.assertIsNone(apple.fundamentals_at)

    def test_finnhub_not_configured_stops_asking_for_the_rest_of_the_run(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        financials.side_effect = FinnhubNotConfigured()
        self.assertEqual(scan.scan_universe(pause=no_pause), 2)
        self.assertEqual(financials.call_count, 1)

    def test_a_search_error_fails_only_that_symbol(self, search, chart, financials):
        def search_for(ticker, _types):
            if ticker == 'AAPL':
                raise ProviderError('Saxo could not serve this request.')
            return [instrument(ticker, 212)]

        search.side_effect = search_for
        self.assertEqual(scan.scan_universe(pause=no_pause), 1)
        self.assertEqual(ScreenerRow.objects.get(ticker='AAPL').status, ScreenerRow.FAILED)

    def test_losing_the_saxo_connection_mid_run_stops_the_run(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        chart.side_effect = ProviderNotConnected('Saxo is not connected.')
        with self.assertRaises(ProviderNotConnected):
            scan.scan_universe(pause=no_pause)
        self.assertFalse(ScreenerRow.objects.filter(status=ScreenerRow.FAILED).exists())

    def test_pauses_between_symbols(self, search, chart, financials):
        self.search_for(search, {'AAPL': 211, 'BRK.B': 212})
        pauses = []
        scan.scan_universe(pause=pauses.append)
        self.assertEqual(pauses, [scan.PAUSE_SECONDS, scan.PAUSE_SECONDS])
```

`FinnhubAPIError()` / `FinnhubNotConfigured()` — check their `__init__` in `research/finnhub.py`; if one requires an argument, pass what it expects.

- [ ] **Step 5: Run to verify failure**

Run: `python manage.py test research.test_scan`
Expected: FAIL — `ImportError: cannot import name 'scan'`.

- [ ] **Step 6: Implement `scan.py`**

`backend/research/scan.py`:

```python
import logging
import time

from django.utils import timezone

from . import finnhub, market, technicals
from .models import ScreenerRow
from .providers import ProviderNotConnected, ProviderUnavailable

logger = logging.getLogger(__name__)

SCAN_TASK = 'scan_universe'
DAILY_HORIZON = 1440
CHART_BARS = 260
PAUSE_SECONDS = 1.2
US_EXCHANGES = ('NASDAQ', 'NYSE')


def resolve(ticker):
    matches = [
        found for found in market.search(ticker, 'Stock')
        if found['symbol'].upper() == ticker and found.get('currency') == 'USD'
    ]
    preferred = [found for found in matches if found.get('exchange') in US_EXCHANGES]
    return (preferred or matches or [None])[0]


def _refresh_technicals(row):
    bars = market.chart(row.uic, row.asset_type, DAILY_HORIZON, CHART_BARS)
    for field, value in technicals.technical_fields(bars).items():
        setattr(row, field, value)
    row.technicals_at = timezone.now()


def _refresh_fundamentals(row):
    shaped = finnhub.to_screener_fundamentals(finnhub.get_basic_financials(row.ticker))
    for field, value in shaped.items():
        setattr(row, field, value)
    row.fundamentals_at = timezone.now()


def _resolved(row):
    if row.uic is not None:
        return True
    found = resolve(row.ticker)
    if found is None:
        return False
    row.uic = found['uic']
    row.asset_type = found['asset_type']
    return True


def scan_row(row, *, with_fundamentals):
    try:
        if not _resolved(row):
            row.status = ScreenerRow.UNMATCHED
            row.error = ''
            row.save()
            return with_fundamentals
        _refresh_technicals(row)
    except ProviderNotConnected:
        raise
    except Exception as exc:
        logger.warning('Scan failed for %s', row.ticker, exc_info=True)
        row.status = ScreenerRow.FAILED
        row.error = str(exc)[:200]
        row.save()
        return with_fundamentals

    row.status = ScreenerRow.OK
    row.error = ''
    if with_fundamentals:
        try:
            _refresh_fundamentals(row)
        except finnhub.FinnhubNotConfigured:
            with_fundamentals = False
        except ProviderUnavailable as exc:
            row.error = str(exc)[:200]
    row.save()
    return with_fundamentals


def scan_universe(pause=time.sleep):
    with_fundamentals = True
    for row in ScreenerRow.objects.order_by('ticker'):
        with_fundamentals = scan_row(row, with_fundamentals=with_fundamentals)
        pause(PAUSE_SECONDS)
    return ScreenerRow.objects.filter(status=ScreenerRow.OK).count()
```

`FinnhubNotConfigured` subclasses `ProviderUnavailable`, so its `except` must come first (as written). A `ProviderNotConnected` mid-run is the one error that stops the run: it propagates out of `scan_universe` and `@synced` records the run as `failed`. Every other error, including a failed search, fails only that row.

- [ ] **Step 7: Run tests**

Run: `python manage.py test research.test_scan`
Expected: PASS (11 tests).

- [ ] **Step 8: Add the Celery task and command**

Append to `backend/research/tasks.py` (add `from saxo.tasks import synced` and `from . import scan` to its imports):

```python
@shared_task
@synced(reports_health=False)
def scan_universe(credential):
    return scan.scan_universe()
```

`backend/research/management/commands/scan_universe.py`:

```python
from django.core.management.base import BaseCommand

from research.tasks import scan_universe


class Command(BaseCommand):
    help = 'Scan the Discover universe now (resolve, technicals, fundamentals).'

    def handle(self, *args, **options):
        rows = scan_universe()
        self.stdout.write('skipped: Saxo not connected' if rows is None else f'{rows} rows ok')
```

Check `research/tasks.py` still imports cleanly: `python -c "import django; django.setup()"` is not needed — run `python manage.py check`. Expected: `System check identified no issues`.

- [ ] **Step 9: Schedule it — failing test first**

Append to `backend/core/test_scheduling.py` inside `SyncPeriodicTasksTest`:

```python
    def test_discover_scan_runs_nightly_after_the_us_close(self):
        sync_periodic_tasks()
        task = PeriodicTask.objects.get(name='Scan Discover universe')
        self.assertEqual(task.task, 'research.tasks.scan_universe')
        self.assertEqual((task.crontab.minute, task.crontab.hour), ('30', '22'))
```

Run: `python manage.py test core.test_scheduling`
Expected: FAIL — `PeriodicTask.DoesNotExist`.

Add to `PERIODIC_TASKS` in `backend/core/scheduling.py`:

```python
    'Scan Discover universe': {
        'task': 'research.tasks.scan_universe',
        'crontab': {'minute': '30', 'hour': '22'},
    },
```

`backend/core/migrations/0006_seed_discover_scan.py` (confirm `0005_seed_periodic_tasks` is still the latest core migration; if not, depend on the latest):

```python
from django.db import migrations


def seed(apps, schema_editor):
    from core.scheduling import sync_periodic_tasks
    sync_periodic_tasks(apps=apps)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0005_seed_periodic_tasks'),
    ]

    operations = [
        migrations.RunPython(seed, noop),
    ]
```

Run: `python manage.py test core.test_scheduling && python manage.py migrate`
Expected: PASS, then `Applying core.0006_seed_discover_scan... OK`.

- [ ] **Step 10: Full backend suite**

Run: `python manage.py test`
Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/saxo/tasks.py backend/saxo/test*.py backend/research/scan.py backend/research/tasks.py backend/research/management/commands/scan_universe.py backend/research/test_scan.py backend/core/scheduling.py backend/core/migrations/0006_seed_discover_scan.py backend/core/test_scheduling.py
git commit -m "feat: nightly Discover scan - resolve, technicals from Saxo, fundamentals from Finnhub"
```

---

### Task 5: Shelves, health and the two endpoints

**Files:**
- Create: `backend/research/shelves.py`
- Create: `backend/research/discover.py`
- Modify: `backend/research/views.py` (add two views), `backend/research/urls.py` (two routes)
- Test: `backend/research/test_shelves.py`, `backend/research/test_discover_views.py`

**Interfaces:**
- Consumes: `ScreenerRow`, `saxo.models.SyncRun`, `scan.SCAN_TASK`.
- Produces: `shelves.SHELVES` (tuple of `Shelf`), `shelves.by_key(key) -> Shelf | None`, `shelves.matching(shelf) -> QuerySet`, `shelves.card(row, shelf) -> dict`; `discover.health(now=None) -> {'state', 'last_run_at'}`, `discover.as_of() -> datetime | None`. Endpoints `GET /api/research/discover/` and `GET /api/research/discover/<key>/` with the JSON documented in the spec.

- [ ] **Step 1: Write the failing shelf tests**

`backend/research/test_shelves.py`:

```python
from django.test import TestCase

from research import shelves
from research.models import ScreenerRow


def row(ticker, **fields):
    return ScreenerRow.objects.create(ticker=ticker, name=ticker, indexes='SP500', uic=len(ticker) * 1000 + ord(ticker[0]), status=fields.pop('status', ScreenerRow.OK), **fields)


def tickers(key):
    return [r.ticker for r in shelves.matching(shelves.by_key(key))]


class ShelfRulesTest(TestCase):
    def test_overbought_threshold_is_inclusive_and_sorted_high_first(self):
        row('AAA', rsi14=70.0)
        row('BBB', rsi14=85.0)
        row('CCC', rsi14=69.9)
        self.assertEqual(tickers('overbought'), ['BBB', 'AAA'])

    def test_oversold(self):
        row('AAA', rsi14=30.0)
        row('BBB', rsi14=12.0)
        row('CCC', rsi14=31.0)
        self.assertEqual(tickers('oversold'), ['BBB', 'AAA'])

    def test_quality_on_sale_needs_every_condition(self):
        row('GOOD', roe=20.0, net_margin=15.0, eps_growth_5y=8.0, pct_vs_ma200=-6.0)
        row('DEEP', roe=20.0, net_margin=15.0, eps_growth_5y=8.0, pct_vs_ma200=-12.0)
        row('ABOVE', roe=20.0, net_margin=15.0, eps_growth_5y=8.0, pct_vs_ma200=4.0)
        row('THIN', roe=20.0, net_margin=5.0, eps_growth_5y=8.0, pct_vs_ma200=-6.0)
        row('NOROE', net_margin=15.0, eps_growth_5y=8.0, pct_vs_ma200=-6.0)
        self.assertEqual(tickers('quality-on-sale'), ['DEEP', 'GOOD'])

    def test_strong_trend_needs_stacked_averages(self):
        row('UP', last_close=120.0, ma50=110.0, ma200=100.0, change_3m=15.0)
        row('UP2', last_close=120.0, ma50=110.0, ma200=100.0, change_3m=25.0)
        row('MIXED', last_close=105.0, ma50=110.0, ma200=100.0, change_3m=30.0)
        row('YOUNG', last_close=120.0, ma50=110.0, change_3m=40.0)
        self.assertEqual(tickers('strong-trend'), ['UP2', 'UP'])

    def test_near_high(self):
        row('AT', pct_from_52w_high=0.0)
        row('NEAR', pct_from_52w_high=-3.0)
        row('FAR', pct_from_52w_high=-3.1)
        self.assertEqual(tickers('near-high'), ['AT', 'NEAR'])

    def test_cheap_pe_excludes_negative_and_null(self):
        row('CHEAP', pe=9.0)
        row('CHEAPER', pe=6.0)
        row('LOSS', pe=-4.0)
        row('PRICEY', pe=15.0)
        row('NONE')
        self.assertEqual(tickers('cheap-pe'), ['CHEAPER', 'CHEAP'])

    def test_unusual_volume(self):
        row('HOT', rvol=3.5)
        row('WARM', rvol=2.0)
        row('COLD', rvol=1.9)
        self.assertEqual(tickers('unusual-volume'), ['HOT', 'WARM'])

    def test_only_ok_rows_qualify(self):
        row('OK', rsi14=80.0)
        row('BAD', rsi14=90.0, status=ScreenerRow.FAILED)
        row('LOST', rsi14=95.0, status=ScreenerRow.UNMATCHED)
        self.assertEqual(tickers('overbought'), ['OK'])

    def test_card_carries_the_shelf_metric(self):
        apple = row('AAPL', rsi14=77.0, last_close=230.0, change_1d=1.2, sparkline=[1.0, 2.0])
        self.assertEqual(shelves.card(apple, shelves.by_key('overbought')), {
            'ticker': 'AAPL', 'name': 'AAPL', 'uic': apple.uic, 'asset_type': 'Stock',
            'last_close': 230.0, 'change_1d': 1.2, 'metric_value': 77.0, 'sparkline': [1.0, 2.0],
        })

    def test_every_shelf_key_is_unique_and_described(self):
        keys = [shelf.key for shelf in shelves.SHELVES]
        self.assertEqual(len(keys), len(set(keys)))
        self.assertEqual(len(keys), 7)
        self.assertTrue(all(shelf.subtitle for shelf in shelves.SHELVES))
        self.assertIsNone(shelves.by_key('nope'))
```

- [ ] **Step 2: Run to verify failure**

Run: `python manage.py test research.test_shelves`
Expected: FAIL — `ImportError: cannot import name 'shelves'`.

- [ ] **Step 3: Implement `shelves.py`**

`backend/research/shelves.py`:

```python
from dataclasses import dataclass

from django.db.models import F, Q

from .models import ScreenerRow

CARD_LIMIT = 20


@dataclass(frozen=True)
class Shelf:
    key: str
    title: str
    subtitle: str
    metric: str
    rule: Q
    descending: bool


SHELVES = (
    Shelf(
        'quality-on-sale', 'Quality on sale',
        'ROE ≥ 15%, net margin ≥ 10%, growing 5-year EPS, trading below the 200-day MA',
        'pct_vs_ma200',
        Q(roe__gte=15, net_margin__gte=10, eps_growth_5y__gt=0, pct_vs_ma200__lt=0),
        False,
    ),
    Shelf('overbought', 'Overbought', 'RSI 14 at or above 70', 'rsi14', Q(rsi14__gte=70), True),
    Shelf('oversold', 'Oversold', 'RSI 14 at or below 30', 'rsi14', Q(rsi14__lte=30), False),
    Shelf(
        'strong-trend', 'Strong trend', 'Close above the 50-day MA, 50-day above the 200-day',
        'change_3m', Q(last_close__gt=F('ma50'), ma50__gt=F('ma200')), True,
    ),
    Shelf(
        'near-high', 'Near 52-week high', 'Within 3% of the 52-week high',
        'pct_from_52w_high', Q(pct_from_52w_high__gte=-3), True,
    ),
    Shelf('cheap-pe', 'Cheap by P/E', 'Positive P/E below 15', 'pe', Q(pe__gt=0, pe__lt=15), False),
    Shelf(
        'unusual-volume', 'Unusual volume', "Last session's volume at least 2× its 20-day average",
        'rvol', Q(rvol__gte=2), True,
    ),
)

_BY_KEY = {shelf.key: shelf for shelf in SHELVES}


def by_key(key):
    return _BY_KEY.get(key)


def matching(shelf):
    order = f'-{shelf.metric}' if shelf.descending else shelf.metric
    return (
        ScreenerRow.objects.filter(status=ScreenerRow.OK)
        .filter(shelf.rule)
        .filter(**{f'{shelf.metric}__isnull': False})
        .order_by(order, 'ticker')
    )


def card(row, shelf):
    return {
        'ticker': row.ticker,
        'name': row.name,
        'uic': row.uic,
        'asset_type': row.asset_type,
        'last_close': row.last_close,
        'change_1d': row.change_1d,
        'metric_value': getattr(row, shelf.metric),
        'sparkline': row.sparkline,
    }
```

- [ ] **Step 4: Run tests**

Run: `python manage.py test research.test_shelves`
Expected: PASS (10 tests).

- [ ] **Step 5: Write the failing endpoint tests**

`backend/research/test_discover_views.py`:

```python
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from research.models import ScreenerRow
from saxo.models import SyncRun


class DiscoverViewTest(APITestCase):
    def setUp(self):
        user = get_user_model().objects.create_user('u', password='p')
        self.client.force_authenticate(user)

    def run_at(self, outcome, hours_ago):
        run = SyncRun.objects.create(task='scan_universe', outcome=outcome)
        SyncRun.objects.filter(pk=run.pk).update(ran_at=timezone.now() - timedelta(hours=hours_ago))

    def stock(self, ticker, **fields):
        return ScreenerRow.objects.create(
            ticker=ticker, name=ticker, indexes='SP500', uic=ScreenerRow.objects.count() + 1,
            status=ScreenerRow.OK, technicals_at=timezone.now(), **fields,
        )

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(reverse('research-discover')).status_code, 401)

    def test_lists_every_shelf_with_totals_and_top_cards(self):
        self.run_at('ok', 1)
        for i in range(25):
            self.stock(f'T{i:02d}', rsi14=70.0 + i)
        response = self.client.get(reverse('research-discover'))
        self.assertEqual(response.status_code, 200)
        shelves = {s['key']: s for s in response.data['shelves']}
        self.assertEqual(len(shelves), 7)
        self.assertEqual(shelves['overbought']['total'], 25)
        self.assertEqual(len(shelves['overbought']['items']), 20)
        self.assertEqual(shelves['overbought']['items'][0]['ticker'], 'T24')
        self.assertEqual(shelves['overbought']['metric'], 'rsi14')
        self.assertEqual((shelves['oversold']['total'], shelves['oversold']['items']), (0, []))
        self.assertEqual(response.data['health']['state'], 'ok')
        self.assertIsNotNone(response.data['as_of'])

    def test_health_is_never_before_any_successful_run(self):
        self.run_at('skipped', 1)
        response = self.client.get(reverse('research-discover'))
        self.assertEqual(response.data['health']['state'], 'never')
        self.assertIsNone(response.data['as_of'])

    def test_health_is_stale_after_36_hours(self):
        self.run_at('ok', 37)
        self.assertEqual(self.client.get(reverse('research-discover')).data['health']['state'], 'stale')

    def test_health_is_failed_when_latest_run_failed(self):
        self.run_at('ok', 25)
        self.run_at('failed', 1)
        self.assertEqual(self.client.get(reverse('research-discover')).data['health']['state'], 'failed')

    def test_as_of_is_the_oldest_ok_refresh(self):
        self.run_at('ok', 1)
        older = timezone.now() - timedelta(hours=30)
        self.stock('OLD', rsi14=80.0)
        ScreenerRow.objects.filter(ticker='OLD').update(technicals_at=older)
        self.stock('NEW', rsi14=80.0)
        response = self.client.get(reverse('research-discover'))
        self.assertEqual(response.data['as_of'], older)

    def test_shelf_detail_returns_every_match(self):
        for i in range(25):
            self.stock(f'T{i:02d}', rsi14=70.0 + i)
        response = self.client.get(reverse('research-discover-shelf', args=['overbought']))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['total'], 25)
        self.assertEqual(len(response.data['items']), 25)
        self.assertEqual(response.data['title'], 'Overbought')

    def test_unknown_shelf_is_404(self):
        self.assertEqual(self.client.get(reverse('research-discover-shelf', args=['nope'])).status_code, 404)
```

If `test_as_of_is_the_oldest_ok_refresh` fails only on datetime formatting (DRF `Response.data` holds the raw datetime; the test compares `response.data`, so it should match exactly), compare `response.data['as_of']` against `older` rather than the rendered JSON.

- [ ] **Step 6: Run to verify failure**

Run: `python manage.py test research.test_discover_views`
Expected: FAIL — `NoReverseMatch: Reverse for 'research-discover' not found`.

- [ ] **Step 7: Implement `discover.py`, the views and routes**

`backend/research/discover.py`:

```python
from datetime import timedelta

from django.db.models import Min
from django.utils import timezone

from saxo.models import SyncRun

from .models import ScreenerRow
from .scan import SCAN_TASK

STALE_AFTER = timedelta(hours=36)


def health(now=None):
    now = now or timezone.now()
    runs = SyncRun.objects.filter(task=SCAN_TASK)
    latest = runs.first()
    last_ok = runs.filter(outcome='ok').first()
    if last_ok is None:
        state = 'never'
    elif latest.outcome == 'failed':
        state = 'failed'
    elif now - last_ok.ran_at > STALE_AFTER:
        state = 'stale'
    else:
        state = 'ok'
    return {'state': state, 'last_run_at': latest.ran_at if latest else None}


def as_of():
    if health()['state'] == 'never':
        return None
    return ScreenerRow.objects.filter(status=ScreenerRow.OK).aggregate(oldest=Min('technicals_at'))['oldest']
```

Append to `backend/research/views.py` (add `from . import discover, shelves` and `from django.http import Http404` to the imports):

```python
def _shelf_payload(shelf, limit=None):
    rows = shelves.matching(shelf)
    selected = rows[:limit] if limit else rows
    return {
        'key': shelf.key,
        'title': shelf.title,
        'subtitle': shelf.subtitle,
        'metric': shelf.metric,
        'total': rows.count(),
        'items': [shelves.card(row, shelf) for row in selected],
    }


class DiscoverView(APIView):
    def get(self, request):
        return Response({
            'as_of': discover.as_of(),
            'health': discover.health(),
            'shelves': [_shelf_payload(shelf, shelves.CARD_LIMIT) for shelf in shelves.SHELVES],
        })


class DiscoverShelfView(APIView):
    def get(self, request, key):
        shelf = shelves.by_key(key)
        if shelf is None:
            raise Http404
        return Response(_shelf_payload(shelf))
```

In `backend/research/urls.py`, import both views and add:

```python
    path('discover/', DiscoverView.as_view(), name='research-discover'),
    path('discover/<slug:key>/', DiscoverShelfView.as_view(), name='research-discover-shelf'),
```

- [ ] **Step 8: Run tests**

Run: `python manage.py test research`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add backend/research/shelves.py backend/research/discover.py backend/research/views.py backend/research/urls.py backend/research/test_shelves.py backend/research/test_discover_views.py
git commit -m "feat: Discover shelves and their read-only endpoints"
```

---

### Task 6: Frontend data layer and formatting

**Files:**
- Modify: `frontend/src/api/client/research.js`, `frontend/src/api/queries/research.js`
- Create: `frontend/src/lib/discover.js`
- Test: `frontend/src/lib/discover.test.js`

**Interfaces:**
- Produces: `getDiscover()`, `getDiscoverShelf(key)`; `useDiscover()`, `useDiscoverShelf(key)` (TanStack Query, `staleTime` 5 min); `researchKeys.discover`, `researchKeys.discoverShelf(key)`; `formatShelfMetric(metric, value) -> string`; `healthNotice(health, asOf) -> {tone, text} | null`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/discover.test.js`:

```javascript
import { describe, expect, it } from 'vitest'

import { formatShelfMetric, healthNotice } from './discover'

describe('formatShelfMetric', () => {
  it('names the metric that put a stock on the shelf', () => {
    expect(formatShelfMetric('rsi14', 78.4)).toBe('RSI 78')
    expect(formatShelfMetric('pct_vs_ma200', -8.21)).toBe('-8.2% vs 200-day MA')
    expect(formatShelfMetric('change_3m', 12.34)).toBe('+12.3% in 3 months')
    expect(formatShelfMetric('pct_from_52w_high', -1.5)).toBe('-1.5% from 52-week high')
    expect(formatShelfMetric('pe', 11.26)).toBe('P/E 11.3')
    expect(formatShelfMetric('rvol', 2.54)).toBe('2.5× average volume')
  })

  it('renders an absent value as a dash', () => {
    expect(formatShelfMetric('rsi14', null)).toBe('—')
  })
})

describe('healthNotice', () => {
  it('is silent for a healthy scan', () => {
    expect(healthNotice({ state: 'ok' }, '2026-09-30T22:40:00Z')).toBeNull()
  })

  it('says a failed or stale scan out loud', () => {
    expect(healthNotice({ state: 'failed' }, '2026-09-28T22:40:00Z')).toMatchObject({ tone: 'error' })
    expect(healthNotice({ state: 'stale' }, '2026-09-28T22:40:00Z')).toMatchObject({ tone: 'warning' })
  })

  it('explains how to run the first scan', () => {
    expect(healthNotice({ state: 'never' }, null).text).toMatch(/manage\.py scan_universe/)
  })
})
```

`fmtPct`/`fmtNum` render `null` as `—` (check `UNKNOWN` in `lib/format.js`; use it rather than a literal if exported).

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/lib/discover.test.js`
Expected: FAIL — cannot resolve `./discover`.

- [ ] **Step 3: Implement**

`frontend/src/lib/discover.js`:

```javascript
import { fmtNum, fmtPct } from './format'

const METRIC_LABELS = {
  rsi14: (v) => `RSI ${fmtNum(v, 0)}`,
  pct_vs_ma200: (v) => `${fmtPct(v, { decimals: 1 })} vs 200-day MA`,
  change_3m: (v) => `${fmtPct(v, { decimals: 1 })} in 3 months`,
  pct_from_52w_high: (v) => `${fmtPct(v, { decimals: 1 })} from 52-week high`,
  pe: (v) => `P/E ${fmtNum(v, 1)}`,
  rvol: (v) => `${fmtNum(v, 1)}× average volume`,
}

export function formatShelfMetric(metric, value) {
  if (value == null) return '—'
  return (METRIC_LABELS[metric] ?? ((v) => fmtNum(v, 2)))(value)
}

const asDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function healthNotice(health, asOf) {
  if (health?.state === 'never') {
    return { tone: 'info', text: 'No scan yet. It runs nightly, or run `manage.py scan_universe`.' }
  }
  if (health?.state === 'failed') {
    return { tone: 'error', text: `The last scan failed. Showing data from ${asDate(asOf)}.` }
  }
  if (health?.state === 'stale') {
    return { tone: 'warning', text: `No fresh scan since ${asDate(asOf)}.` }
  }
  return null
}
```

Check `Alert` in `components/ui.jsx` accepts `error`/`warning`/`info` tones; if it names them differently, use its names here and in the test.

Append to `frontend/src/api/client/research.js`:

```javascript
export const getDiscover = () => apiFetch('/api/research/discover/')
export const getDiscoverShelf = (key) => apiFetch(`/api/research/discover/${key}/`)
```

In `frontend/src/api/queries/research.js`: add `getDiscover, getDiscoverShelf` to the `../client` import list; add to `researchKeys`:

```javascript
  discover: ['discover'],
  discoverShelf: (key) => ['discover', key],
```

and append:

```javascript
export function useDiscover() {
  return useQuery({ queryKey: researchKeys.discover, queryFn: getDiscover, staleTime: 5 * 60_000 })
}

export function useDiscoverShelf(key) {
  return useQuery({
    queryKey: researchKeys.discoverShelf(key),
    queryFn: () => getDiscoverShelf(key),
    enabled: !!key,
    staleTime: 5 * 60_000,
  })
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/discover.test.js src/api`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/discover.js frontend/src/lib/discover.test.js frontend/src/api/client/research.js frontend/src/api/queries/research.js
git commit -m "feat: Discover data layer and metric wording"
```

---

### Task 7: Discover page, shelf rows, cards and See all

**Files:**
- Create: `frontend/src/components/discover/Sparkline.jsx`, `DiscoverCard.jsx`, `ShelfRow.jsx`, `DiscoverHealth.jsx`
- Create: `frontend/src/pages/Discover.jsx`, `frontend/src/pages/DiscoverShelf.jsx`
- Modify: `frontend/src/App.jsx` (two routes), `frontend/src/components/Sidebar.jsx` (nav item)
- Test: `frontend/src/components/discover/DiscoverCard.test.jsx`, `frontend/src/pages/Discover.test.jsx`

**Interfaces:**
- Consumes: `useDiscover`, `useDiscoverShelf`, `formatShelfMetric`, `healthNotice`, `chartHref(symbol, {uic, assetType})` from `lib/research`, `Card`, `PageHeader`, `Alert`, `EmptyState`, `Skeleton`, `InstrumentLogo`, `DayChange` from `components/ui`, `fmtMoney` from `lib/format`, `useWatchlistToggle` + `Menu`/`MenuRow` from `components/research`.
- Produces: routes `/discover` and `/discover/:key`.

Before writing UI, invoke the `saxodash-design-system` skill and read `docs/design-system.md` (AGENTS.md requires it for frontend work).

- [ ] **Step 1: Write the failing component tests**

`frontend/src/components/discover/DiscoverCard.test.jsx`:

```javascript
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import DiscoverCard from './DiscoverCard'

vi.mock('../research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const item = {
  ticker: 'AAPL', name: 'Apple Inc.', uic: 211, asset_type: 'Stock',
  last_close: 230.5, change_1d: -1.25, metric_value: 78.4, sparkline: [1, 2, 3],
}

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <DiscoverCard item={item} metric="rsi14" {...props} />
    </MemoryRouter>,
  )

describe('DiscoverCard', () => {
  it('shows the metric that put the stock on the shelf', () => {
    renderCard()
    expect(screen.getByText('RSI 78')).toBeInTheDocument()
  })

  it('shows the change with its sign, not colour alone', () => {
    renderCard()
    expect(screen.getByText('-1.25%')).toBeInTheDocument()
  })

  it('links to the chart for the exact instrument', () => {
    renderCard()
    expect(screen.getByRole('link', { name: /AAPL/ })).toHaveAttribute(
      'href',
      '/research/chart?symbol=AAPL&uic=211&assetType=Stock',
    )
  })
})
```

`frontend/src/pages/Discover.test.jsx`:

```javascript
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Discover from './Discover'

const useDiscover = vi.fn()
vi.mock('../api/queries', () => ({ useDiscover: () => useDiscover() }))
vi.mock('../components/research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const shelf = (key, title, total, items = []) => ({
  key, title, subtitle: `${title} rule`, metric: 'rsi14', total, items,
})
const card = { ticker: 'NVDA', name: 'NVIDIA', uic: 1, asset_type: 'Stock', last_close: 100, change_1d: 1, metric_value: 81, sparkline: [] }

const renderPage = () => render(<MemoryRouter><Discover /></MemoryRouter>)

describe('Discover page', () => {
  it('renders each shelf with a See all link', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, shelves: [shelf('overbought', 'Overbought', 1, [card])] } })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Overbought' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /See all \(1\)/ })).toHaveAttribute('href', '/discover/overbought')
  })

  it('collapses an empty shelf to a quiet note', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, shelves: [shelf('oversold', 'Oversold', 0)] } })
    renderPage()
    expect(screen.getByText('Nothing oversold today')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument()
  })

  it('warns when the scan failed', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-28T22:40:00Z', health: { state: 'failed' }, shelves: [] } })
    renderPage()
    expect(screen.getByText(/The last scan failed/)).toBeInTheDocument()
  })

  it('explains the first scan when none has run', () => {
    useDiscover.mockReturnValue({ data: { as_of: null, health: { state: 'never' }, shelves: [] } })
    renderPage()
    expect(screen.getByText(/manage\.py scan_universe/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/discover src/pages/Discover.test.jsx`
Expected: FAIL — cannot resolve `./DiscoverCard` / `./Discover`.

- [ ] **Step 3: Implement the components**

`frontend/src/components/discover/Sparkline.jsx`:

```javascript
import { NEGATIVE, POSITIVE } from '../../lib/charts'

const WIDTH = 120
const HEIGHT = 32

export default function Sparkline({ values }) {
  if (!values || values.length < 2) return <div style={{ height: HEIGHT }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * WIDTH).toFixed(1)},${(HEIGHT - ((v - min) / span) * HEIGHT).toFixed(1)}`)
    .join(' ')
  const stroke = values[values.length - 1] >= values[0] ? POSITIVE : NEGATIVE

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
```

`frontend/src/components/discover/DiscoverCard.jsx`:

```javascript
import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'

import { formatShelfMetric } from '../../lib/discover'
import { fmtMoney } from '../../lib/format'
import { chartHref } from '../../lib/research'
import { DayChange, InstrumentLogo } from '../ui'
import { Menu, MenuRow } from '../research/menu'
import { useWatchlistToggle } from '../research/useWatchlistToggle'
import Sparkline from './Sparkline'

export default function DiscoverCard({ item, metric }) {
  const instrument = { uic: item.uic, assetType: item.asset_type }
  const { watchlists, toggleList } = useWatchlistToggle({
    symbol: item.ticker,
    instrument,
    details: { description: item.name },
  })
  const listed = watchlists.some((list) => list.items.some((entry) => entry.uic === item.uic))

  return (
    <div className="relative w-56 shrink-0 snap-start rounded-lg border border-white/[0.06] bg-zinc-900/60 hover:border-white/[0.14] transition-colors">
      <Link to={chartHref(item.ticker, instrument)} className="block p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 rounded-lg">
        <div className="flex items-center gap-2 pr-7">
          <InstrumentLogo symbol={item.ticker} size={24} className="rounded" fallback={<span className="w-6 h-6 rounded bg-zinc-800" />} />
          <div className="min-w-0">
            <div className="text-[var(--fig-sm)] font-semibold text-zinc-100">{item.ticker}</div>
            <div className="text-[var(--fig-2xs)] text-zinc-500 truncate">{item.name}</div>
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="num font-mono text-[var(--fig-sm)] text-zinc-200">{fmtMoney(item.last_close, 'USD')}</span>
          <DayChange value={item.change_1d} className="text-[var(--fig-xs)]" />
        </div>
        <div className="mt-1 text-[var(--fig-xs)] text-blue-300">{formatShelfMetric(metric, item.metric_value)}</div>
        <div className="mt-2">
          <Sparkline values={item.sparkline} />
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <Menu label={listed ? `${item.ticker} is on a list` : `Add ${item.ticker} to a list`} icon={Star} width={200} align="right">
          {watchlists.length === 0 ? (
            <div className="px-2 py-2 text-[var(--fig-xs)] text-zinc-500">No lists yet — create one on Research.</div>
          ) : (
            watchlists.map((list) => (
              <MenuRow key={list.id} checked={list.items.some((entry) => entry.uic === item.uic)} onClick={() => toggleList(list)} right={`${list.items.length}`}>
                {list.name}
              </MenuRow>
            ))
          )}
        </Menu>
      </div>
    </div>
  )
}
```

Check the `Menu` trigger renders only an icon when `label` is long (it uses `label` for `aria-label`/title in `ChartToolRail`; in `SymbolBar` it renders the label as text). If it renders the text, pass a short visible label or adapt per what `menu.jsx` supports — do not add a new prop to `Menu` for this unless unavoidable.

`frontend/src/components/discover/ShelfRow.jsx`:

```javascript
import { Link } from 'react-router-dom'

import DiscoverCard from './DiscoverCard'

export default function ShelfRow({ shelf }) {
  return (
    <section aria-labelledby={`shelf-${shelf.key}`} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`shelf-${shelf.key}`} className="text-[var(--fig-md)] font-semibold text-zinc-100">{shelf.title}</h2>
          <p className="text-[var(--fig-xs)] text-zinc-500">{shelf.subtitle}</p>
        </div>
        {shelf.total > 0 ? (
          <Link to={`/discover/${shelf.key}`} className="shrink-0 text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">
            See all ({shelf.total})
          </Link>
        ) : null}
      </div>
      {shelf.total === 0 ? (
        <p className="text-[var(--fig-xs)] text-zinc-600">Nothing {shelf.title.toLowerCase()} today</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          {shelf.items.map((item) => (
            <DiscoverCard key={`${item.uic}:${item.asset_type}`} item={item} metric={shelf.metric} />
          ))}
        </div>
      )}
    </section>
  )
}
```

`frontend/src/components/discover/DiscoverHealth.jsx`:

```javascript
import { healthNotice } from '../../lib/discover'
import { Alert } from '../ui'

export default function DiscoverHealth({ health, asOf }) {
  const notice = healthNotice(health, asOf)
  if (!notice) return null
  return <Alert tone={notice.tone}>{notice.text}</Alert>
}
```

`frontend/src/pages/Discover.jsx`:

```javascript
import { useDiscover } from '../api/queries'
import DiscoverHealth from '../components/discover/DiscoverHealth'
import ShelfRow from '../components/discover/ShelfRow'
import { Alert, PageHeader, Skeleton } from '../components/ui'

const asOfLabel = (iso) =>
  iso ? `S&P 500 and Nasdaq-100 · data as of ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'S&P 500 and Nasdaq-100'

export default function Discover() {
  const { data, isLoading, error } = useDiscover()

  return (
    <div className="space-y-6">
      <PageHeader title="Discover" subtitle={asOfLabel(data?.as_of)} />
      {error ? <Alert>Could not load Discover.</Alert> : null}
      {data ? <DiscoverHealth health={data.health} asOf={data.as_of} /> : null}
      {isLoading ? <Skeleton className="h-48" /> : null}
      {data?.shelves.map((shelf) => <ShelfRow key={shelf.key} shelf={shelf} />)}
    </div>
  )
}
```

`frontend/src/pages/DiscoverShelf.jsx`:

```javascript
import { Link, useParams } from 'react-router-dom'

import { useDiscoverShelf } from '../api/queries'
import { formatShelfMetric } from '../lib/discover'
import { fmtMoney } from '../lib/format'
import { chartHref } from '../lib/research'
import { Alert, Card, DayChange, InstrumentLogo, PageHeader, Skeleton, Td, Th, Tr } from '../components/ui'

export default function DiscoverShelf() {
  const { key } = useParams()
  const { data, isLoading, error } = useDiscoverShelf(key)

  return (
    <div className="space-y-4">
      <PageHeader title={data?.title ?? 'Discover'} subtitle={data?.subtitle} right={<Link to="/discover" className="text-[var(--fig-xs)] text-blue-400">Back to Discover</Link>} />
      {error ? <Alert>{error.status === 404 ? 'No such shelf.' : 'Could not load this shelf.'}</Alert> : null}
      {isLoading ? <Skeleton className="h-64" /> : null}
      {data ? (
        <Card padding={false}>
          <table className="w-full">
            <thead>
              <tr>
                <Th edge>Stock</Th>
                <Th align="right">Last</Th>
                <Th align="right">1 day</Th>
                <Th align="right" edge>Why it is here</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <Tr key={`${item.uic}:${item.asset_type}`}>
                  <Td edge>
                    <Link to={chartHref(item.ticker, { uic: item.uic, assetType: item.asset_type })} className="flex items-center gap-2 text-zinc-100 hover:text-blue-300">
                      <InstrumentLogo symbol={item.ticker} size={20} className="rounded" fallback={<span className="w-5 h-5 rounded bg-zinc-800" />} />
                      <span className="font-semibold">{item.ticker}</span>
                      <span className="text-zinc-500 truncate hidden sm:inline">{item.name}</span>
                    </Link>
                  </Td>
                  <Td align="right"><span className="num font-mono">{fmtMoney(item.last_close, 'USD')}</span></Td>
                  <Td align="right"><DayChange value={item.change_1d} /></Td>
                  <Td align="right" edge>{formatShelfMetric(data.metric, item.metric_value)}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  )
}
```

Check `ApiError` exposes `.status` (see `api/client/http.js`); if it is named differently, use that name.

Routes in `frontend/src/App.jsx` — import both pages and add inside the `<Route element={<Layout />}>` block, next to `research`:

```javascript
          <Route path='discover' element={<Discover />} />
          <Route path='discover/:key' element={<DiscoverShelf />} />
```

Nav in `frontend/src/components/Sidebar.jsx` — add `Compass` to the lucide import and, directly after the Research item:

```javascript
  { to: '/discover', label: 'Discover', icon: Compass },
```

Update `Sidebar.test.jsx` if it asserts the exact nav list.

- [ ] **Step 4: Run tests**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Lint**

Run: `npx eslint src/components/discover src/pages/Discover.jsx src/pages/DiscoverShelf.jsx src/lib/discover.js src/App.jsx src/components/Sidebar.jsx`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/discover frontend/src/pages/Discover.jsx frontend/src/pages/Discover.test.jsx frontend/src/pages/DiscoverShelf.jsx frontend/src/App.jsx frontend/src/components/Sidebar.jsx frontend/src/components/Sidebar.test.jsx
git commit -m "feat: Discover page with shelves, cards and See all"
```

---

### Task 8: First real scan, screenshot review, and the decision record

**Files:**
- Modify: `AGENTS.md` (one "Decided" paragraph), `docs/next-steps.md` (mark Discover done / note follow-ups)

- [ ] **Step 1: Run the first scan against the dev database**

Saxo must be connected in the running app. Run: `cd backend && python manage.py scan_universe`
Expected: after ~10–11 minutes, `<n> rows ok` with n ≥ 450. Then:

```bash
python manage.py shell -c "from research.models import ScreenerRow as R; from django.db.models import Count; print(list(R.objects.values('status').annotate(n=Count('id')))); print(list(R.objects.filter(status='unmatched').values_list('ticker', flat=True)))"
```

Record the unmatched tickers in the PR description. If more than ~20 are unmatched, inspect two of them with `market.search` in the shell before changing `resolve` — a systematic mismatch (for example, dotted tickers) is a resolve-rule fix with a new test in `test_scan.py`, not a data edit.

- [ ] **Step 2: Screenshot review**

Follow the `saxodash-design-system` skill's harness recipe for `/discover` and `/discover/overbought` at 1440×1000 and 390×844. Read every PNG. Check: shelves scroll horizontally without page-level horizontal scroll at 390px, cards are keyboard reachable (Tab through one shelf), the metric line reads correctly, empty shelves show their note. Fix anything found, re-run `npx vitest run`, re-screenshot.

- [ ] **Step 3: Record the decision in AGENTS.md**

Add under "## Decided", after the heatmaps paragraph:

```markdown
**Discover is a nightly snapshot, not a live screener.** `research.tasks.scan_universe`
fills `ScreenerRow` for the S&P 500 ∪ Nasdaq-100 listed in `research/universe.csv`
(hand-refreshed; no free constituents feed): Saxo daily bars for technicals, one
Finnhub metrics call for fundamentals, paced 1.2 s per symbol. The page reads only
that table. Shelves are declarative rules in `research/shelves.py`; a rule never
matches a null metric. RSI/SMA/RVOL are computed in `research/technicals.py` with the
same definitions as `lib/indicators.js`, pinned by the shared
`lib/fixtures/indicator-parity.json`. The scan records `SyncRun`s but is
`@synced(reports_health=False)`, so it never affects the header's Saxo health badge.
```

- [ ] **Step 4: Full verification**

Run: `cd backend && python manage.py test && cd ../frontend && npx vitest run && npx eslint src`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/next-steps.md
git commit -m "docs: record the Discover snapshot decision"
```

If Step 2 produced UI fixes, commit them separately first with `git add` on the exact files changed and a `fix:` message.
