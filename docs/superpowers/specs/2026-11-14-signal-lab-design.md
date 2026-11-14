# Signal Lab design

Date: 2026-11-14. Status: approved by the owner 2026-11-14, with the instruction to make it financially stricter where possible (entry at the next open and the two-way interval below are those changes). Evidence and the wider
roadmap: `2026-11-14-chart-signals-roadmap.md`.

## Intent

Show chart signals on the Research page, each with a grade earned on the app's own data, so the
owner can see at a glance which candlestick tools have held up and which have not. The app never
says "buy" or "sell" for a signal. It says what the signal is, when it fired, and what happened
afterwards in testing.

Why: three tests on the app's data showed that the popular drawings (support zones, RSI, MACD,
candlestick patterns) had no edge, while momentum and high-volume news moves did. A feature that
draws signals without their evidence would mislead; one that shows the evidence is useful even
when the answer is "this does nothing".

## Goals

- One place where a signal is defined, so the chart, the card and the test agree.
- A nightly score per signal: how a stock did against the average stock 5, 20 and 60 sessions
  after the signal, with an interval and a consistency check.
- A toggleable lane of signal markers on the Research chart, off by default.
- A "Setup" card on the Overview tab listing the signals active on the latest bar, each with
  its evidence in one line.

## Non-goals

- No buy or sell zones, support or resistance bands, trendlines or Fibonacci.
- No alerts, scanner shelves, strategy combinations or ML. They are later roadmap items.
- No intraday data. Signals are daily.
- No value range on the chart (roadmap item 3).
- The `/boards` chart does not get the lane in this round.

## Anti-goals

- A marker that reads as an instruction. Markers are dots with a two-letter code, never arrows,
  and are coloured by grade, never green for "buy".
- A grade that looks firmer than it is. Every evidence line states the number of cases and the
  period, and a signal with too few cases is graded "too few cases", not "no edge".
- A signals page that can spend provider budget. The `signals` app reads stored rows only and
  imports neither `finnhub`, `market` nor `requests`, like `verdicts`.

## Constraints

- AGENTS.md rules apply: zero comments in code, tests first, colours only from `lib/theme.js`,
  a migration is not done until it has run on the dev database, feature branch into `develop`.
- An extra row (a stock only held or watched) is visible only to a user who holds or watches
  it, through `verdicts.visibility`, as for verdicts.
- Bars are identified by date; a listing is matched by Saxo uic.

## How it works

### Stored bars

The nightly scan already fetches 1,200 daily bars per stock and throws most of them away.
`research.DailyBars` keeps them: one row per `ScreenerRow`, `bars` as a JSON list of
`[date, open, high, low, close, volume]`, oldest first, written in `scan_row` after the
technicals step. A bar missing any of open, high, low or close is dropped, as in
`market.to_candle`. About 60 KB per stock, 30 MB for the universe.

### Signals

`signals/definitions.py` holds a tuple `SIGNALS`. Each entry has a `key`, a `label`, a
two-letter `code`, a one-sentence `description`, a `kind` and a detector. Kinds:

- `event`: true on single bars (a gap, a cross, a pattern).
- `state`: true for runs of bars (above the 200-day average). The chart marks the first bar of
  each run; the card shows the state while it lasts.
- `rank`: compares stocks on the same date (momentum top quarter). Computed by the evaluator,
  which sees all stocks; it behaves as a state afterwards.

The first set, with the exact rules used in the 2026-11-14 test (i is the bar, C/O/H/L/V its
close, open, high, low, volume; a rule needing more history than exists is false):

| key | code | kind | rule |
|---|---|---|---|
| `momentum_top` | MO | rank | `C[i-21] / C[i-252] - 1` in the top quarter of stocks that date |
| `news_gap_up` | GU | event | `O[i] > 1.04 * C[i-1]`, `V[i] > 2 *` mean of the 20 prior volumes, `C[i] > 0.98 * O[i]` |
| `news_gap_down` | GD | event | `O[i] < 0.96 * C[i-1]`, volume as above |
| `volume_thrust` | VT | event | `C[i] > 1.02 * C[i-1]`, volume as above |
| `new_high` | NH | event | `C[i]` above the highest high of the 252 prior bars |
| `deep_pullback` | DP | state | `C[i] < 0.8 *` highest high of the last 252 bars including i |
| `above_ma200` | A2 | state | `C[i]` above the 200-bar average close |
| `golden_cross` | GC | event | 50-bar average above the 200-bar average at i, not at i-5 |
| `death_cross` | DC | event | the reverse |
| `rsi_oversold` | OS | state | simple-average RSI 14 below 30 |
| `rsi_overbought` | OB | state | RSI 14 above 70 |
| `pullback_in_uptrend` | PU | event | `C[i]` above the 200-bar average and RSI 2 below 10 |
| `macd_cross_up` | MC | event | MACD (12, 26) above its 9-bar signal at i, not at i-1 |
| `bullish_engulfing` | BE | event | three falling closes, bar i-1 down, bar i up, `C[i] >= O[i-1]`, `O[i] <= C[i-1]` |
| `bearish_engulfing` | SE | event | the mirror after three rising closes |
| `hammer` | HA | event | three falling closes, lower wick at least twice the body, upper wick at most 30% of the range, body above zero |
| `squeeze_breakout` | SQ | event | 20-bar band width (4 sd / mean) under 6% and `C[i]` above mean + 2 sd |

RSI here is the plain ratio of summed gains to summed losses over the window, which is what the
test used; it is a deliberate difference from the Wilder smoothing in `lib/indicators.js`, and
the signal description says "RSI (simple)".

### Scoring

`signals/evaluate.py`, over universe stocks (`ScreenerRow.objects`) with at least 520 bars:

1. For each stock and each bar from index 260, record which signals are true and the forward
   return over 5, 20 and 60 bars where that bar exists. A signal is only known at the close of
   its bar, so the return is measured from the next bar's open to the close 5, 20 or 60 bars
   after the signal: `C[i+h] / O[i+1] - 1`. Measuring from the signal's own close would assume a
   trade nobody could have made, and overstates gap signals most.
2. For each date with at least 50 stocks, subtract the date's average forward return to get the
   excess.
3. Per signal and horizon: number of cases, number of stocks, mean excess, share of cases with
   positive excess, a 95% interval, and the mean excess in the earlier and the later half of
   the dates. The interval is the wider of two seeded bootstraps (400 resamples each, so two
   runs on the same data agree): one resampling stocks, one resampling calendar months. Stocks
   that share a signal on the same days move together, so resampling stocks alone makes the
   interval too narrow; resampling months catches that.
4. Grade, decided on the 60-bar horizon:
   - `too_few`: under 300 cases.
   - `supported`: interval entirely above zero, and both halves above zero.
   - `against`: interval entirely below zero, and both halves below zero.
   - `no_edge`: everything else.

The two-halves rule is the guard against one lucky stretch: twenty-odd signals are tested, so
an interval alone would pass one of them by chance.

### What is stored

- `signals.SignalScore`: one row per (key, horizon) with the figures above, the grade (the same
  on all three horizons of a signal), first and last date covered, `computed_at`.
- `signals.StockSignals`: one row per ticker in `ScreenerRow.everything` with `uic`, `as_of`
  (last bar date), `active` (keys true on the last bar) and `events` (key to the list of dates:
  every date for an event, the first date of each run for a state or rank).

`signals.tasks.compute_signals` runs nightly at 00:45, after the scan (22:30) and the verdicts
(00:15), `@synced(reports_health=False, credential=None)`. A stock whose bars fail to parse is
skipped and named in the run's detail; the rest are written. A stock that leaves
`ScreenerRow.everything` loses its `StockSignals` row.

### API

- `GET /api/signals/` answers every signal: key, label, code, kind, description, grade, and per
  horizon the cases, stocks, mean excess, interval, positive share and both halves, plus the
  period covered. Empty scores (before the first run) give `grade: null`.
- `GET /api/signals/<ticker>/` answers `{"stock_signals": {ticker, uic, as_of, active, events}}`, with
  `null` inside for an unknown ticker or an extra the user neither holds nor watches.

Both need a signed-in user and read only the two tables.

### Research page

- **Signals menu** beside the indicator menu on the chart. Signals are grouped under "Held up
  in testing", "No edge found", "Worked against" and "Too few cases", each row a checkbox with
  its code, label and one evidence line. Choices persist in the chart preferences
  (`signals: {key: bool}`), all off by default.
- **Signal lane**: a 20-pixel lane under the earnings lane, drawn only when a chosen signal has
  a marker in view. A marker is a small dot with the signal's code. Colour follows the grade:
  the accent colour for supported, muted ink for no edge and too few, the warning colour for
  against. Two signals on one day stack side by side; markers that would overlap are thinned, keeping
  the better grade and then the newer one. Hover or focus opens a card: label, date,
  description, and the evidence line.
- **Setup card** on the Overview tab under the verdict card: "Active on the latest session"
  followed by each active signal with its grade word and evidence line, supported first. With
  none active it says so. A footer line states the test period, that results are against the
  average index stock, before costs, and that past results do not promise future ones.
- The evidence line is built in one place (`lib/signals.js::evidenceLine`): for supported or
  against, "+2.9% against the average stock over 60 sessions, 27,280 cases"; for no edge, "No
  edge found in 4,352 cases"; for too few, "Only 120 cases, too few to judge".
- Shown only for a stock the verdict rules would show: a USD `Stock`, and the row's uic equal
  to the signals row's uic (`sameListing`).

## Left to the builder

- Internal helper names and how the per-bar arithmetic is made fast (prefix sums or similar);
  the nightly run should finish within about ten minutes for 520 stocks.
- Exact markup and spacing of the menu, lane and card, following `DESIGN.md`.
- Whether `evidenceLine` shows the 20-session figure in the hover card as a second line.

## Calls made without the owner (check these)

- Grades are decided on 60 sessions, not 20.
- Returns are measured from the next session's open, and the interval is the wider of the
  by-stock and by-month bootstraps; both make grades harder to earn than in the first test.
- A supported signal needs both halves of the period to agree; this will demote signals that
  worked only recently.
- Everything is off by default on the chart; the Setup card is always shown.
- RSI in signals is the simple form, not the chart's Wilder form.
- The popular but unproven signals are included on purpose, so the app can show they have no
  edge.
