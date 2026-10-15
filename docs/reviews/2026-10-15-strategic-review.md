# SaxoDash: strategic review (2026-10-15)

A product, architecture and investment review of SaxoDash as a primary, 20-year
long-term investment platform. No code was changed for this review. Evidence is
cited as `path:line` or as a named function/model. Where a finding is inferred
rather than verified, it is marked **(hypothesis)**.

**Evidence gathered**

- **Repository:** read at commit `ab23ba6`, the merge of PR #26.
- **Backend tests:** 1,550 tests, all passing. They need throwaway values for
  `SAXO_TOKEN_ENCRYPTION_KEY` and `ENABLE_BANKING_*`, because without them the
  system checks refuse to run.
- **Frontend tests:** 2,247 of 2,248 pass. The one failure is in
  `src/lib/niceTicks.test.js`, "handles a tiny range": it expects ticks at
  0.0002 spacing and gets 0.0005.
- **Limits of this review:**
  - The live dev database (`db.sqlite3`) is not in the repo, so nothing here
    describes your real holdings or history.
  - Whether you run against Saxo SIM or live is not visible from code. The
    default is `SAXO_ENVIRONMENT=sim` (`backend/backend/settings.py:263`).

---

## A. Executive assessment

### What the application already does well

- **Engineering discipline is unusually high for a personal project.** The
  codebase shows:
  - About 3,800 automated tests.
  - A written decision log (`AGENTS.md`, "Decided").
  - Explicit handling of currency (`core.money.Money` raises `CurrencyMismatch`).
  - Disclosure of how stale a price is (`Position.price_source`, `PriceBasisNote`).
  - Sync health tracked per run (`SyncRun`, `@synced`).
  - Provider failures mapped to HTTP in one place (`research/providers.py`).
  - Rate limiting at the point where calls leave the app (`finnhub._get`).
  - Nightly backups (`core.tasks.backup_database_task`).

  The recurring theme is "an absent figure is not zero". That is exactly the
  right instinct for a financial tool.
- **Company research is deep for a free-data stack.**
  - Reported statements are mapped from SEC XBRL (`research/statements.py`,
    `statement_shaping.py`), including the year-to-date-to-quarter arithmetic.
  - Split-adjusted EPS, TTM ratios, and ratio history (`lib/ratioHistory.js`).
  - Peers, earnings history, filings and merged insider trades
    (`research/filings.py`), plus news.
  - Strict US-only gating of company data (`lib/companyData.js`).
- **The Investors (13F) module is the most distinctive feature.** It handles:
  - Amendments at read time (`investors/quarters.py`).
  - The SEC's change of value unit by filing date.
  - CUSIP→ticker resolution with inheritance (`investors/handovers.py`).
  - Cross-fund signals (`investors/signals.py`, `PositionMove`).
  - Filing alerts (`investors/alerts.py`).
  - "Copy performance" clones with honest caveats (`investors/copying.py`).

  It is also wired into Portfolio (the Funds column) and Research (the Funds
  tab) through `investors/ownership.py`.
- **The thesis concept already exists.** `research.SymbolNote` holds a
  business summary, risks, bull and bear cases, target and stop prices, a sell
  trigger and a `reviewed_at` date. `portfolio/insights.py::_thesis_attention`
  surfaces holdings whose thesis is overdue.

### Whether the current direction supports the stated purpose

Only partly. Over the last ~10 merged PRs, most effort went into a
TradingView-style chart workspace: panes, linked crosshair, trend lines, text
annotations, axis panning, a resizable sidebar. `docs/next-steps.md` lists more
of the same next: drawing tools, Fibonacci, scripting, per-line colour.

That is trading-terminal tooling. It is a weak fit for a 20-year,
fundamentals-driven investor, and it is consuming the budget the portfolio
ledger needs.

### The most important weaknesses (verified in code)

1. **Performance figures are not cash-flow adjusted.** Every return in the
   app is "end value / start value − 1" on a value series:
   - `analytics/metrics.py::window_return`, `daily_returns`, `monthly_returns`.
   - `portfolio/insights.py::_delta`.

   The series is `NetWorthSnapshot.saxo_account_value`
   (`analytics/views.py::_portfolio_dated_values`). Nothing in the backend
   models deposits or withdrawals; a search for deposit, contribution,
   withdraw, TWR and XIRR outside banking finds no handling. So a €10,000
   deposit into Saxo shows up as positive return. Every metric built on that
   series inherits the error:
   - Sharpe, Sortino and volatility.
   - Beta and alpha versus the benchmark.
   - Calendar-year returns.
   - The Monte Carlo projection (`lib/monteCarlo.js`, fitted to these returns).

   For someone who adds money monthly, this is the single biggest source of
   wrong conclusions in the app.
2. **The transaction ledger is incomplete by construction.**
   - `Transaction` rows of type DIVIDEND, DEPOSIT and FEE are never written
     (`transactions/models.py:6`).
   - Entry trades are derived from currently *open* positions
     (`saxo/mapping.py::to_transaction_fields`).
   - There are no commissions, withholding tax, realized P/L or cost-basis
     lots.
   - Realized gains and dividend income cannot be computed. That makes
     performance attribution, total return and a Belgian tax view impossible.
3. **Position identity is the bare ticker.**
   - `Position.ticker` is `unique=True` (`portfolio/models.py:26`).
   - `sync_positions` upserts on it (`saxo/tasks.py`, `update_or_create(ticker=...)`).
   - `bare_symbol` drops the exchange (`saxo/mapping.py:23`).

   Two Saxo positions in the same ticker therefore overwrite each other's
   `qty` and `avg_cost` within one sync. That covers two lots, or two listings
   such as `NVDA:xnas` and `NVDA:xetr`. It contradicts the repo's own rule
   that "an instrument is a uic *and* an asset type".

   **(Hypothesis on impact)** Whether Saxo returns multiple rows per
   instrument depends on the account's netting mode. Check this against a
   live payload. If it does, quantities are understated silently.
4. **Positions have no history.** A sold position is deleted
   (`Position.objects.exclude(...).delete()`). The only history is one daily
   aggregate row (`NetWorthSnapshot`). The app cannot answer:
   - What did I hold on a given date?
   - What was my weight in a holding when I bought more?
   - How has my sector mix drifted?
5. **The thesis has no history.** `SymbolNote` is one mutable row per symbol,
   keyed on `symbol`, not uic. Editing the thesis destroys the original
   reasoning, which is the part a decision review needs most.
6. **The setup contradicts its own documentation.**
   - `backend/.env.example` says every key is optional in development.
   - In practice, `manage.py check` and the test runner refuse to start
     without `SAXO_TOKEN_ENCRYPTION_KEY` and both `ENABLE_BANKING_*` values.
   - There is no CI (no `.github/workflows`), so nothing enforces the 3,800
     tests on a PR.

### Is the infrastructure ready for expansion?

For read-only analysis features, yes. The provider seam, caching, throttling,
sync health and test culture are a good base. It is **not** ready for:

- Anything that depends on historical portfolio facts: attribution, tax, a
  rebalancing history, or ML on your own behaviour.
- Anything that depends on point-in-time market data. `ScreenerRow` is
  overwritten nightly and keeps no history, so screens can't be backtested.

### Overall

SaxoDash has strong *research* capability and weak *bookkeeping*. A primary
platform for 20 years must first be a trustworthy record of what you owned,
what you paid, what you received and what it returned. Research quality
cannot compensate for a performance figure that counts your own deposits as
gains.

The highest-value work is not a new module. It is making the portfolio
ledger correct and historical, then building the decision-review workflow on
top of that ledger.

---

## B. Capability assessment

**Holdings and valuation**
- **Current state:** Positions synced every 30 min. Valuation reconciled to
  Saxo's `NonMarginPositionsValue`. Staleness disclosed (`price_source`).
  Currency-safe sums.
- **Main gap or risk:** Keyed on bare ticker, so lots and listings collide.
  No history of positions.
- **Investor impact:** Quantity understatement is possible; "what did I hold"
  can't be answered.
- **Priority:** P0

**Performance and returns**
- **Current state:** Trailing, year-to-date, calendar-year and since-inception
  returns. Sharpe, Sortino, drawdown, beta and alpha versus a benchmark. Data
  quality tiers (`analytics/metrics.py`).
- **Main gap or risk:** Not cash-flow adjusted (no TWR or money-weighted
  return). Deposits read as gains.
- **Investor impact:** Every return and risk figure is wrong for anyone who
  contributes.
- **Priority:** P0

**Transactions and income**
- **Current state:** Entry trades from open positions. Exit trades from
  closed positions.
- **Main gap or risk:** No dividends, deposits, fees, withholding tax or
  realized P/L. Lots are lost.
- **Investor impact:** No total return, no income view, no tax basis.
- **Priority:** P0

**Allocation and exposure**
- **Current state:** Sector and type exposure, concentration (top-1, top-3,
  HHI), allocation donut (`portfolio/insights.py`). Sector from Finnhub
  backfill.
- **Main gap or risk:**
  - No geography or currency exposure view, although `currency` is stored.
  - ETFs are not looked through.
  - No targets, so no drift.
- **Investor impact:** Can't see real country or currency risk. ETF-heavy
  books look "Uncategorized".
- **Priority:** P1

**Rebalancing and targets**
- **Current state:** None.
- **Main gap or risk:** No target allocation model.
- **Investor impact:** No discipline check against strategy.
- **Priority:** P1

**Benchmarking**
- **Current state:** EUR-converted benchmarks (`analytics/benchmarks.py`).
- **Main gap or risk:** Compared against an unadjusted series. Price return
  only, no dividends.
- **Investor impact:** Alpha is unreliable.
- **Priority:** P0, fixed by the same work as performance.

**Currency effects**
- **Current state:** `fx_rate` is stored per position.
- **Main gap or risk:** No split of local-currency return from the FX effect.
- **Investor impact:** A USD gain driven by EUR/USD looks like stock-picking.
- **Priority:** P1

**Belgian tax**
- **Current state:** None.
- **Main gap or risk:** Needs dividends, withholding tax, the TOB stock-market
  tax on trades, and realized gains data. None of it is stored.
- **Investor impact:** Net-of-tax return unknown.
- **Priority:** P2 (after the ledger)

**Company fundamentals**
- **Current state:** Strong. Statements, TTM ratios, ratio history, split-safe
  EPS, peers and earnings (`research/*`).
- **Main gap or risk:**
  - No valuation-versus-own-history band (current P/E against its 5–10 year
    range).
  - No owner-earnings yield.
  - No ROIC.
  - No SBC/dilution trend surfaced as a quality flag **(hypothesis: some rows
    exist in the statements map but are not composed into a verdict)**.
- **Investor impact:** Hard to separate "good company" from "good price".
- **Priority:** P1

**Valuation (DCF and reverse DCF)**
- **Current state:** None.
- **Main gap or risk:** No implied-growth / reverse DCF.
- **Investor impact:** The key question "what is the market pricing in?" goes
  unanswered.
- **Priority:** P1

**Filings and insiders**
- **Current state:** 10-K, 10-Q and 8-K by form. Insiders merged per trade.
  Open-market buys and sells separated (`research/filings.py`).
- **Main gap or risk:** US only.
- **Investor impact:** Good.
- **Priority:** keep

**Institutional ownership (Investors)**
- **Current state:** Mature. 13F import, signals, alerts, copy performance;
  integrated into Portfolio and Research.
- **Main gap or risk:**
  - 45-day lag and long-only disclosure, which the UI states.
  - The copy clone has no dividends.
- **Investor impact:** Useful context, low decision weight.
- **Priority:** maintain; don't expand

**Discovery and screening**
- **Current state:** Nightly scan of S&P 500 ∪ Nasdaq-100 into `ScreenerRow`;
  declarative shelves (`research/shelves.py`).
- **Main gap or risk:**
  - No user-defined screens.
  - No point-in-time history.
  - Universe is US large-cap only, hand-refreshed CSV.
- **Investor impact:** Fine for idea browsing; can't validate a screen.
- **Priority:** P2

**Watchlists**
- **Current state:** Multiple lists, keyed on uic; synced with holdings
  (`research/watchlists.py`).
- **Main gap or risk:** No reason or trigger per item, such as "buy below X
  when Y".
- **Investor impact:** Watchlist doesn't drive action.
- **Priority:** P1 (folds into thesis work)

**Thesis and decision record**
- **Current state:** One mutable `SymbolNote` per symbol; overdue review
  surfaced on Dashboard.
- **Main gap or risk:**
  - No version history.
  - Not linked to the trades it justified.
  - Keyed on symbol, not uic.
  - No review outcome recorded.
- **Investor impact:** Can't learn from your own decisions.
- **Priority:** P1

**Earnings**
- **Current state:** Calendar ("mine" and all), history, surprises, insights.
- **Main gap or risk:** Two quarters of estimates only (free tier).
- **Investor impact:** Adequate.
- **Priority:** keep

**Charting workspace**
- **Current state:** Very rich: 4 panes, annotations, indicators, linking.
- **Main gap or risk:** Already beyond a long-term investor's needs. The
  roadmap adds more.
- **Investor impact:** Opportunity cost.
- **Priority:** freeze

**Market and macro context**
- **Current state:** None (FRED deliberately deferred). Heatmaps of your
  holdings and watchlist only.
- **Main gap or risk:** No rates, inflation, yield-curve or valuation-regime
  context.
- **Investor impact:** Missing "why did my book move", and the discount-rate
  context for valuations.
- **Priority:** P2 (small)

**Geopolitics and news**
- **Current state:** Company news per ticker (Finnhub).
- **Main gap or risk:** No event layer.
- **Investor impact:** Low marginal value; high noise risk.
- **Priority:** P3 / avoid

**Risk management**
- **Current state:** Drawdown, volatility, concentration, HHI, idle cash.
- **Main gap or risk:**
  - No correlation or overlap between holdings.
  - No stress test against historical episodes.
  - No fundamental-deterioration flags on holdings.
- **Investor impact:** Risk is described statistically, not fundamentally.
- **Priority:** P1

**Data freshness and observability**
- **Current state:** `SyncRun`, worst-recent health badge, staleness flags.
- **Main gap or risk:** No alerting outside the app; logs only.
- **Investor impact:** Silent failures over weeks are possible.
- **Priority:** P2

**Testing and CI**
- **Current state:** 1,550 backend and 2,248 frontend tests.
- **Main gap or risk:**
  - No CI.
  - One failing frontend test on main.
  - The test runner needs credentials.
- **Investor impact:** Regressions in financial maths can merge.
- **Priority:** P0 (cheap)

**Security**
- **Current state:**
  - JWT, single user.
  - Saxo tokens Fernet-encrypted.
  - Signed OAuth tickets.
  - Scoped throttles.
- **Main gap or risk:**
  - `DEBUG` defaults to `True` (`settings.py:29`).
  - 1-day access tokens.
  - No deployment hardening documented.
- **Investor impact:** Fine for localhost; review before any remote exposure.
- **Priority:** P2

**Backups and recovery**
- **Current state:** Nightly SQLite backup, 14 retained.
- **Main gap or risk:**
  - Backups are local to the same disk **(hypothesis: `DB_BACKUP_DIR`
    defaults to `backend/backups/`)**.
  - No restore drill.
- **Investor impact:** One disk failure loses 20 years of history that Saxo
  may not be able to re-serve.
- **Priority:** P0 (cheap)

**MCP readiness**
- **Current state:** Not started. Clean read endpoints exist.
- **Main gap or risk:** Would expose the wrong numbers until performance is
  fixed.
- **Investor impact:** An AI would confidently repeat flawed figures.
- **Priority:** P2

**ML**
- **Current state:** None. No point-in-time data store.
- **Main gap or risk:** No history to train or validate on.
- **Investor impact:** Nothing credible is possible yet.
- **Priority:** P3

---

## C. Strategic direction

### 1. Strengthen infrastructure, calculations and data reliability

- **Benefit:** Every other feature reads from the portfolio ledger. Fixing
  returns, the ledger and position identity raises the value of Dashboard,
  Analytics, Portfolio and any future AI layer at once.
- **Cost:** Medium. The main uncertainty is which Saxo *live* endpoints
  return cash events. `transactions/models.py` documents that SIM returned
  404 or empty.
- **Risk:** Saxo live may not itemise dividends and deposits via OpenAPI. A
  manual or CSV import fallback is then required.
- **Opportunity cost:** Low. These are prerequisites for paths 2, 4 and 5.

### 2. Improve existing investment and research features

- **Benefit:**
  - A valuation-in-context block: own-history band, reverse DCF, owner-
    earnings yield.
  - A versioned thesis linked to trades.
  - Target allocations and drift.

  These directly answer "good company versus good price" and "is my plan
  still true".
- **Cost:** Low to medium. The data is already fetched.
- **Risk:** Free-tier gaps: estimates beyond two quarters are refused.
- **Opportunity cost:** Low.

### 3. Expand macro, political and geopolitical context

- **Benefit:** A *small* macro panel is cheap and authoritative. FRED and the
  ECB's data portal are free and dated. It covers policy rates, the 10-year
  yield, CPI, the yield curve and EUR/USD. It also gives a discount-rate input
  for valuation.
- **Cost:** A full geopolitical news module is high cost and noisy. No free
  source makes political events reliably traceable to holdings.
- **Recommendation:** A contextual macro *strip* (P2), no geopolitics module.

### 4. Implement MCP

- **Benefit:** Real. An assistant that can read your actual holdings,
  statements, thesis and 13F data is a much better research partner than a
  generic chatbot. MCP fits: a thin, read-only server over existing service
  functions.
- **Risk:** Doing it before path 1 means the AI repeats the deposit-inflated
  returns with fluency.
- **Recommendation:** Do it after path 1, read-only, and small (P2).

### 5. Experiment with ML

- **Benefit:** Low today.
- **Why it's blocked:**
  - No point-in-time fundamentals or screener history.
  - A survivorship-biased universe: today's S&P 500 ∪ Nasdaq-100 CSV.
  - Free-tier depth limits.
  - A single-person portfolio has too few decisions to learn from.
- **The credible near-term "ML-ish" items are plain statistics:**
  - Robust z-score anomaly flags on a holding's fundamentals versus its own
    history.
  - Volatility estimation (EWMA).
  - Correlation clustering of holdings.
- **Recommendation:** Start recording nightly `ScreenerRow` history now,
  because it's cheap and data can't be backfilled later. Revisit ML in 2–3
  years.

### 6. Other opportunity found: decision journal and periodic review

The highest-value workflow the app lacks is the **review loop**:

- Why did I buy?
- What had to stay true?
- What actually happened, against my thesis and against the benchmark?

The pieces exist: `SymbolNote`, `reviewed_at`, `_thesis_attention`, and
Transactions. They aren't linked or versioned. This is mostly a product
change, not a data change.

### Recommendation

Do **1 → 2 (thesis and valuation) → small 4 → small 3**. Freeze the chart
workspace roadmap: drawing tools, scripting, per-line styling. Treat ML as
data collection only.

---

## D. Prioritized roadmap

### P0 — Critical

**P0-1. Cash-flow-aware performance (TWR and money-weighted return)**

- **Problem:** All returns and risk statistics count deposits and withdrawals
  as performance.
- **Solution:**
  - Record external flows per day, in a new `CashFlow` table or as
    `Transaction` rows of type DEPOSIT/WITHDRAWAL.
  - Compute daily time-weighted returns as `(V_t − F_t) / V_{t−1} − 1`.
  - Chain them into a return index.
  - Feed that index, not raw values, into `analytics/metrics.py`.
  - Add a money-weighted return (XIRR) as "your return".
- **Why it matters:** This is the only honest answer to "am I beating the
  index?"
- **Dependencies:** Flow data. Saxo live endpoint (to verify), or a manual or
  CSV entry fallback.
- **Complexity:** Medium.
- **Success measure:** A synthetic test where a deposit on day N produces a
  0% return that day. Live TWR within 0.1 pp of Saxo's own performance report
  for the same window.

**P0-2. Position identity on uic + asset type**

- **Problem:** The ticker-unique `Position` collapses lots and listings.
- **Solution:**
  - Key on `(uic, asset_type)`.
  - Aggregate multiple Saxo rows per instrument: sum qty, weighted avg_cost.
  - Keep ticker as a display field.
- **Why it matters:** Quantities must be right before anything else.
- **Dependencies:** Migration, and a check of the live payload's netting.
- **Complexity:** Low to medium.
- **Success measure:** A test with two Saxo rows for one uic yields one
  position with summed qty. Live total qty matches the Saxo UI.

**P0-3. Off-disk backup and restore drill**

- **Problem:** 20 years of non-re-derivable history sits on one disk.
- **Solution:**
  - Point `DB_BACKUP_DIR` at a synced or remote location.
  - Add a `restore_backup --verify` command that opens a backup and checks
    row counts.
  - Document the drill.
- **Dependencies:** None.
- **Complexity:** Low.
- **Success measure:** A quarterly restore drill passes.

**P0-4. CI and a hermetic test run**

- **Problem:** No CI, a failing test on main, and the test runner needs
  credentials.
- **Solution:**
  - Add a GitHub Actions workflow that runs backend and frontend tests.
  - Make the `saxo.E001` and `enablebanking.E00x` checks warnings when
    `DEBUG`, or skip them under test.
  - Fix `niceTicks`.
- **Complexity:** Low.
- **Success measure:** Every PR is gated.

### P1 — High value

**P1-1. Complete ledger: income, fees, realized P/L**

- **Problem:** No dividends, withholding tax, commissions or realized gains.
- **Solution:**
  - Extend `Transaction` with `fees`, `tax`, `gross_amount`,
    `net_amount_reporting`, `uic` and `asset_type`.
  - Ingest from Saxo live (to verify) or from a statement CSV import.
  - Compute realized P/L with average cost, Saxo's default.
- **Why it matters:** Total return, income tracking and tax.
- **Dependencies:** P0-2.
- **Complexity:** Medium to high, depending on the source.
- **Success measure:** Yearly dividends and fees reconcile with Saxo's annual
  statement.

**P1-2. Daily position snapshots**

- **Problem:** No holdings history.
- **Solution:** `PositionSnapshot(date, uic, asset_type, qty, value_reporting,
  currency, fx_rate, price_source)`, written by the nightly snapshot task.
- **Why it matters:** Enables drift, attribution, "what did I hold" and
  exposure history.
- **Dependencies:** P0-2.
- **Complexity:** Low.
- **Success measure:** Weights can be reconstructed for any past date.

**P1-3. Versioned thesis and decision journal**

- **Problem:** Thesis edits overwrite reasoning, and decisions are not linked.
- **Solution:**
  - Add `ThesisVersion` (an append-only snapshot of `SymbolNote` fields at
    save time).
  - Add `Decision(date, uic, action: buy/add/trim/sell/hold-review,
    rationale, thesis_version, linked transaction ids)`.
  - Add a review record with an outcome: thesis intact, weakened or broken.
  - Re-key the note on uic + asset type.
- **Why it matters:** The core learning loop of long-term investing.
- **Dependencies:** P0-2.
- **Complexity:** Medium.
- **Success measure:** Every buy or sell in the last year has a linked
  rationale. Reviews are logged quarterly.

**P1-4. Valuation in context**

- **Problem:** The app can't say whether a good company is cheap.
- **Solution:**
  - Per symbol: current multiple against its own 5–10 year range (P/E,
    EV/EBIT, P/FCF, from the existing ratio history).
  - FCF yield and SBC-adjusted FCF yield.
  - A reverse DCF: the growth rate implied by today's price at a stated
    discount rate.
  - Show inputs and assumptions explicitly, as "derived, not reported".
- **Why it matters:** It separates quality from price.
- **Dependencies:** Existing statements and fundamentals. The discount rate
  can come from P2-1.
- **Complexity:** Medium.
- **Success measure:** Parity tests against hand-computed examples. Used on
  every new buy.

**P1-5. Exposure: currency, geography, ETF look-through-lite**

- **Problem:** Currency and country risk are invisible.
- **Solution:**
  - Currency exposure from `Position.currency` (free).
  - Geography from the listing or issuer country.
  - For ETFs, a manually entered top-level breakdown rather than a paid
    holdings feed.
- **Complexity:** Low to medium.
- **Success measure:** Exposure sums to 100%, with an "unknown" bucket shown.

**P1-6. Target allocation and drift**

- **Problem:** No plan to compare against.
- **Solution:**
  - Targets by holding, sector or bucket, with tolerance bands.
  - Show drift and suggested trades, as a suggestion only.
- **Dependencies:** P1-2 for drift history.
- **Complexity:** Low to medium.
- **Success measure:** Drift visible on Portfolio. No auto-trading.

**P1-7. FX attribution**

- **Problem:** Currency moves are mistaken for stock-picking.
- **Solution:** Split each position's reporting-currency return into its
  local return plus the FX effect, using the stored `fx_rate` history.
- **Dependencies:** P1-2.
- **Complexity:** Low.

**P1-8. Fundamental deterioration flags on holdings**

- **Problem:** Risk is only described statistically.
- **Solution:** On new filings for a holding, flag:
  - Margin compression.
  - Falling FCF conversion.
  - Rising net debt to EBITDA.
  - Share count growth.
  - A payout ratio above 100%.

  Each flag compares the company against its own trailing history, with
  thresholds shown. Surface them in the Dashboard's attention list.
- **Dependencies:** Existing statements.
- **Complexity:** Medium.

### P2 — Strategic

**P2-1. Macro strip.** Use FRED and the ECB to fetch:
- The ECB deposit rate and Fed funds rate.
- US and German 10-year yields and the 2s10s curve.
- Euro-area and US CPI.
- EUR/USD.
- Credit spreads (ICE BofA OAS on FRED).

Store them daily, dated and sourced. Show them as a strip plus a "since your
last review" delta. Complexity: low to medium.

**P2-2. Read-only MCP server** (see section 4 below). Complexity: medium.

**P2-3. Belgian tax view.** It covers:
- Withholding tax by country and the 30% Belgian withholding tax on
  dividends.
- The TOB stock-market tax per trade, by instrument class.
- The dividend exemption allowance.
- The capital gains tax being introduced from 2026; verify the rules before
  building anything.

All rates should be dated configuration, not code. Depends on P1-1.
Complexity: medium.

**P2-4. Screener history and user screens.**
- Append a dated `ScreenerSnapshot` alongside `ScreenerRow`.
- Let users save shelf rules (the shelves are already declarative).
- Complexity: low to medium.

**P2-5. Correlation and stress view.**
- A correlation matrix of holdings from existing daily bars.
- Portfolio drawdown replayed through 2008, 2020 and 2022 using index
  proxies.
- Complexity: medium.

**P2-6. Out-of-app alerts for sync failure and thesis triggers.** Email or
push when `worst_recent_outcome` has been failed for more than 24h, or when a
target or stop price is crossed. Complexity: low.

**P2-7. Deployment hardening.** Before any non-localhost exposure:
- `DEBUG=False` by default.
- Shorter-lived JWTs.
- HTTPS.
- Secrets outside `.env`.

Complexity: low.

### P3 — Experimental

**P3-1. AI research assistant in the UI.** This builds on P2-2: an assistant
grounded in the MCP tools that cites tool outputs. Run it only after P0 and P1
are done.

**P3-2. Statistical anomaly detection on fundamentals.** Robust z-scores
against each company's own history. Add it only if the P1-8 rule-based flags
prove too blunt.

**P3-3. ML signal research.** Only once P2-4 has accumulated several years of
point-in-time data. It needs walk-forward validation against simple
baselines: momentum, value, quality.

### Drop or freeze

The rest of `docs/next-steps.md` §1 adds little for a long-term investor:
- Drawing tools.
- Fibonacci.
- Scripting language.
- Per-line styling.
- Custom grid sizes.

Keep the chart as it is.

---

## E. Recommended next project

**"Correct, historical portfolio ledger": P0-1 + P0-2 + P1-2, plus the data
half of P1-1.**

### Why this comes first

Every question a long-term investor asks of a primary platform runs through
it:

- Am I beating the index?
- Is my income growing?
- Am I drifting from my plan?
- Was that decision good?
- What do I owe in tax?

Today the app answers the first one incorrectly whenever you add money. It
can't answer the others at all.

It is also the prerequisite for:
- MCP: don't expose wrong numbers.
- The decision journal: needs linked transactions.
- Tax: needs dividends and fees.
- FX attribution: needs snapshots.

It improves existing pages (Dashboard, Analytics, Portfolio, Transactions)
rather than adding a new one.

### In scope

1. Position identity moves to `(uic, asset_type)`, with aggregation of
   multiple Saxo rows per instrument.
2. External cash flows (deposits and withdrawals) recorded per day:
   - From Saxo live if an endpoint provides them (spike first).
   - Otherwise from a CSV import of Saxo's account statement.
   - With a manual-entry form as the last resort.
3. A time-weighted return index replaces raw values as the input to
   `analytics/metrics.py`. A money-weighted return (XIRR) is added as a
   separate "your return" figure. The Dashboard change figures are labelled
   honestly: "net worth change (incl. deposits)" versus "investment return".
4. A daily `PositionSnapshot` is written by `snapshot_net_worth`.
5. Dividends, fees and withholding tax are ingested into `Transaction` from
   the same source as the flows. Storage only; the UI for income is a
   follow-up.

### Out of scope

- The Belgian tax view.
- Target allocations.
- Thesis versioning.
- Valuation tooling.
- MCP, macro and ML.
- Backfilling more than what the chosen source can supply.

Don't reconstruct history from guesses: a day with no known flow and an
unexplained jump gets flagged, not smoothed.

### How to validate

1. **Unit tests:**
   - A deposit-only day gives 0% TWR.
   - A withdrawal before a 10% gain gives 10% TWR.
   - XIRR matches a spreadsheet example.
   - Two Saxo rows for one uic aggregate correctly.
2. **Reconciliation:** For a chosen past quarter, the app's TWR and dividend
   total match Saxo's own performance and account statement within a stated
   tolerance (0.1 pp; €1).
3. **No regressions:** Existing analytics tests are kept and rewired to the
   return index. They still pass when no flows are recorded, since the index
   then equals the value series.
4. **The dev DB migration has been run** (`manage.py migrate`, per AGENTS.md),
   and a past-data rebuild command has been run once against it.

---

## F. Implementation specification (for a separate task)

### Step 0: spike (half a day, before any code)

Against the **live** Saxo account, check which of these return itemised cash
events:

- `GET /cs/v1/reports/bookings/{ClientKey}` (bookings: deposits, dividends,
  fees, taxes).
- `/hist/v3/perf/` or `/hist/v4/performance/timeseries` (Saxo's own
  TWR, a reconciliation target).
- `/hist/v1/transactions`.

Save a redacted sample payload to `docs/notes/`. The answer decides between
API ingest and CSV import.

**(hypothesis)** These endpoint names are from memory of Saxo's OpenAPI and
must be confirmed against the current reference.

### Data model changes (necessary)

**`portfolio.Position`**
- Drop `unique=True` on `ticker`.
- Add `unique_together = ('uic', 'asset_type')`.
- Migrate existing rows. A null uic stays keyed on ticker, as today's
  fallback.

**`transactions.Transaction`**
- Add:
  - `uic` and `asset_type` (nullable).
  - `amount_reporting` (Decimal, signed; reporting currency).
  - `fees` and `tax` (Decimal, default 0).
  - `source` (`saxo_api` / `csv` / `manual`).
  - `external_id`, unique per source. This generalises `saxo_trade_id`.
- Add types `WITHDRAWAL`, `WITHHOLDING_TAX` and `INTEREST`.

**New `portfolio.PositionSnapshot`**
- Fields: `date`, `uic`, `asset_type`, `ticker`, `qty`, `value_reporting`,
  `currency`, `fx_rate`, `price_source`.
- Unique on `(date, uic, asset_type)`.

**`core.NetWorthSnapshot`**
- Add `external_flow` (Decimal: the day's net deposits minus withdrawals into
  the Saxo account, in reporting currency).
- Add `flow_complete` (bool: whether flows for that day are known rather than
  assumed zero).

### Code changes (necessary)

**`saxo/mapping.py` and `saxo/tasks.py`**
- `to_position_fields` keeps the uic and asset type as identity.
- `sync_positions` groups mapped rows by `(uic, asset_type)` before upserting,
  then prunes by that key.
- Unmapped or legacy rows keep today's `SyncRefused` guard.

**New flow and income ingest**
- `saxo.tasks.sync_cash_events` if the spike finds an endpoint, wrapped in
  `@synced` like the others.
- Otherwise a management command and upload endpoint, `import_statement`, in
  `transactions/`.
- Either path is idempotent via `external_id`.

**New `analytics/returns.py`**
- `twr_index(dated_values, dated_flows)` returns a `[(date, index)]` series.
- `xirr(flows, terminal_value)`.
- Both are pure functions with no ORM, like `metrics.py`.

**`analytics/views.py::_portfolio_dated_values`**
- Returns the TWR index instead of raw `saxo_account_value`.
- `report.py` and `metrics.py` stay unchanged. They already take any value
  series.
- Add `flow_coverage` (the share of days with `flow_complete`) to the
  payload, so the UI can disclose it.

**`core/services.py::ensure_todays_snapshot`**
- Also writes `PositionSnapshot` rows.
- Also writes `external_flow` from that day's DEPOSIT and WITHDRAWAL
  transactions.

**`portfolio/insights.py`**
- Relabel `change.*` as net-worth change.
- Add `investment_return.*` from the TWR index.

**Frontend**
- Analytics shows the TWR basis and the flow-coverage disclosure, using the
  `PriceBasisNote` pattern.
- Dashboard shows the two separate change figures.
- `lib/monteCarlo.js` inputs come from TWR returns (no code change if the API
  field is reused).

**Management command `rebuild_return_index`**
- Recomputes `external_flow` for past snapshots from ingested transactions.
- Requires `--since` and `--until`, following the `repair_networth_history`
  precedent.

### Tests (necessary)

**`analytics/test_returns.py`**
- Deposit and withdrawal days.
- Zero-flow equivalence with today's figures.
- XIRR against a fixed reference.
- A day with an unknown flow is surfaced, not smoothed.

**`saxo/test_tasks.py`**
- Two rows for one uic are aggregated.
- The same ticker on two exchanges gives two positions.
- Pruning by the new key.

**Ingest tests**
- Idempotent re-import.
- Currency conversion.
- Sign conventions.

**`core/tests.py`**
- The snapshot writes position rows and the flow.

### Optional (not needed for success)

- A Portfolio "history" slider to view holdings on a past date.
- Income chart (dividends by month and year). Natural follow-up once the data
  exists.
- Displaying Saxo's own TWR beside ours as a cross-check.

---

## Section notes the roadmap relies on

### MCP (section 4 of the brief)

MCP is the right protocol for "let an assistant read my app". Build it as a
separate, thin process that calls the Django *service layer*, not the HTTP
views, so throttles and auth are not duplicated.

**Expose as read-only tools:**
- `get_holdings` (with `price_source`).
- `get_exposures`.
- `get_performance` (TWR and money-weighted, with `flow_coverage`).
- `get_fundamentals`, `get_statements`, `get_filings`.
- `get_thesis`.
- `get_fund_ownership`.
- `screen(rule)`.

**Every tool response should carry:**
- `as_of`.
- `source`.
- `derived: true/false`.
- The same `available` / absent semantics the app uses.

**Keep out by default:**
- Bank transactions and IBANs (the `enablebanking` app).
- OAuth tokens.
- Anything that writes.

**Treat news text and filing text as untrusted.** Return them as quoted data
fields, never merged into instructions.

**Writes come last.** If they're ever added, they should be journal-only
(append a `Decision`), with per-call confirmation. No trading, and no Saxo
order endpoints.

**Log each tool call** in the database for auditability.

### ML (section 5 of the brief)

The prerequisites don't exist yet:
- Point-in-time data. `ScreenerRow` is overwritten, and fundamentals come
  latest-as-reported.
- A survivorship-free universe. The current one is today's index members.
- Enough depth on free tiers.

Price prediction is the weakest starting point. The most defensible future
uses are:

- Volatility and downside estimation for position sizing. EWMA or GARCH beat
  ML baselines here and are simpler.
- Anomaly flags on reported fundamentals against the company's own history.
- Regime labelling for context, descriptive rather than predictive.

The one action worth taking now is P2-4: start storing dated snapshots, so
the option exists in 2–3 years.

### Data providers (section 6 of the brief)

**Keep:**
- **Saxo:** prices, positions, and possibly bookings. It is the source of
  truth for holdings.
- **Finnhub free:** fundamentals and XBRL statements. Adequate, and it is
  rate-managed.
- **SEC EDGAR:** 13F filings and insiders. Authoritative and free.

**Add (P2, free and authoritative):**
- **FRED:** US macro and credit spreads.
- **ECB Data Portal:** euro rates and HICP inflation.

**Consider only if a gap proves painful:**
- A paid fundamentals source with point-in-time history, for non-US coverage
  and estimates. Financial Modeling Prep is roughly €20–30/month, and
  EODHD is similar. **(hypothesis: prices to be checked)**
- Today the app cannot research European companies at all
  (`companyData.js` → `foreign`). For a Belgian investor that is the largest
  coverage gap. It is worth a deliberate decision rather than drift.

**Avoid:**
- Paid news.
- Social sentiment.
- Geopolitical event feeds.

They have a poor signal-to-maintenance ratio for a long-term book.
