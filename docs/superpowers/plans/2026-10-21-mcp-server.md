# SaxoDash MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local stdio MCP server, started by Claude Desktop, that exposes every investment page's data, four new analysis tools and a scored decision journal.

**Architecture:** A Django app `mcp_server` registers plain tool functions on a FastMCP server started by `manage.py mcp_serve`. Mirrored tools dispatch the page's own DRF view in-process (`call_view`) and reshape `response.data`; new tools live in the apps that own their data (`research/valuation.py`, `portfolio/tax_year.py`) and a new `advisor` app owns the journal. Every tool answers through one envelope `{data, as_of, sources, warnings}`.

**Tech Stack:** Django 6 + DRF, the official `mcp` Python SDK (`mcp.server.fastmcp.FastMCP`, stdio transport), SQLite, Redis cache, Finnhub, Saxo OpenAPI; vitest for the one frontend parity spec.

**Spec:** `docs/superpowers/specs/2026-10-21-mcp-server-design.md`. Playbook referenced for zones and the recommendation contract: `docs/notes/2026-10-19-growth-stock-playbook.md` on branch `docs/growth-playbook` (sections 4.6, 7.1, 8A, 9).

## Global Constraints

- Generated code carries zero comments (`AGENTS.md`); the why goes in the PR description.
- Backend tests are `APITestCase`/`TestCase` per app, run with `/Users/guillaumeleberre/Develop/GuillaumesLab/WebDevelopment/SaxoDash/backend/.venv/bin/python manage.py test <app>` from `.worktrees/mcp-server/backend`. Call it `$PY` below.
- Tests that touch the cache use `@override_settings(CACHES=LOCMEM)` with `LOCMEM = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}`, as `research/test_discover_views.py` does. No test calls Finnhub or Saxo; patch `research.finnhub._get` / `saxo.client._get`.
- Nothing may write to stdout inside `mcp_serve` except the protocol.
- No banking data: no tool reads `enablebanking`, `accounts.BankAccount` or `core` net-worth history.
- No tool places, stages or previews an order, starts a sync or scan, or touches connection flows or chart drawings.
- An absent figure is `None`, never `0`. Units are in the key name (`_eur`, `_pct`, or the instrument's `currency` beside the price).
- Horizons are `3m`, `6m`, `12m`; checkpoints are 91, 182 and 365 calendar days.
- Benchmark is `investors.copying.BENCHMARK_TICKER` (`'SPY'`).
- Tax constants: rate 10%, exemption €10,000, carry-over at most €1,000 a year for five years (cap €15,000 total), basis for pre-2026 holdings is the 31 December 2025 close. Output always carries "Check with a Belgian tax adviser."
- A new migration is not done until `manage.py migrate` has run against the main checkout's dev `db.sqlite3` (`AGENTS.md`).
- Pin `mcp` in `backend/requirements.txt` to the exact version installed, a release at least two weeks old.

## Review Focus

1. **Saxo disconnected or token expired mid-conversation** → every Saxo-backed tool returns the envelope with `warnings` naming it and `data: None`, never an exception. Pinned in Task 2 (`test_disconnected_saxo_is_a_warning`).
2. **A European listing sharing a US ticker** (e.g. a `EUR` instrument `ASML` vs Finnhub's) → company tools refuse with status `foreign`, never show another company's fundamentals. Pinned in Task 3 and Task 5.
3. **A DRF throttle or a Finnhub budget refusal** (429 / `available: false`) → a warning "busy, try again in a minute", not a crash or an empty success. Pinned in Task 2 (`test_throttled_view_is_a_warning`).
4. **A ticker logged to the journal that has no `PriceHistory` yet** → logged with the entry price from the Saxo chart, scored `None` until bars arrive, picked up by the nightly refresh. Pinned in Task 10.
5. **Loss-making company** (TTM EPS ≤ 0) in valuation history and comparison → P/E `None`, never negative or zero. Pinned in Task 8.

---

### Task 1: Probe Saxo closed-trade history and Cowork's MCP support

No code is committed in this task; it decides Task 12's data source and Task 13's setup notes.

**Files:**
- Create: `docs/notes/2026-10-21-mcp-probes.md`

- [ ] **Step 1: Find the client key**

From the main checkout's backend, with the stack's Saxo credential live:
`$PY manage.py shell -c "from saxo import client; from saxo.credentials import active_credential as a; print(client._get(a().access_token, '/port/v1/clients/me'))"`
Expected: a dict containing `ClientKey`.

- [ ] **Step 2: Try each candidate for this year's closed trades**

Call, in order, with `FromDate=2026-01-01`, `ToDate=` today: `/cs/v1/reports/closedPositions/{ClientKey}/{FromDate}/{ToDate}`, `/cs/v1/reports/trades/{ClientKey}?FromDate=…&ToDate=…`, `/port/v1/closedpositions/me` (for comparison). For each, record status, number of rows, and whether a row carries instrument, quantity, open/close dates and prices, and realised P/L in account currency (EUR).

- [ ] **Step 3: Check Cowork**

In Claude Desktop, add a throwaway stdio server (e.g. `npx -y @modelcontextprotocol/server-everything`) to `claude_desktop_config.json`, restart, open a Cowork task and ask it to list its tools. Record whether the local server's tools appear.

- [ ] **Step 4: Write the findings and commit**

`docs/notes/2026-10-21-mcp-probes.md`: the winning endpoint and a redacted sample row (no account numbers), or "none returns realised P/L"; and "Cowork sees local servers: yes/no".

```bash
git add docs/notes/2026-10-21-mcp-probes.md
git commit -m "docs(mcp): record the closed-trade and Cowork probes"
```

---

### Task 2: Server skeleton, envelope, in-process views, `get_data_health`

**Files:**
- Modify: `backend/requirements.txt` (add `mcp==<installed>`), `backend/backend/settings.py` (add `'mcp_server'` to `INSTALLED_APPS` and `MCP_USER = os.environ.get('MCP_USER', '')`)
- Create: `backend/mcp_server/__init__.py`, `apps.py`, `envelope.py`, `views.py`, `server.py`, `tools/__init__.py`, `tools/system.py`, `management/__init__.py`, `management/commands/__init__.py`, `management/commands/mcp_serve.py`
- Test: `backend/mcp_server/test_envelope.py`, `test_views.py`, `test_system_tools.py`, `test_stdio.py`

**Interfaces:**
- Produces:
  - `envelope.answer(data, *, sources: list[str], warnings: list[str] = (), as_of: datetime | None = None) -> dict` → `{'data', 'as_of' (ISO, default now), 'sources', 'warnings'}`
  - `envelope.saxo_warnings() -> list[str]`: from `saxo.credentials.connection_state()` and `worst_recent_outcome()`; empty when usable and healthy.
  - `views.app_user() -> User`: `settings.MCP_USER` username if set, else the lowest-id active user; raises `ImproperlyConfigured` when there is none.
  - `views.call_view(view_class, *, kwargs: dict | None = None, query: dict | None = None) -> ViewResult` with `ViewResult(status: int, data)` (a dataclass), GET only.
  - `views.problem(result: ViewResult) -> str | None`: `'Saxo is not connected — reconnect in the app.'` for 409, `'Busy — try again in a minute.'` for 429, `'Not found.'` for 404, `f'Upstream error ({status}).'` for 5xx, the `reason`/`message` of an `available: false` body, else `None`.
  - `server.build_server() -> FastMCP` named `"saxodash"`, registering every function in `tools.REGISTRY: list[Callable]`.
  - `tools.system.get_data_health() -> dict`
- Consumes: `saxo.credentials.connection_state`, `worst_recent_outcome`, `latest_run_per_task`; `research.models.ScreenerRow.technicals_at`; `investors.models.PriceHistory.checked_at`.

- [ ] **Step 1: Install the SDK**

`$PY -m pip install mcp` then `$PY -m pip show mcp`; pin that version in `requirements.txt`. If the newest release is under two weeks old, install the previous one.

- [ ] **Step 2: Write the failing tests**

```python
class AnswerTest(SimpleTestCase):
    def test_wraps_data_with_sources_and_warnings(self):
        out = answer({'x': 1}, sources=['portfolio'], warnings=['stale'])
        self.assertEqual(out['data'], {'x': 1})
        self.assertEqual(out['sources'], ['portfolio'])
        self.assertEqual(out['warnings'], ['stale'])
        self.assertIsNotNone(out['as_of'])

class CallViewTest(APITestCase):
    def test_dispatches_as_the_app_user(self): ...          # PortfolioSummaryView → status 200, data has 'total_value'
    def test_no_user_is_improperly_configured(self): ...    # empty user table → ImproperlyConfigured
    def test_throttled_view_is_a_warning(self):
        self.assertEqual(problem(ViewResult(429, {})), 'Busy — try again in a minute.')
    def test_disconnected_saxo_is_a_warning(self):
        self.assertEqual(problem(ViewResult(409, {})), 'Saxo is not connected — reconnect in the app.')
    def test_unavailable_body_is_its_reason(self):
        self.assertEqual(problem(ViewResult(200, {'available': False, 'reason': 'Finnhub busy'})), 'Finnhub busy')

class DataHealthTest(TestCase):
    def test_reports_connection_and_each_task(self): ...    # keys: saxo_connected, saxo_usable, unusable_reason, tasks{name: {outcome, finished_at}}, discover_scanned_at, prices_refreshed_at
```

`test_stdio.py` (`TransactionTestCase`, skipped unless `MCP_E2E=1` because it spawns a process): start `[sys.executable, 'manage.py', 'mcp_serve']` with `mcp.client.stdio.stdio_client` + `ClientSession`, `initialize()`, `list_tools()` includes `get_data_health`, `call_tool('get_data_health', {})` returns content whose JSON has `data` and `warnings`.

- [ ] **Step 3: Run them to verify they fail**

Run: `$PY manage.py test mcp_server` → FAIL (`ModuleNotFoundError: mcp_server`).

- [ ] **Step 4: Implement**

`call_view`: `APIRequestFactory().get('/', query)`, `force_authenticate(request, user=app_user())`, `response = view_class.as_view()(request, **(kwargs or {}))`, `response.render()` is not needed; return `ViewResult(response.status_code, response.data)`. `mcp_serve.handle`: before importing the server, point `sys.stdout` writes from Python logging at stderr by asserting every root handler's stream is `sys.stderr` (Django's `StreamHandler` already defaults to stderr) and set `warnings.showwarning` to write to stderr; then `build_server().run(transport='stdio')`. Each tool returns `answer(...)`; FastMCP serialises the dict.

- [ ] **Step 5: Run the tests**

Run: `$PY manage.py test mcp_server` → PASS; then `MCP_E2E=1 $PY manage.py test mcp_server.test_stdio` → PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/backend/settings.py backend/mcp_server
git commit -m "feat(mcp): stdio server skeleton with the answer envelope and get_data_health"
```

---

### Task 3: US company-data rule, shared with the frontend

**Files:**
- Create: `backend/mcp_server/company_data.py`, `frontend/src/lib/fixtures/company-data-parity.json`
- Test: `backend/mcp_server/test_company_data.py`, `frontend/src/lib/companyDataParity.test.js`

**Interfaces:**
- Produces: `company_data.status(*, asset_type: str | None, currency: str | None, resolved: bool) -> str` returning one of `'eligible' | 'fund' | 'foreign' | 'unverified'`; `company_data.refusal(status) -> str | None` (`foreign`: "A non-US listing: Finnhub and the SEC would describe a different company.", `fund`: "An ETF has no company statements.", `unverified`: "The listing currency is unknown, so US company data is withheld.", `eligible`: `None`).
- Rule, ported from `lib/companyData.js::companyDataStatus` with `lookingUp=false`, `requireInstrument=false`: currency known and ≠ `USD` → `foreign`; `asset_type == 'Etf'` → `fund`; currency known → `eligible`; resolved → `unverified`; else `eligible`.

- [ ] **Step 1: Write the fixture** — a list of `{instrument: {assetType} | null, currency, expected}` cases: USD stock → eligible; EUR stock → foreign; USD Etf → fund; EUR Etf → foreign; Stock with null currency → unverified; null instrument, null currency → eligible.

- [ ] **Step 2: Write both failing tests** — the Python test loads the fixture from `Path(settings.BASE_DIR).parent / 'frontend' / 'src' / 'lib' / 'fixtures' / 'company-data-parity.json'` (as `research/test_technicals.py` does) and asserts `status(asset_type=…, currency=…, resolved=instrument is not None) == expected` per case; the vitest spec asserts `companyDataStatus({instrument, currency}) === expected` per case.

- [ ] **Step 3: Run** `$PY manage.py test mcp_server.test_company_data` → FAIL; `cd ../frontend && npx vitest run src/lib/companyDataParity.test.js` → PASS (the JS rule already exists).

- [ ] **Step 4: Implement `status` and `refusal`.** Run both again → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(mcp): port the US company-data rule, pinned to the frontend by a shared fixture"`

---

### Task 4: Portfolio tools

**Files:**
- Create: `backend/mcp_server/shaping.py`, `backend/mcp_server/tools/portfolio.py`
- Modify: `backend/mcp_server/tools/__init__.py` (extend `REGISTRY`)
- Test: `backend/mcp_server/test_portfolio_tools.py`

**Interfaces:**
- Produces:
  - `shaping.without(obj, keys=PRESENTATION_KEYS) -> obj`: recursively drops `PRESENTATION_KEYS = {'color', 'logo', 'logo_url', 'photo', 'website', 'sparkline'}`.
  - `shaping.capped(items: list, limit: int) -> dict` → `{'items': items[:limit], 'truncated': max(0, len(items) - limit)}`.
  - `get_portfolio() -> dict`: data `{total_value_eur, total_cost_eur, total_pnl_eur, total_pnl_pct, positions: [...], insights}` from `PortfolioSummaryView`, `PositionListView`, `PortfolioInsightsView`; each position keeps `ticker, name, qty, currency, avg_cost, current_price, value_eur (=value), cost_eur, pnl_eur, pnl_pct, weight_pct, price_source, has_thesis`. Warnings: `saxo_warnings()` plus one per position whose `price_source` is not `live` (`"GOOGL priced from <source>, not live"`), plus "Prices are 15-minute delayed."
  - `get_performance(benchmark: str = '') -> dict` from `PerformanceView` and `RiskMetricsView`.
  - `get_transactions(limit: int = 50) -> dict` from `TransactionListView` (`capped`).
- Consumes: `call_view`, `problem`, `answer`, `saxo_warnings` (Task 2).

- [ ] **Step 1: Write the failing tests**

- `test_portfolio_matches_the_summary_view`: with two `Position` fixtures, `get_portfolio()['data']['total_value_eur'] == call_view(PortfolioSummaryView).data['total_value']` and the same for `total_pnl`.
- `test_no_positions_keeps_pnl_null`: empty table → `total_pnl_eur is None`.
- `test_presentation_fields_are_dropped`: no `color` anywhere in the output.
- `test_non_live_price_is_warned`: a position with `price_source='derived'` → a warning containing its ticker.
- `test_transactions_are_capped`: 60 rows, `limit=50` → 50 items, `truncated == 10`.

- [ ] **Step 2: Run** `$PY manage.py test mcp_server.test_portfolio_tools` → FAIL.
- [ ] **Step 3: Implement** the three tools and `shaping`; register them.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(mcp): portfolio, performance and transaction tools"`

---

### Task 5: Instrument, price and zone tools

**Files:**
- Create: `backend/mcp_server/zones.py`, `backend/mcp_server/tools/research.py`
- Test: `backend/mcp_server/test_zones.py`, `test_price_tools.py`

**Interfaces:**
- Produces:
  - `zones.zone(*, last_close, ma20, ma50, ma200, rsi14, pfcf=None, pfcf_median=None) -> str | None`, playbook 4.6 in this order: any input among `last_close, ma50, ma200` is `None` → `None`; `stretched` if `last_close >= 1.15 * ma50` or `rsi14 >= 75` or (`pfcf` and `pfcf_median` and `pfcf >= 1.5 * pfcf_median`); `trend` if `last_close > ma20 > ma50 > ma200`; `pullback` if `ma50 > ma200` and `ma200 <= last_close <= ma50`; `below_200` if `last_close < ma200`; else `'unclassified'`. The playbook's "Value pillar ≥ 50" condition on `pullback` is dropped until the lens engine exists; the tool says so in `warnings`.
  - `resolve(symbol: str) -> dict | None`: first `InstrumentSearchView` match whose symbol equals `symbol` (case-insensitive, before any `:` exchange suffix), shaped `{symbol, name, uic, asset_type, currency, exchange}`; held positions win (`Position.ticker == symbol` gives `uic`, `asset_type`, `currency` with no Saxo call).
  - `search_instruments(query: str) -> dict`, `get_quotes(symbols: list[str]) -> dict`.
  - `get_price_history(symbol: str, interval: str = 'weekly', bars: int = 104) -> dict`: `interval` ∈ `daily|weekly|monthly` (horizon 1440/10080/43200); `bars` capped at 260 for daily and 1,200 otherwise; data `{instrument, bars: [{date, open, high, low, close, volume}], summary: {last_close, ma20, ma50, ma200, rsi14, high_52w, low_52w, pct_from_52w_high, change_1m_pct, change_3m_pct, change_1y_pct}, zone}`. The summary is always computed from a daily fetch with `research.technicals.sma` / `rsi`, whatever `interval` the bars use.
- Consumes: `ChartView`, `InstrumentSearchView`, `QuotesView`; `research.technicals`.

- [ ] **Step 1: Write the failing tests**

- `zones`: one test per zone with exact numbers (e.g. `zone(last_close=115, ma20=110, ma50=100, ma200=90, rsi14=60) == 'stretched'`; `zone(last_close=105, ma20=103, ma50=100, ma200=90, rsi14=55) == 'trend'`; `zone(last_close=95, ma20=97, ma50=100, ma200=90, rsi14=45) == 'pullback'`; `zone(last_close=85, ma20=88, ma50=95, ma200=90, rsi14=35) == 'below_200'`; `pfcf=30, pfcf_median=19` → `stretched`; `ma200=None` → `None`).
- `test_held_position_resolves_without_saxo`: patch `saxo.client._get` to raise; `resolve('GOOGL')` with a held GOOGL returns its uic.
- `test_weekly_bars_with_daily_summary`: patched chart responses → `len(bars) <= 104`, `summary['ma200']` equals `sma` over the daily closes.
- `test_daily_is_capped_at_260`.
- `test_disconnected_saxo_returns_warning_not_error`: ChartView 409 → `data is None`, warning from `problem`.

- [ ] **Step 2: Run** `$PY manage.py test mcp_server.test_zones mcp_server.test_price_tools` → FAIL.
- [ ] **Step 3: Implement**; register the tools.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(mcp): instrument search, quotes, price history and the playbook zone"`

---

### Task 6: Company, statements, filings, news, notes and watchlist tools

**Files:**
- Modify: `backend/mcp_server/tools/research.py`
- Test: `backend/mcp_server/test_company_tools.py`

**Interfaces:**
- Produces: `get_company(symbol)`, `get_financial_statements(symbol, period: str = 'annual')` (`annual|quarterly`), `get_filings_and_insiders(symbol)`, `get_news(symbol, limit: int = 15)`, `get_my_notes(symbol)`, `get_watchlists()`.
- `get_company` merges `FundamentalsView`, `SymbolEarningsView`, `PeersView` into `{profile, metrics, ratio_history, eps_history, earnings, peers, recommendation_trend}`, each part `None` when its view answered `available: false` (with the reason in `warnings`).
- Every company tool first runs `resolve(symbol)` then `company_data.status(...)`; a status other than `eligible` returns `answer(None, warnings=[refusal(status)])` without calling the view — except `get_news`, which also allows `fund`, as the frontend's `ticker` gate does.
- Consumes: `resolve` (Task 5), `company_data` (Task 3).

- [ ] **Step 1: Write the failing tests**

- `test_foreign_listing_is_refused_without_calling_finnhub`: `resolve` patched to return `currency='EUR'`; `research.finnhub._get` patched with `side_effect=AssertionError`; `get_company('ASML')['data'] is None` and the warning is `refusal('foreign')`.
- `test_etf_gets_news_but_not_statements`.
- `test_unavailable_part_is_null_with_reason`: peers view returns `available: False, reason: 'x'` → `data['peers'] is None`, `'x'` in warnings, fundamentals still present.
- `test_statements_quarterly_param_reaches_the_view`.
- `test_notes_include_target_and_stop`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(mcp): company research tools behind the US company-data rule"`

---

### Task 7: Market scan and smart-money tools

**Files:**
- Create: `backend/mcp_server/tools/market.py`, `backend/mcp_server/tools/smart_money.py`
- Test: `backend/mcp_server/test_market_tools.py`, `test_smart_money_tools.py`

**Interfaces:**
- Produces:
  - `screen_universe(filters: dict | None = None, sort: str = '-market_cap', sector: str = '', limit: int = 25) -> dict`: queries `ScreenerRow` directly (no view returns arbitrary filters). `filters` keys are `min_<field>` / `max_<field>` over the numeric fields of `ScreenerRow` listed in `SCREEN_FIELDS` (all `FloatField`s: `last_close` … `payout_ratio`); an unknown key is refused in `warnings`, not ignored. Rows with a `None` in a filtered field are excluded. `limit` ≤ 100. Each row drops `sparkline`, `recent_closes`, `error`. Warning when `max(technicals_at)` is older than 36 hours.
  - `get_discover_shelves(key: str = '')` (`DiscoverView` / `DiscoverShelfView`), `get_earnings_calendar(week: int = 0, scope: str = 'all')` (`EarningsCalendarView`).
  - `get_fund_signals()` (`InvestorHubView`), `list_investors()` (`InvestorListView`), `get_investor(slug)` (`InvestorDetailView` + `InvestorChangesView` + `InvestorCopyView`), `get_ticker_ownership(symbol)` (investors and congress `OwnershipDetailView`; either side `None` when unknown), `get_congress_member(slug)` (`MemberDetailView`), `get_filing_alerts()` (`InvestorAlertsView`, read-only: never calls the `read` view).

- [ ] **Step 1: Write the failing tests**

- `test_min_max_filters_and_null_exclusion`: three rows (`pe` 10, 30, None); `filters={'max_pe': 20}` → one row.
- `test_unknown_filter_is_refused`: `{'min_banana': 1}` → warning names `min_banana`, no rows filtered by it.
- `test_limit_capped_at_100`.
- `test_stale_scan_warning`.
- `test_alerts_are_not_marked_read`: an unread `FilingAlert` stays unread after `get_filing_alerts()`.
- `test_unknown_ticker_ownership_is_null`.
- `test_investor_combines_detail_changes_and_copy`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(mcp): screener, shelves, earnings calendar, funds and Congress tools"`

---

### Task 8: Valuation history

**Files:**
- Modify: `backend/research/finnhub.py` (add `valuation_series`)
- Create: `backend/research/valuation.py`
- Modify: `backend/mcp_server/tools/research.py` (add `get_valuation_history`)
- Test: `backend/research/test_valuation.py`, `backend/mcp_server/test_valuation_tool.py`

**Interfaces:**
- Produces:
  - `finnhub.valuation_series(symbol) -> dict` through `provider_cache.cached(f'research:valuation-series:v1:{symbol}', …)`, TTL `FUNDAMENTALS_TTL`, `unexpected=FinnhubUnexpected`, one `get_basic_financials` call: `{'annual': {pe, ps, pb, pfcf, ev_ebitda: [{period, v}]}, 'quarterly': {pe_ttm: 'peTTM', ps_ttm: 'psTTM', pfcf_ttm: 'pfcfTTM', ev_ebitda_ttm: 'evEbitdaTTM', eps: 'eps'}}` (Finnhub keys on the right), oldest first, missing series omitted.
  - `valuation.trailing_pe(closes: list[tuple[date, float]], quarterly_eps: list[tuple[date, float]]) -> list[tuple[date, float | None]]`: for each day, the four latest quarters whose period end is ≤ that day; fewer than four, or a sum ≤ 0 → `None`; else `round(close / ttm, 2)`.
  - `valuation.median_since(points, years: int = 5, today=None) -> float | None`.
  - `get_valuation_history(symbol) -> dict`: data `{annual, quarterly, daily_pe: [[iso_date, pe]] (weekly-sampled, Fridays or the last session of the week), medians_5y: {pe_ttm, ps_ttm, pfcf_ttm, ev_ebitda_ttm, daily_pe}, latest: {…}}`. Withheld with a warning when the instrument's `currency` is not `USD` (Finnhub reports US-listing EPS in USD).
- Consumes: `resolve`, `company_data` gate, daily closes via `ChartView` (count 1,200).

- [ ] **Step 1: Write the failing tests**

- `test_ttm_needs_four_quarters`: three quarters known → `None` on those days.
- `test_negative_ttm_is_null`: EPS quarters summing to −0.4 → `None`.
- `test_ttm_rolls_on_period_end`: a close on the day after a quarter end uses that quarter.
- `test_median_since_five_years`.
- `test_series_shaping_omits_missing_and_orders_oldest_first` (patched `_get` with Finnhub's newest-first arrays).
- `test_tool_withholds_non_usd`.

- [ ] **Step 2: Run** `$PY manage.py test research.test_valuation mcp_server.test_valuation_tool` → FAIL.
- [ ] **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(research): valuation series and trailing P/E for the advisor"`

---

### Task 9: `compare_companies`

**Files:**
- Create: `backend/mcp_server/tools/compare.py`
- Test: `backend/mcp_server/test_compare_tool.py`

**Interfaces:**
- Produces: `compare_companies(symbols: list[str]) -> dict`. 2–5 distinct symbols, else `answer(None, warnings=['Compare two to five companies.'])`. Data `{companies: [{symbol, name, status, pillars: {growth, profitability, health, valuation, trend}, ownership}]}`; a company whose status is not `eligible` keeps `status` and `pillars: None`.
- Pillar figures, read from `get_company`'s `metrics`, `ScreenerRow`, `get_valuation_history` and `get_price_history`'s summary (map the names below to the keys `research.finnhub.to_fundamentals` actually emits; a figure the payload lacks is `None`):
  - growth: `revenue_growth_5y_pct, eps_growth_5y_pct, revenue_growth_yoy_pct, eps_growth_yoy_pct`
  - profitability: `gross_margin_pct, operating_margin_pct, net_margin_pct, roe_pct, roic_pct, fcf_margin_pct`
  - health: `debt_to_equity, current_ratio, net_debt_to_equity`
  - valuation: `pe_ttm, forward_pe, peg, ps_ttm, pfcf_ttm, ev_ebitda_ttm`, each with `_vs_5y_median` (ratio to its own median, 2 dp)
  - trend: `zone, change_3m_pct, change_1y_pct, pct_from_52w_high, rsi14`
  - ownership: from `get_ticker_ownership`.
- Symbols are fetched one after another; a company whose fundamentals come back `available: false` keeps its other pillars and adds the reason to `warnings`.

- [ ] **Step 1: Write the failing tests**

- `test_one_symbol_is_refused`, `test_six_symbols_are_refused`, `test_duplicates_count_once`.
- `test_foreign_company_keeps_status_and_null_pillars`.
- `test_busy_finnhub_degrades_one_company`: second symbol's fundamentals `available: False` → its `valuation` pillar figures `None`, its `trend` still filled, a warning names it.
- `test_valuation_vs_median`: `pe_ttm 30`, median `20` → `pe_ttm_vs_5y_median == 1.5`.
- `test_loss_maker_pe_is_null`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**; register. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(mcp): compare two to five companies on the playbook pillars"`

---

### Task 10: The `advisor` app and the journal tools

**Files:**
- Create: `backend/advisor/__init__.py`, `apps.py`, `models.py`, `admin.py`, `journal.py`, `migrations/0001_initial.py` (via `makemigrations`)
- Modify: `backend/backend/settings.py` (`'advisor'`), `backend/mcp_server/tools/__init__.py`
- Create: `backend/mcp_server/tools/journal.py`
- Test: `backend/advisor/test_journal.py`, `backend/mcp_server/test_journal_tools.py`

**Interfaces:**
- Produces:
  - `advisor.models.Recommendation`: `ticker` (CharField 16), `uic` (PositiveIntegerField), `asset_type` (CharField 20), `action` (choices `buy_new, add, trim, sell, watch, hold, harvest_loss, harvest_gain`), `review` (Bool, default False), `thesis` (Text), `bear_case` (JSON list), `invalidation` (JSON `{price, conditions}`), `target` (JSON `{price, condition}`), `buy_range` / `sell_range` (JSON `{low, high}`, nullable), `figures` (JSON), `lenses` (JSON list), `zone` (Char 20, blank), `conviction` (choices `low, medium, high`), `horizon` (choices `3m, 6m, 12m`), `uncertainties` (JSON list), `entry_price` (Float), `entry_currency` (Char 3), `recorded_at` (DateTime, auto_now_add), `decision` (choices `pending, accepted, declined`, default `pending`), `closed_at` (DateTime null), `close_reason` (choices `sold, invalidated, superseded`, blank). Ordering `-recorded_at`.
  - `journal.log(**fields) -> Recommendation`: resolves `uic`/`asset_type`/`currency` with `mcp_server.tools.research.resolve`; fills `entry_price` from the last daily close of `ChartView`; raises `journal.Refused(reason)` for an unresolvable ticker, a missing `thesis`, fewer than 3 `bear_case` items, no `invalidation`, or a `buy_new`/`add` without `target`.
  - `journal.wanted_tickers() -> tuple[set, set]`: (tickers of recommendations not closed, all tickers); `AdvisorConfig.ready()` calls `investors.price_feed.add_ticker_source(journal.wanted_tickers)`, as `congress/apps.py` does.
  - Tools: `log_recommendation(ticker, action, thesis, bear_case, invalidation, horizon, conviction, target=None, buy_range=None, sell_range=None, figures=None, lenses=None, zone='', review=False, uncertainties=None) -> dict` (data = the stored row incl. `id`, `entry_price`), `set_decision(id, decision)`, `close_recommendation(id, reason)`, `list_recommendations(status: str = 'open', limit: int = 50)` (scores added in Task 11).
- Consumes: `resolve`, `call_view(ChartView, …)`.

- [ ] **Step 1: Write the failing tests**

- `test_entry_price_comes_from_saxo_not_the_caller`: tool has no `entry_price` parameter; stored value equals the patched chart's last close.
- `test_refuses_buy_without_target`, `test_refuses_fewer_than_three_risks`, `test_refuses_unresolvable_ticker`.
- `test_ticker_without_price_history_is_logged_and_wanted`: no `PriceHistory` row → logged, and `'NEWCO' in wanted_tickers()[0]`.
- `test_closed_recommendation_leaves_current_but_stays_ever`.
- `test_decline_is_recorded`.

- [ ] **Step 2: Run** `$PY manage.py test advisor mcp_server.test_journal_tools` → FAIL.
- [ ] **Step 3: Implement**; `$PY manage.py makemigrations advisor`.
- [ ] **Step 4: Run** → PASS. Then from the main checkout's backend: `$PY manage.py migrate advisor` against the dev DB → `Applying advisor.0001_initial... OK`.
- [ ] **Step 5: Commit** — `git commit -m "feat(advisor): decision journal model and its MCP tools"`

---

### Task 11: Journal scoring

**Files:**
- Create: `backend/advisor/scoring.py`
- Modify: `backend/mcp_server/tools/journal.py` (`list_recommendations` adds scores and a summary)
- Test: `backend/advisor/test_scoring.py`

**Interfaces:**
- Produces:
  - `CHECKPOINTS = {'3m': 91, '6m': 182, '12m': 365}`; `DIRECTION = {buy_new: 1, add: 1, hold: 1, watch: 1, trim: -1, sell: -1}`; `harvest_*` are not scored.
  - `scoring.score(rec, prices: dict[str, Series], benchmark: Series, today: date) -> dict`: `{entry_day, checkpoints: {'3m': {day, return_pct, benchmark_pct, excess_pct} | None, …}, latest: {…} | None}`. `entry_day` = first session after `recorded_at.date()` in both series (`Series.after`), or for `watch` the first session after recording whose close is ≤ `buy_range.high` (`None` if never touched → every checkpoint `None`). A checkpoint later than `today` or than `closed_at` is `None`; a closed recommendation's `latest` is measured at `closed_at`. `excess_pct = DIRECTION[action] * (return_pct - benchmark_pct)`, 2 dp. Missing ticker series → all `None`.
  - `scoring.summary(scored: list[dict]) -> dict`: mean `excess_pct` at each checkpoint overall, by `conviction` and by `action`, with `n`; declined recommendations included and also reported separately.
- Consumes: `investors.copying.price_series`, `investors.prices.Series`, `BENCHMARK_TICKER`.

- [ ] **Step 1: Write the failing tests** (fixed `Series` fixtures, `today` injected)

- `test_buy_beats_benchmark`: ticker 100→120, SPY 100→105 at day 91 → `excess_pct == 15.0`.
- `test_sell_is_scored_inverted`: same prices, `action='sell'` → `-15.0`.
- `test_future_checkpoint_is_null`.
- `test_closed_recommendation_stops_at_close`.
- `test_watch_starts_when_buy_range_touched` and `test_untouched_watch_is_unscored`.
- `test_harvest_is_not_scored`.
- `test_missing_series_scores_null` (Review Focus 4).
- `test_summary_by_conviction_includes_declined`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(advisor): score journal calls against the S&P 500 at 3, 6 and 12 months"`

---

### Task 12: Tax year

**Files:**
- Create: `backend/portfolio/tax_year.py`, `backend/mcp_server/tools/tax.py`
- Modify: `backend/saxo/client.py` (one function for the endpoint Task 1 found, if any)
- Test: `backend/portfolio/test_tax_year.py`, `backend/mcp_server/test_tax_tool.py`

**Interfaces:**
- Produces:
  - `RATE = Decimal('0.10')`, `EXEMPTION_EUR = Decimal('10000')`, `CARRY_OVER_CAP_EUR = Decimal('5000')`, `BASIS_DAY = date(2025, 12, 31)`, `ADVISER_NOTE = 'Check with a Belgian tax adviser.'`.
  - If Task 1 found an endpoint: `saxo.client.get_closed_trades(access_token, from_date, to_date) -> list[dict]` and `tax_year.realised(rows, year) -> list[{ticker, closed_on, qty, realised_eur}]` using the account-currency P/L field Task 1 named. Otherwise `realised` is not built and the tool says "Realised gains are not available from Saxo's API; take them from Saxo's annual tax report."
  - `tax_year.unrealised(positions, basis_closes: dict[str, float | None], opened_on: dict[str, date | None]) -> list[{ticker, basis, basis_source: 'dec_31_2025' | 'avg_cost', unrealised_eur}]`: basis is the 31 December 2025 close when the position was opened on or before `BASIS_DAY`, else `avg_cost`; `unrealised_eur = qty × (current_price − basis) × fx_rate`; a missing Dec-31 close → `unrealised_eur None` with the ticker in warnings. Opening date = the earliest `Transaction.date` for the ticker.
  - `tax_year.summary(realised_rows, unrealised_rows, carry_over_eur) -> {realised_net_eur, exemption_eur, exemption_left_eur, taxable_eur, estimated_tax_eur, unrealised_gains_eur, unrealised_losses_eur}`, `exemption_eur = EXEMPTION_EUR + min(carry_over_eur, CARRY_OVER_CAP_EUR)`.
  - Tool `get_tax_year(year: int = <current>, carry_over_eur: float = 0) -> dict`; warnings always include `ADVISER_NOTE` and "FX: today's rate is used for both ends of an unrealised gain."; never contains the words "sell and rebuy".
- Consumes: `Position`, `Transaction`, daily closes through `ChartView` (the Dec-31 close: last bar dated ≤ `BASIS_DAY`).

- [ ] **Step 1: Write the failing tests**

- `test_pre_2026_position_uses_dec_31_close`, `test_2026_position_uses_avg_cost`.
- `test_unrealised_is_converted_with_fx_rate`: qty 10, price 120, basis 100, fx 0.9 → `180.00`.
- `test_missing_basis_close_is_null_and_warned`.
- `test_exemption_with_capped_carry_over`: `carry_over_eur=8000` → `exemption_eur == 15000`.
- `test_tax_only_above_exemption`: realised 12,000 → taxable 2,000 → tax 200.
- `test_losses_offset_gains_same_year`.
- `test_adviser_note_always_present`.
- If Task 1 found an endpoint: `test_realised_rows_from_saxo_payload` against the redacted sample saved in Task 1.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(portfolio): tax-year view for the advisor"`

---

### Task 13: Docs, Claude Desktop wiring and a live check

**Files:**
- Modify: `docs/running-the-stack.md` (section "The MCP server"), `AGENTS.md` (one "Decided" entry)
- Create: `learning/learning-records/NNNN-mcp-stdio-and-in-process-views.md` if anything surprised

- [ ] **Step 1: Document**

`running-the-stack.md`: the `claude_desktop_config.json` block from the spec with the real venv path, that Redis must be running, the `MCP_USER` env, and, per Task 1, whether Cowork sees it (or the `.mcpb` route). `AGENTS.md` "Decided": the advisor reads the app through `mcp_server`, which dispatches the pages' own views in-process so the two cannot disagree; it never touches banking or orders; its only writes are `advisor.Recommendation` rows, whose entry price the server fills.

- [ ] **Step 2: Full suite**

Run: `$PY manage.py test` → all pass; `cd ../frontend && npx vitest run` → all pass; `npx eslint src` → clean.

- [ ] **Step 3: Live check in Claude Desktop**

Configure, restart Claude Desktop, then ask: "What's in my portfolio?", "Compare NVDA, AMD and AVGO", "Show GOOGL's P/E against its own history", "What's my tax year look like?". Expected: tools called, numbers equal the Portfolio and Research pages, warnings shown when the Saxo token has lapsed. Log one test recommendation and decline it; check it in Django admin.

- [ ] **Step 4: Commit**

```bash
git add docs/running-the-stack.md AGENTS.md
git commit -m "docs(mcp): wire Claude Desktop to the SaxoDash MCP server"
```
