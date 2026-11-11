# Verdict engine: design

Date: 2026-11-11. Branch: `feat/verdict-engine`. First of three projects; the
other two (buy/sell zones on the Research chart, the Discover revamp) only
display what this one produces and get their own designs.

## Why

The app is strong on research and weak on the decision. The owner's plan
(`docs/notes/investor-plan.md`) says: buy quality growth companies when the
price is not extreme against their own history, and sell for three reasons
only (story broke, too big, better use). Today nothing in the app applies those
rules; the owner has to do it per stock by hand.

The owner asked for buy and sell indications per stock "based on financial
analysis, using ML or the Buffett rules". Decided in conversation:

- Rules first, readable and explained. Every verdict shows its reasons.
- Machine learning is not in this project. It may come later as a challenger
  that has to beat the rules on the same track record.
- The engine has to prove itself: its calls are logged and measured against
  the S&P 500.
- It suggests. It never places an order and never says "sell" on a price drop
  alone.

## What already exists (found while planning)

The Research Overview already shows an "Investment snapshot": five one-line
reads (growth, profitability, health, valuation, momentum) computed in the
browser by `frontend/src/lib/snapshot.js` from today's figures, for the one
stock on screen. Its thresholds live in that file's `T` table.

The engine does not replace it. It adds what the snapshot cannot do: every
stock every night, five-year medians instead of one year's figure, one action
that knows what the user holds, and a track record. To keep the two from
disagreeing, the engine's quality thresholds are the same numbers as `T`
(ROE 15, net margin 10, debt-to-equity 1, revenue growth 5), and a test pins
them together. The Verdict card sits above the snapshot on the Overview.

## Goals

1. Every night, each stock in the Discover universe (S&P 500 ∪ Nasdaq-100) gets
   a **verdict**: a quality grade, a valuation grade, two price levels, and the
   reasons behind each.
2. For a stock the user holds or watches, the app turns the verdict into one
   **action**: Buy, Add, Hold, Trim, Sell (review), Wait, or Not a fit.
3. Each time a stock becomes buy-grade, that is logged with the price and later
   scored against the S&P 500 at 3, 6 and 12 months.
4. The verdict is visible where the owner already looks: the Research page,
   the watchlist and the Portfolio table. The advisor can read it over MCP.

## Non-goals

- Price prediction, ML models, backtests over past years (annual fundamentals
  with today's knowledge would leak the future into the test).
- Drawing zones on the chart (project 2) and Discover changes (project 3).
- Stocks nobody holds or watches outside the universe. They answer "Not
  covered". Widening the universe itself is a later project.
- ETFs. No company, no verdict.
- New data providers. No extra Finnhub calls (see Data).

## Anti-goals

- A label without reasons. If the card cannot say why, it must not say what.
- A missing figure treated as zero or as a pass. Existing rule in this repo.
- "Sell" triggered by price. Only a failed quality check produces Sell (review).
- Arrows, green/red "signal" styling that reads as a trade instruction. Words
  first, colour second, like the earnings badges.
- Any path from a verdict to an order.

## Data (verified in the code)

The nightly scan (`research/scan.py`) already makes one Finnhub
`/stock/metric` call per symbol (`finnhub.get_basic_financials`). That same
response carries a `series` block the scan currently throws away:

- annual: `roe`, `roic`, `netMargin`, `operatingMargin`, `grossMargin`, `pe`,
  `pfcf`, `eps`, and more (`finnhub.RATIO_SERIES`, `VALUATION_ANNUAL`)
- quarterly: `eps`, `peTTM` (`VALUATION_QUARTERLY`)

The scan also fetches daily Saxo bars per symbol for technicals. A daily
trailing P/E from closes and quarterly EPS already exists:
`research/valuation.py::trailing_pe`.

So the engine needs **no new provider calls**. The scan keeps what it already
receives.

## The verdict

### Quality: a Buffett-style checklist

Six checks. Each answers pass, fail, or unknown (figure missing), with the
figure it used. Thresholds are my call, kept in one declarative table (like
`research/shelves.py`) so they are easy to read and change:

| Check | Passes when |
|---|---|
| Return on equity | median of last 5 annual ROE ≥ 15% |
| Return on capital | median of last 5 annual ROIC ≥ 10% |
| Margins | median of last 5 annual net margin ≥ 10%, and the latest year is not under half that median |
| Earnings growth | 5-year EPS growth > 0 and latest annual EPS > 0 |
| Revenue growth | 5-year revenue growth ≥ 5% a year |
| Debt | debt-to-equity ≤ 1.0. Sector "Financial Services" is always unknown: leverage is the business |

Grade from the checks that could be answered:

- **Strong**: at least 4 answered and at least 80% passed
- **Weak**: at least 4 answered and under 50% passed
- **Mixed**: the rest
- **Not enough data**: fewer than 4 answered

### Valuation: against the stock's own history

Take the daily trailing P/E over the fetched bars (about 4.7 years), sampled
weekly, positive values only. Compare today's with that history:

- **Cheap**: at or below the 25th percentile
- **Expensive**: at or above the 75th percentile
- **Fair**: between
- **Not judged**: trailing EPS ≤ 0, or under two years of P/E history

Two price levels come out of the same numbers and are stored:

- `cheap_below` = trailing EPS × 25th-percentile P/E
- `expensive_above` = trailing EPS × 75th-percentile P/E

Project 2 draws these. This project only stores and shows them as numbers.

### Trend: context only

Price against the 200-day average is shown on the card as context ("12% under
its 200-day average"). It does not change the action. My call: the plan is a
quality-at-a-fair-price plan, and mixing momentum into the action makes the
track record impossible to read. Project 2 is where technical levels come in.

### Action: per user, computed when read

The verdict is one row per ticker, shared by everyone. The action depends on
whether this user holds the stock and at what weight, so it is computed at
read time from the verdict plus `Position`. First match wins:

| Situation | Action | Reason shown |
|---|---|---|
| Held, quality Weak | **Sell (review)** | "Story check failed: …" plus the failed checks |
| Held, weight > 15%, Expensive | **Trim** | "Over your 15% cap and expensive against its own history" |
| Held, quality Strong, Cheap | **Add** | |
| Held, anything else | **Hold** | over-cap noted as "over your 15% cap" without a trim order |
| Not held, Strong, Cheap | **Buy** | |
| Not held, Strong, Fair or Expensive | **Wait** | "Quality passes; price is not in its cheap range" |
| Not held, Mixed or Weak | **Not a fit** | the failed checks |
| Quality "Not enough data" | **No verdict** | what was missing |

The 15% cap is the existing `WEIGHT_CAP_PCT`; the backend needs its own copy
of the number in one named place. A held stock that is Strong but "Not judged"
on valuation is Hold.

## The track record

A verdict row keeps its previous grades. When a nightly run moves a ticker
**into** Strong + Cheap, write a `VerdictCall` (ticker, date, close, the grades
and reasons at that moment). When it leaves, stamp `ended_on`.

Scoring mirrors `advisor/scoring.py`: return of the stock from the call's close
to 3, 6 and 12 months later, minus the S&P 500 ETF's over the same days, in
USD, price only. Prices come from `investors.PriceHistory`, the store the copy
performance and congress features already use; `price_feed.add_ticker_source`
is how another app asks for its tickers to be priced. A window that has not
elapsed, or has no price, is null and never zero.

The summary (count of calls, share that beat the index, mean edge per window)
is served by an endpoint and an MCP tool. Its page belongs to project 3.

Honest limit, to be stated wherever the summary shows: with one snapshot a
night, the first 3-month figure exists three months after the first run.

## Where it shows (this project)

- **Research page**: a Verdict card on the Overview tab. Action in words, the
  two grades, the checklist with each figure and pass/fail/unknown, the two
  price levels, the trend line, and "as of" the scan date. US company stocks
  only, through the existing `companyDataStatus` gate.
- **Watchlist rows** and the **Portfolio holdings table**: the action as a
  small text badge. One batched request for all tickers, like the ownership
  column (`/api/investors/ownership/`).
- **MCP**: `get_verdict(symbol)` and `get_verdict_track_record()`, dispatching
  the same views.

Design follows `DESIGN.md`: semantic colour utilities only, the badge names
its action in words.

## Shape of the build (my calls, builder may adjust)

- A new Django app `verdicts`. It imports `research` (rows, valuation maths)
  and `portfolio` (positions) and `investors` (prices). None of them import it.
- `research` keeps owning Finnhub shaping: the scan stores the annual and
  quarterly series it needs on `ScreenerRow` (one JSON field) plus the weekly
  trailing P/E percentiles, since the daily bars are in hand only during the
  scan.
- `verdicts.tasks.compute_verdicts` runs after the scan, once, as
  `@synced(reports_health=False, credential=None)`. It reads only stored rows,
  so it can be re-run at any time and gives the same answer.
- Pure functions for checklist, valuation grade and action, each unit-tested
  with table cases; the task and views tested with `APITestCase`.
- Verdict rows carry no `user`. Actions are scoped by `request.user` in the
  view; `users/test_isolation.py` must still pass, and a test must show one
  user's holdings never change another user's action.
- Endpoints: `GET /api/verdicts/?tickers=A,B` (batched, action included),
  `GET /api/verdicts/<ticker>/` (full reasons), `GET /api/verdicts/track-record/`.
  An unknown ticker is `null`, not an error.
- Migrations run against the dev database, per AGENTS.md.

## Left to the builder

- Exact model fields and JSON shapes.
- Whether the percentiles are computed in the scan or the series stored and
  computed in `verdicts`.
- Beat schedule for `compute_verdicts` relative to the 22:30 scan.
- Card layout within the design system.

## Coverage beyond the universe (decided by the owner, 2026-11-11)

Stocks any user holds or watches get a verdict too, even outside the S&P 500
and Nasdaq-100 (NBIS is a core holding and is in neither). The nightly scan
covers them with the same two fetches per symbol.

- Only US-dollar company stocks, decided by the existing rule in
  `research/listings.py`. A European listing or an ETF is "Not covered".
- These extra rows must never appear on Discover: its shelves, counts and
  heatmaps keep describing the index universe only.
- A stock that leaves every watchlist and portfolio stops being scanned; its
  verdict goes stale and is shown with its date, or dropped. Builder's choice.
- A foreign filer may come back with few figures. That is "Not enough data",
  said plainly, never a guess.

## Still open

- **The thresholds** in the quality table are a first guess at "Buffett
  rules". They live in one table and are meant to be argued with once real
  verdicts are on screen.
