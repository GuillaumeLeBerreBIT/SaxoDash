# MCP Server Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every tool's behaviour, but restructure `mcp_server`, `advisor` and the tax-year code so that domain rules live in the apps that own them, tool plumbing is written once, and the nine open follow-up issues are fixed.

**Architecture:** Domain modules gain the logic the tools currently hold: `research/listings.py` (what is this symbol), `research/daily.py` (daily closes), `research/price_summary.py` (summary + playbook zone), `research/valuation.py::history`, `portfolio/tax_year.py::report`, `advisor/journal.py` (whole journal lifecycle). `mcp_server` becomes a thin adapter: one `@tool` decorator owns sources, Saxo warnings, refusals, Redis-down and JSON-safe money; tools return data (or data + warnings) or raise `Unavailable`.

**Tech Stack:** Django 6 + DRF, `mcp==1.30.0` FastMCP, SQLite, Redis.

**Sources:** `.superpowers/sdd/2026-10-21-mcp-server/architecture-candidates.md` (A1–A6) and `.superpowers/sdd/2026-10-21-mcp-server/thermo-nuclear-review.md` (F1–F8) give the reasoning and sketches for each task; the original spec is `docs/superpowers/specs/2026-10-21-mcp-server-design.md`. Open-issue numbers (#1–#9) refer to the list at the end of this plan.

## Global Constraints

- Every existing tool keeps its name, parameters and data keys unless a task says otherwise. Existing behaviour tests keep passing (rewrite their patch targets, not their assertions).
- Generated code carries zero comments (`AGENTS.md`).
- `$PY` = `/Users/guillaumeleberre/Develop/GuillaumesLab/WebDevelopment/SaxoDash/backend/.venv/bin/python`, run from `.worktrees/mcp-server/backend`. No test calls Saxo or Finnhub.
- No app imports `mcp_server`. `advisor` may import `research`, `investors`, `portfolio`.
- An absent figure is `None`, never `0`. Money in a tool answer is a JSON number (float, 2 dp for `_eur` figures), never a string.
- An instrument is a uic and an asset type (AGENTS.md); per-instrument lookups are keyed that way, not by ticker.
- No banking reads, no orders, no syncs. The only writes are `advisor.Recommendation` rows.

## Review Focus

1. A foreign listing must still get no Finnhub/SEC/ownership call after the gate moves into `Listing` (every company tool, compare, ownership).
2. The Research page's own views and payloads are unchanged by moving helpers into `research/` (run the full `research` suite).
3. Saxo disconnected mid-call still yields `data: None` + a warning for every Saxo-backed tool after the decorator rewrite.
4. Tax: a year before 2026 is refused; the 31 Dec 2025 basis is still used for pre-2026 lots after `report()` takes over orchestration.
5. The journal never accepts a caller-supplied entry price after its lifecycle moves into `advisor`.

---

### Task 1: `research/listings.py` — one resolved `Listing` (A1, F4, #2)

**Files:** Create `backend/research/listings.py`, `backend/research/test_listings.py`. Move `backend/mcp_server/company_data.py` → `backend/research/company_data.py` and its test (`git mv`; the parity fixture path stays). Modify every caller: `mcp_server/tools/research.py`, `compare.py`, `smart_money.py`, `advisor/journal.py`, and tests that patch `mcp_server.tools.research.resolve`.

**Interfaces (produces):**
- `@dataclass(frozen=True) class Listing: ticker: str; symbol: str | None; name: str | None; uic: int | None; asset_type: str | None; currency: str | None; exchange: str | None` with `resolved: bool` (property: `uic is not None`), `company_status` (property, `company_data.status(asset_type=…, currency=…, resolved=…)`), `refusal(*, allow_fund=False) -> str | None`, `unverified_warning -> str | None` (`'<TICKER> could not be matched to a Saxo listing, so it is assumed to be US-listed.'` when not resolved, else None), `as_dict() -> dict` (the instrument keys the tools return today).
- `bare(symbol) -> str`, `look_up(symbol) -> Listing` (never None: an unresolved symbol is `Listing(ticker=…, rest None)`).
- Lookup order, cache (`mcp:resolve:v1:` key → rename `research:listing:v1:<TICKER>`, 600 s, found only), USD preference and details-currency completion move unchanged from `tools/research.py`. Ruling: it calls `research.market.search` / `market.details` directly and maps `ProviderError` to "not found"; the DRF `research.search` throttle no longer applies to internal lookups (results stay cached).

- [ ] Steps: failing `research/test_listings.py` (held position wins with no Saxo call; USD row preferred; details completes a missing currency; cache hit = one search; unresolved → `Listing` with `resolved False`, `company_status 'eligible'`, `unverified_warning` set; `refusal` per status incl. `allow_fund`) → RED → implement → move company_data → rewrite callers to take a `Listing` (`_gate` becomes `listing.refusal(...)`; compare resolves once; ownership uses `listing.refusal(allow_fund=True)`; advisor imports `research.listings` at module top) → every company tool (company, statements, filings/insiders, news, valuation) adds `listing.unverified_warning` to its warnings (#2) with one test → full `research`, `mcp_server`, `advisor` suites green → commit `refactor(research): one Listing decides what a symbol is and who may ask about it`.

### Task 2: one `@tool` decorator owns the envelope (F2, A6, F8, #3, #4)

**Files:** `backend/mcp_server/tools/__init__.py`, `envelope.py`, `views.py`, `server.py`, every `tools/*.py`; tests `test_envelope.py`, `test_server.py`, per-tool tests where sources per path were asserted.

**Interfaces (produces):**
- `class Unavailable(Exception)` (message = the warning).
- `views.fetch(view, *, kwargs=None, query=None) -> data` — `call_view`, raise `Unavailable(problem(result))`, return `shaping.without(result.data)`.
- `views.fetch_optional(view, warnings: list, **params) -> data | None` — appends the message instead of raising.
- `tool(description, *, sources: list[str], saxo: bool = False)`: the wrapped function returns `data` or `(data, warnings)`; the decorator builds `answer(...)` with `saxo_warnings()` first when `saxo=True`, converts `Unavailable` and Redis `ConnectionError`/`TimeoutError` into `answer(None, warnings=[*, message])`, and makes the data JSON-safe: `Decimal` → float, `date`/`datetime` → ISO string (#3). `server.py`'s Redis special case and `_failed`, `_refuse`, `_part` disappear; `problem()` is called once per view result.
- `saxo=True` on every tool whose data comes from Saxo, including `get_transactions` and `get_earnings_calendar` (#4); composite tools add Saxo warnings once, not per part.
- F8: one way to cap (`shaping.capped`), one way to drop `series`; `get_price_history` uses an `{interval: (horizon, cap)}` table.

- [ ] Steps: failing `test_envelope.py`/`test_server.py` cases for the decorator (data, (data, warnings), Unavailable, Redis, saxo flag ordering, Decimal/date serialisation) → RED → implement → rewrite tools one file at a time keeping each file's tests green → add a test that `get_portfolio` and `get_tax_year` both return floats for money (#3) and that `get_transactions` carries Saxo warnings (#4) → suites green → commit `refactor(mcp): the tool decorator owns sources, refusals and JSON-safe money`.

### Task 3: data functions under the tools; compare composes them (A2, A4, F3, F7, #8)

**Files:** Create `backend/research/daily.py`, `backend/research/price_summary.py` (absorbs `mcp_server/zones.py`, deleted; `test_zones.py` → `research/test_price_summary.py`), extend `backend/research/valuation.py`, `backend/research/finnhub.py`; modify `mcp_server/tools/research.py`, `compare.py`, `smart_money.py`.

**Interfaces (produces):**
- `daily.candles(listing) -> list[candle]` (always `client.CHART_MAX_COUNT` bars via `market.chart`, horizon 1440; raises `ProviderError`/`ProviderNotConnected`), `daily.latest_close(candles)`, `daily.close_on_or_before(candles, day)`, `daily.reason(exc) -> str` (same wording `views.problem` uses).
- `price_summary.summarise(candles) -> {summary, zone}` (moves `_summary`, `_change_pct`, `_last`, constants, `zone`).
- `valuation.history(listing, candles, series) -> (data, warnings)` (body of `get_valuation_history`), `valuation.current_pe(metrics, latest)`; the positivity rule has one owner (Finnhub shaping); compare's copy goes.
- `finnhub.valuation_series`: drop its own outer cache (reads the two shared 24h inputs and shapes them); a failed or busy profile call degrades to `country None` instead of failing the series (#8).
- `smart_money.ownership(listing) -> (data, warnings)` used by `get_ticker_ownership` and compare.
- `compare._compare_one(listing)`: one `daily.candles`, one fundamentals fetch, one `valuation_series`, `ownership(listing)`; warnings prefixed in one place; Saxo warnings added once for the whole call (#4); `_company`, `_prefixed` and the dedupes go. Tests fake providers (`research.market.chart`, `research.finnhub.*`, `research.market.search`) instead of patching compare's internals.

- [ ] Steps: failing tests for `daily`, `price_summary`, `valuation.history`, `valuation_series` with a failing profile (#8), compare making one chart call per symbol → RED → implement → tools become thin → suites green → commit `refactor(research): price summary, valuation history and ownership are data functions the tools share`.

### Task 4: `tax_year.report` owns the tax orchestration (A3, F5, #1, #9)

**Files:** `backend/portfolio/tax_year.py`, `backend/mcp_server/tools/tax.py`, `backend/saxo/client.py` or `saxo/credentials.py` (one saxo-owned closed-positions fetch), tests `portfolio/test_tax_year.py`, `mcp_server/test_tax_tool.py`.

**Interfaces (produces):**
- `tax_year.report(year, carry_over_eur, *, closed_rows, close_on) -> {realised, unrealised, summary, warnings}`; `closed_rows` is a list or `(None, reason)`; `close_on(uic, asset_type, day) -> (Decimal | None, warning | None)`, memoised by the caller. `report` reads `Position` and `Transaction` lots itself; `needs_basis_close` and `basis_instruments` are deleted; every domain warning (unsplit, missing close, no purchase, realised failure) is produced inside `report`; all closes keyed by (uic, asset_type).
- #1: `year < 2026` → refused: `'Belgian capital-gains tax starts in 2026; there is no tax year before it.'` (tool returns data None).
- #9: a holding with no BUY on record no longer falls back to avg_cost. `sync_positions` writes a BUY per open lot dated `ExecutionTimeOpen`, so a missing BUY means the opening date is unknown: that holding's unrealised is `None` with the warning `'<TICKER>: no recorded purchase, so its opening date (before or after 2026) is unknown.'`, never an avg_cost figure.
- The tool: fetch closed rows via the saxo-owned function, pass `close_on` backed by `research.daily`, serialise.

- [ ] Steps: failing `report()`-level tests (I3/I4 regressions, #1, #9, uic-keyed closes) → RED → implement → shrink the tool and its tests to adapter cases → suites green → commit `refactor(portfolio): tax_year.report owns the tax year; the tool only fetches and serialises`.

### Task 5: `advisor.journal` owns the journal lifecycle (A5, F1)

**Files:** `backend/advisor/journal.py`, `backend/advisor/scoring.py`, `backend/mcp_server/tools/journal.py`, tests `advisor/test_journal.py`, `advisor/test_scoring.py`, `mcp_server/test_journal_tools.py`.

**Interfaces (produces):** `journal.log(*, listing, entry_price, **fields)`, `journal.decide(rec_id, decision)`, `journal.close(rec_id, reason)`, `journal.review(status, today=None) -> {rows: [(rec, score)], summary, benchmark_missing}` — all raise `Refused`; choice validation via `full_clean()` (ValidationError → `Refused`); the USD rule stays in `advisor`. `scoring.summary(pairs)` reads model attributes. The tool resolves (`research.listings.look_up`), takes the entry price from `research.daily.latest_close`, maps arguments, catches `Refused`, serialises once. No `mcp_server` import anywhere in `advisor`.

- [ ] Steps: move validation/transition/review tests to `advisor/test_journal.py` (failing first) → implement → tool test keeps round-trip + `Refused` → warning + "no entry_price parameter" → suites green → commit `refactor(advisor): the journal owns logging, decisions, closing and review`.

### Task 6: insights without the copy (F6)

**Files:** `backend/portfolio/insights.py`, its tests.

**Interfaces:** `_position_sections(positions, today)`, `_position_attention(...)`, `_history_attention(pairs, today)`; `build_insights` and `build_position_insights` both spread `_position_sections`; the `pairs=[]` + kind-filter goes. Dashboard payload byte-identical (existing `portfolio` tests + one equality test of the shared sections).

- [ ] Steps: RED test pinning both builders share sections → refactor → `portfolio`, `mcp_server` suites green → commit `refactor(portfolio): one set of position insights for the Dashboard and the advisor`.

### Task 7: remaining open issues (#5, #6, #7) and docs

**Files:** `mcp_server/tools/research.py` (notes), every tool description, `mcp_server/test_protocol.py` (new), parity tests, `docs/running-the-stack.md`, `AGENTS.md` (the MCP "Decided" entry).

- #5 `get_my_notes` adds the instrument's `PriceLine` rows (resolve → uic + asset type; read-only).
- #6 every tool description starts with the page it mirrors ("Portfolio page: …", "Research › Financials: …"); tools with no page say "Advisor:".
- #7 an in-process protocol test that runs in the normal suite: `mcp.shared.memory.create_connected_server_and_client_session(build_server()._mcp_server)` (or the 1.30 equivalent), lists tools and calls `get_data_health` and `compare_companies` with a list argument; one parity test per page-backed tool (tool data equals the view's data after the documented reshaping). The `MCP_E2E` stdio test stays.
- Docs and the AGENTS.md entry describe the new module layout in one or two sentences each.

- [ ] Steps: failing tests → implement → full `$PY manage.py test` (2 pre-existing saxo authorize-URL failures allowed) → commit `feat(mcp): notes with price lines, page-named descriptions, protocol and parity tests`.

---

## Open issues referenced (#1–#9)

1. Pre-2026 tax years aren't refused. 2. Company tools don't flag an unverified listing. 3. Money comes back as strings in some tools, numbers in others. 4. Saxo warnings uneven (compare repeats per company; transactions and earnings calendar carry none). 5. `get_my_notes` omits price lines. 6. Descriptions don't name the page they mirror. 7. Protocol test only with `MCP_E2E=1`; parity tested only for `get_portfolio`. 8. Valuation history fails whole when the profile call fails. 9. Pre-2026 holding with no BUY on record measured from avg cost.
