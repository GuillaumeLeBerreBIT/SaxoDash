# Research depth: symbol panel, financials and statistics

Date: 2026-10-12
Status: design approved in conversation from the wireframe; phase 1 planned.

## Why

The chart page (`/research/chart`) shows a watchlist beside the chart and nothing
about the company whose chart is open. The Research page has the company data but
spreads it thinly: one year of ratios, no statements, analyst counts as a plain bar.
TradingView's symbol panel and Financials pages are the reference for what a
researcher expects to see next to a chart.

The goal is to reach that depth using only what SaxoDash can already pay for: the
free Finnhub key and the Saxo price bars the chart already fetches. Nothing in this
design adds a provider.

Success means: on the chart page, picking a symbol answers "when does it report, how
has it moved, what do analysts and the indicators say" without leaving the chart; on
the Research page, each figure has one home and statements and ratio history are
readable back to 2012.

## What the data can back

Probed against the live key on 2026-10-12 with ServiceNow.

| Need | Source | Status |
|---|---|---|
| Analyst counts, monthly history | `/stock/recommendation` | Free; latest month already fetched |
| EPS actual vs estimate, last 4 quarters | `/stock/earnings` | Free, already fetched |
| Next report date, EPS and revenue estimate | `/calendar/earnings` | Free, two quarters ahead, already fetched for the next one |
| Volume, average volume, performance, seasonals, technicals | Saxo daily bars (1,200) | Already fetched |
| Market cap, shares, free float, IPO date, website, country | `/stock/profile2` | Free; float, IPO, website, country not yet shaped |
| Ratio history, 14 to 19 years | `/stock/metric` `series.annual` | Free; only P/E, P/S, P/B history shaped today |
| Income statement, balance sheet, cash flow | `/stock/financials-reported` | Free; 14 annual reports, 43 quarters; only cash flow shaped today |
| SEC filings list, insider transactions, insider sentiment | `/stock/filings`, `/stock/insider-*` | Free, unused |
| Analyst price targets, estimates beyond two quarters | `/stock/price-target`, `/stock/*-estimate` | 403 |
| Segments, dividend history, ownership, executives, description | various | 403 |

Known gaps in the free statements: no separate fourth-quarter report (it is the
annual figure minus three quarters), and the two most recent quarters came back
without a balance sheet. Row labels are each company's own XBRL concepts and must be
mapped to one standard set; the existing cash flow shaping already does this for
three concepts.

## Out of scope

- The forecast cone. Parked by the user: predictions will come from a later ML
  feature, so neither an analyst-target cone (no data) nor a cone from the user's
  own target is built now.
- Anything the free key refuses: CEO, employees, "About" text, segments, dividend
  history, estimates past two quarters. The UI omits them; it does not show empty
  placeholders.
- A second data provider.
- Intraday technicals. Chart horizons are daily or coarser, so the technicals rating
  is a daily rating.

## Phases

Each phase ships by itself and has its own implementation plan.

### Phase 1: symbol panel on the chart page (frontend only)

A `SymbolPanel` card under the watchlist in the right column of `/research/chart`.
It follows the active pane, because the active pane is the URL's `?symbol=`. The
column scrolls as one: the watchlist keeps a bounded height and the panel sits below
it. The panel is hidden below `lg`, like the rest of that column.

Blocks, top to bottom, each a section inside one `Card` separated by hairlines:

1. **Key stats.** Next earnings (relative day count and session), volume of the
   latest bar, 30-session average volume, market cap. A link to the Research page
   for the same instrument.
2. **Performance.** Six tiles: 1W, 1M, 3M, 6M, YTD, 1Y, each the percent change from
   the close on or before that date to the latest close. A tile whose start date
   predates the fetched history shows a dash. Tinted with `performanceFill`, sign
   always printed.
3. **Earnings.** One column per reported quarter (up to four) plus the next
   scheduled one. A filled dot for the actual, coloured by `surpriseColor`, and a
   ring for the estimate; the next quarter has only the ring. Vertical position is
   EPS on a shared scale.
4. **Analyst rating.** A half-circle gauge with five segments and a needle at the
   weighted mean of the five counts (strong sell 1 to strong buy 5), the label of
   the gauge segment the needle is in, the five counts beneath, and "N analysts, as of period".
5. **Technicals.** The same gauge, fed by a daily rating computed from indicators
   the app already has: RSI(14), MACD line against signal, and price against
   SMA 20, 50, 200 and EMA 9. Each votes buy, neutral or sell; the gauge shows the
   balance and the three counts. The caption names the inputs, so the rating is
   never mistaken for TradingView's 26-indicator one.
6. **Seasonals.** One line per calendar year in the fetched history, each the
   cumulative percent return from that year's first close, x-axis January to
   December. The current year is drawn in the accent colour and thicker.

Rules:
- An ETF gets blocks 1 (without earnings and market cap), 2, 5 and 6. Blocks 3 and 4
  are company fundamentals and are left out, matching the `equityOnly` tabs.
- A block with no data is omitted, not shown empty. While fundamentals load, the
  blocks that depend on them show a skeleton.
- The panel adds no request the chart page does not already make except
  `useFundamentals(symbol)`, which is cached for 24 hours and shared with the
  Research page. Bars, quote and earnings come from the `useChartData` call the page
  already holds.
- Gauge colours come from `lib/charts.js` (`NEGATIVE`, `POSITIVE`, `ESTIMATE` with
  `withAlpha`). The label is text, so the state is never colour-only.

New pure modules, each with its own tests: `lib/performance.js` gains
`trailingReturns`; `lib/seasonals.js`; `lib/technicalRating.js`;
`lib/analystRating.js`. New components: `RatingGauge`, `PerformanceTiles`,
`EarningsDots`, `SeasonalsChart`, `SymbolPanel`.

The mini "Financials" chart from the wireframe is not in phase 1: it needs annual
revenue and net income, which no endpoint returns yet. It arrives with phase 2.

### Phase 2: Research tabs regrouped, Financials added

Tab list becomes Overview, Financials, Statistics, Peers, Earnings, News, Guide.

- **Overview** gains a key facts strip (market cap, P/E, EPS, dividend yield, listed
  since, industry, country, website), performance tiles, ownership (free float
  against closely held, from `floatingShare` and `shareOutstanding`), capital
  structure (market cap plus debt minus cash is enterprise value), and the analyst
  gauge with its monthly trend. The gauge replaces the "Analyst recommendations"
  bar, which leaves Valuation.
- **Statistics** is today's Valuation tab renamed (`?tab=valuation` keeps working as
  an alias). It keeps the ratio cards and gains a by-year table grouped as
  valuation, profitability, liquidity and solvency, with a "Current" column, and a
  ratio history chart.
- **Financials** is new: a multi-year bar chart (revenue, gross profit, operating
  income, net income), income statement / balance sheet / cash flow tables with
  year-on-year change under the headline rows, an annual/quarterly toggle, and a
  revenue-to-profit waterfall. The cash flow trend chart moves here from Valuation
  and the margin trend from Earnings.
- **Earnings** keeps its cards. The EPS chart gains the forward quarters as a shaded
  zone and an annual/quarterly toggle.
- The chart page's symbol panel gains the mini financials block with a "More
  financials" link to `?tab=financials`.

Backend: one new endpoint, `GET /api/research/statements/<symbol>/`, following the
fundamentals contract (always 200 with `available`, 24h cache, `research.fundamentals`
throttle scope). It maps XBRL concepts to a standard row set per statement, derives
the fourth quarter, and omits a row a company does not report rather than zero-filling
it. The fundamentals payload gains `free_float`, `ipo_date`, `website`, `country`,
`enterprise_value`, the full recommendation history, and the wider annual ratio
series.

### Phase 3: extras the free key also backs

Insider transactions with monthly sentiment, a filings list (10-K, 10-Q, 8-K with
links), financial health charts (debt, free cash flow and cash by year; short- and
long-term assets against liabilities), and a full technicals table behind the gauge.
Scoped on 2026-10-13
(plan: `docs/superpowers/plans/2026-10-13-research-extras.md`):

- A new **Filings** tab (equity only, after Funds) holds the SEC filings list and
  insider activity. Filings are requested per form, because the unfiltered list is the
  newest 500 of everything. Insider rows are merged per insider, day and type; totals
  count open-market buys and sales only.
- **Financial health** sits on the Financials tab as two charts computed from the
  statements endpoint. They replace the phase 2 cash generation chart, and the
  `cash_flow_trend` field leaves the fundamentals payload.
- The **technicals table** is a disclosure under the chart page's technicals gauge,
  listing the six indicators the gauge votes with, their values and their signals.

## Testing

Pure modules are tested first and hold the logic: return windows at history edges,
year boundaries in seasonals, each indicator's vote and the neutral band, the
weighted mean and its label thresholds. Components get render tests for the present,
loading and absent states, following the existing `SurpriseBars` / `EarningsTab`
specs. The chart page spec asserts the panel renders for a stock and drops the
equity-only blocks for an ETF. Phase 2's backend follows `test_fundamentals_shaping`
and `test_fundamentals_orchestration`. Each phase ends with the screenshot review in
`docs/design-system.md` at 1440px and 390px.
