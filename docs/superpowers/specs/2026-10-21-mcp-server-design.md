# SaxoDash MCP server — design

## Purpose

The app holds everything an advisor needs: the live Saxo book, Finnhub fundamentals and
statements, the nightly Discover scan, earnings, 13F funds and House trades. None of it is
reachable from a conversation. The goal is a **financial advisor the user talks to in Claude
Desktop and Cowork** (Pro plan, no API key) that reads all of it, draws its own charts and
reports, and argues why a stock is or is not investable, following the growth playbook
(`docs/notes/2026-10-19-growth-stock-playbook.md`, branch `docs/growth-playbook`).

This spec is the first of two pieces:

1. **The MCP server** (this spec): read tools over every investment page, four new tools the pages
   do not have, and one write tool, the decision journal.
2. **The Cowork plugin** (next spec): the playbook as skills, the investor lenses (Buffett,
   Ackman, Lynch, Fisher, …) grounded in their published letters, and commands such as
   `/analyse`, `/compare`, `/review-portfolio`, `/find`, `/committee` and `/tax-december`.

Success: in Claude Desktop, "compare NVDA, AMD and AVGO — is any of them a buy?" makes Claude
fetch the three companies in one call, draw P/E against each one's own history, margins and
growth side by side, give a scored verdict with a buy and a sell range, and log it to the
journal on request. Three, six and twelve months later the journal says how that call did
against the S&P 500.

Out of scope: banking data (the user's decision: rent, car and going out are outside what the
advisor can judge), placing or staging orders, starting syncs or scans, the Saxo and bank
connection flows, chart drawings, the nightly lens engine and its history tables (playbook 5.4,
deferred until the slice has been used), an in-app chat page.

## Decisions

**Local stdio server, run inside Django.** `python manage.py mcp_serve` starts a FastMCP server
(the official `mcp` Python SDK) on stdio. Claude Desktop launches it from
`claude_desktop_config.json` with the backend's virtualenv Python, so it reads the same
`db.sqlite3`, the same Redis cache and the same Saxo credential as the running app. No port, no
token, nothing reachable from the network. The Mac has to be awake, as it already must be for
the Saxo token.

**stdout belongs to the protocol.** Any byte printed to stdout corrupts the stdio stream. The
command routes Django logging and warnings to stderr before the server starts, and a test runs a
real tool call through the stdio transport to catch a stray `print`.

**A tool calls the page's own view, in-process.** Views here are thin (1,128 lines across all
apps) but they still hold logic a page relies on: `PortfolioSummaryView` decides when P/L is
`None`, `provider_response` turns provider errors into `available: false`, serializers attach
weights and thesis flags. Reimplementing that per tool would let the advisor and the page
disagree about the same number. So one adapter, `mcp_server/views.py::call_view(view_class,
**kwargs, query=...)`, builds a request with `APIRequestFactory`, authenticates it as the single
app user with `force_authenticate`, dispatches it and returns `response.data`. The tool then
reshapes it for a model reader (below). Throttles still apply, which is what we want: the
research scopes and Finnhub's per-minute budget protect the shared key from a chatty
conversation exactly as they protect it from the page.

**Tools are grouped by question, not one per endpoint.** About 30 tools. A model picks tools
less reliably from 80 near-identical ones, and several pages ask one question across endpoints
(a company is fundamentals + statements + earnings + peers). Each tool's description says which
page it mirrors, so the user can check an answer against the app.

**Shaped for a reader, not a renderer.** Tools drop presentation fields (`color`, logo URLs,
sort keys), keep units explicit (`value_eur`, `price_usd`, `pct`), and keep `null` as `null`:
"an absent figure is not zero" holds here too. Long lists are capped with a `truncated` count
rather than silently cut.

**Every answer says how fresh it is.** Each tool returns `{data, as_of, sources, warnings}`.
`warnings` carries what the app already knows: Saxo disconnected (`connection_state()`), a
stale sync (`worst_recent_outcome()`), prices that are not live (`Position.price_source`), the
15-minute delay, Finnhub busy, a `foreign` or `fund` company-data status. The advisor is told
(plugin spec) to repeat a warning rather than paper over it.

**Errors are answers.** A provider refusal arrives as `available: false` with the reason, a 409
as "Saxo is not connected — reconnect in the app", an unknown ticker as `null`. Only a real bug
raises, and FastMCP returns it to Claude as a tool error.

**US company data follows the app's rule.** `lib/companyData.js::companyDataStatus` decides on
the frontend which instruments may be asked about Finnhub and the SEC. The server needs the
same answer, so the rule is ported to `mcp_server/company_data.py` with the same order
(`pending` does not exist server-side; `foreign`, `fund`, `eligible`, `unverified`) and pinned
to the frontend by a shared fixture, as `indicator-parity.json` pins the indicators.

**Read-only, with one exception.** The only writes are journal rows (`log_recommendation`,
`close_recommendation`). Claude Desktop asks before every tool call unless the user allows it,
so the journal write is visible.

## Tool catalogue

### Portfolio and performance (Portfolio, Dashboard, Analytics, Transactions)

| Tool | Mirrors | Returns |
|---|---|---|
| `get_portfolio` | `/portfolio/summary`, `/positions`, `/insights` | total value, cost, P/L, cash, each position (qty, avg cost and price in its currency, value/cost/P/L in EUR, weight, price source, thesis flag), insights |
| `get_performance` | `/analytics/performance`, `/risk` | return vs benchmark, volatility, drawdown, beta, Sharpe |
| `get_transactions` | `/transactions` | trades, newest first, with currency and FX |

### Company research (Research, Advanced View)

| Tool | Mirrors | Returns |
|---|---|---|
| `search_instruments` | `/research/instruments` | matches with uic, asset type, currency, exchange |
| `get_price_history` | `/research/chart` | daily (or weekly/monthly) bars, up to 1,200, plus MA20/50/200, RSI14, 52-week high/low and the playbook zone (4.6) |
| `get_quotes` | `/research/quotes` | last, change, `change_basis` |
| `get_company` | `fundamentals`, `earnings/<symbol>`, `peers` | profile, TTM ratios, annual ratio series, EPS history, earnings surprises, peers, analyst trend |
| `get_financial_statements` | `statements` | income, balance sheet and cash flow, annual and quarterly, mapped rows only |
| `get_filings_and_insiders` | `filings`, `insiders` | 10-K/10-Q/8-K links, merged insider trades, open-market buy/sell totals |
| `get_news` | `news` | headlines with source and date |
| `get_my_notes` | `notes`, price lines | the user's thesis, target, stop and price lines |
| `get_watchlists` | `/research/watchlists` | lists and items |

### Market scan (Discover, Earnings, heatmaps)

| Tool | Mirrors | Returns |
|---|---|---|
| `screen_universe` | `/research/discover`, `ScreenerRow` | filter and sort the S&P 500 ∪ Nasdaq-100 snapshot on any stored metric (`min_`/`max_` per field, sector, limit) |
| `get_discover_shelves` | `/research/discover/<key>` | the shelves and their members |
| `get_earnings_calendar` | `/research/earnings/calendar` | the week's reports, held/watched tags, the measured move and its window |

### Smart money (Investors, Congress)

| Tool | Mirrors | Returns |
|---|---|---|
| `get_fund_signals` | `/investors/hub` | most bought / sold / new across tracked funds, and the quarter it describes |
| `list_investors` | `/investors/` | funds with copy-performance edge |
| `get_investor` | `<slug>`, `changes`, `copy` | holdings, quarter changes, copy performance |
| `get_ticker_ownership` | `/investors/ownership/<t>`, `/congress/ownership/<t>` | which funds hold it and their share change, which members bought or sold |
| `get_congress_member` | `/congress/members/<slug>` | estimated holdings, trades, copy performance |
| `get_filing_alerts` | `/investors/alerts` | new filings from followed investors (read without marking read) |

### System

| Tool | Returns |
|---|---|
| `get_data_health` | Saxo connection, each sync task's latest outcome, last Discover scan, last price refresh |

## New tools

### `get_valuation_history(symbol)`

The advisor's main chart ("is it cheap against its own past?") has no endpoint today:
`finnhub._valuation_history` keeps only min/median/max. The tool returns two series:

- **Annual**, from Finnhub's `series.annual` (P/E, P/S, P/B, P/FCF, EV/EBITDA where present), the
  points themselves rather than their summary.
- **Daily trailing P/E**, Saxo daily closes divided by the sum of the last four quarterly EPS
  figures in force on each day (from the fundamentals payload's EPS history). A day with fewer
  than four known quarters, or TTM EPS ≤ 0, is `null`: a negative P/E is not a valuation. The
  quote currency and the EPS currency must match, otherwise the series is withheld with a
  warning (a foreign listing reports in another currency).

Each series comes with its 5-year median, so "1.5× its median" (the playbook's `stretched`) is
read off the tool, not computed by the model.

### `compare_companies(symbols)`

Two to five tickers in one call: for each, the playbook's five pillars (growth, profitability and
quality, financial health, valuation against its own history and peers, trend and zone) as
figures, plus fund and Congress ownership. Built from the same caches as the single-company
tools, so a comparison costs no more Finnhub calls than visiting each Research page once; cold
symbols are fetched one after another and a refused one comes back `available: false` rather
than failing the batch.

### `get_tax_year(year)`

What the December sell-and-rebuy needs (playbook 8A): realised gains and losses this year in
EUR, unrealised gains per holding measured from the later of its purchase and the 31 December
2025 close, and the exemption left (€10,000, plus carry-over when the user enters it).

The app cannot answer this today: `Transaction` rows are rebuilt from open positions, and
`/port/v1/closedpositions/me`, the only closed-trade source synced, appears to cover recent
closes only (to confirm in the probe), so earlier sales are not stored. **Task 1 of the plan is a probe**, not code: against the live account, check which Saxo
endpoint returns this year's closed trades with their realised P/L in account currency
(candidates: the client-services historical reports for closed positions, and the trade
history). The tool is built on whichever answers; if none does, it reports unrealised gains only
and says the realised figure has to come from Saxo's annual tax report. Every output carries
"check with a Belgian tax adviser" until the anti-abuse question (playbook 11.4) is answered,
and the tool never says "sell and rebuy", only what each holding's gain or loss is.

### The decision journal: `log_recommendation`, `list_recommendations`, `close_recommendation`

A new `advisor` app owns one model, `Recommendation`, with the playbook's contract (7.1) minus
what needs the deferred lens engine: no `run_date`, and `figures` are stored as stated rather
than checked against a stored run.

| Field | Rule |
|---|---|
| `ticker`, `uic`, `asset_type` | resolved through `search_instruments`; an unresolvable ticker is refused |
| `action` | `buy_new`, `add`, `trim`, `sell`, `watch`, `hold`, `harvest_loss`, `harvest_gain` |
| `review` | true when the thesis is alive and the call is a trim/sell review (playbook 7.3), false for a firm call |
| `thesis`, `bear_case`, `invalidation`, `target`, `figures`, `lenses`, `zone`, `conviction`, `horizon`, `uncertainties` | as playbook 7.1; `horizon` is `3m`, `6m` or `12m` |
| `buy_range`, `sell_range` | `{low, high}` in the instrument's currency |
| `entry_price`, `entry_currency` | the latest Saxo close at logging time, filled by the server, never by Claude |
| `recorded_at`, `decision` | `decision` is `pending`, `accepted`, `declined`; declined calls are scored too |
| `closed_at`, `close_reason` | set by `close_recommendation` (sold, invalidated, superseded) |

Scoring reuses what `investors` already built: the recommended ticker is registered with
`price_feed.add_ticker_source`, so `refresh_copy_performance` fetches its daily bars nightly, and
each call is measured from the close of the first session after `recorded_at` against the S&P 500
ETF over the same days, at 3, 6 and 12 months (or at close). `list_recommendations` returns each
call with its excess return per checkpoint and the averages by conviction and by action. A
`watch` is scored from the day its price was first touched, if it was. The journal is also a
small page later; this spec only needs the model, the tools and the admin.

## Running it

```json
{
  "mcpServers": {
    "saxodash": {
      "command": "/…/SaxoDash/backend/.venv/bin/python",
      "args": ["/…/SaxoDash/backend/manage.py", "mcp_serve"]
    }
  }
}
```

`docs/running-the-stack.md` gets a section on it. The server does not need `scripts/dev.sh`
running, but Redis does (the caches and the Finnhub budget live there) and the Celery stack
keeps the Saxo token fresh. When Redis is down the server answers every tool with a warning
instead of failing open on the budget.

**To verify in the plan, not assumed:** that Cowork uses the local MCP servers configured in
Claude Desktop. If it does not, Cowork reaches the server as a desktop extension (`.mcpb`)
packaging the same command.

## Testing

- `mcp_server` tests call each tool function directly against fixtures and assert the shaped
  output, including `null` for absent figures and the warnings for a disconnected Saxo, a stale
  sync and a foreign listing.
- One parity test per mirrored tool: the tool's numbers equal the view's response for the same
  fixture, so a page and the advisor cannot drift.
- `company_data` parity with `lib/companyData.js` through a shared JSON fixture.
- Valuation history: TTM window edges, negative EPS, currency mismatch.
- Journal: entry price filled by the server, scoring at checkpoints against a fixed benchmark
  series, declined calls scored, `watch` scored from first touch.
- One end-to-end test starts `mcp_serve` as a subprocess, speaks the stdio protocol with the
  SDK's client, lists tools and calls `get_data_health`.

## Risks

- **Finnhub budget.** A comparison of five cold symbols is up to 25 calls against 58 a minute.
  The budget and its refusals already exist; the tool reports a refused symbol instead of
  waiting.
- **Context size.** 1,200 daily bars per symbol is a lot of tokens. `get_price_history` defaults
  to weekly bars and a summary; daily bars are on request and capped.
- **Advice quality** is the plugin's problem and the journal is how it is judged. The server's
  job is that every number it hands over is the app's number.
