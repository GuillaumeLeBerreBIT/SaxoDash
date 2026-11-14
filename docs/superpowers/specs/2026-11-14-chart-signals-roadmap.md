# Chart signals: evidence and roadmap

Date: 2026-11-14. Status: proposed, awaiting the owner's go-ahead.

This document records what was tested before any chart-analysis feature was designed, what the
results mean, and the order of features that follows from them. Each feature below gets its own
design and plan when its turn comes; the first one is
`2026-11-14-signal-lab-design.md`.

## Why this exists

The owner wants the app to help decide when to buy good companies, for long-term holdings and for
swing trades, by combining the financial analysis the app already does (the verdict engine) with
analysis of the candlestick chart. The first idea was to draw "buy zones" and "sell zones" on the
chart. Before building it, the idea and its alternatives were tested on the app's own data.

## What was tested, and what came out

All tests use Saxo daily bars for index stocks, about 4.7 years to November 2026. Every figure
uses only data that existed on the day it describes. "Excess" means a stock's forward return minus
the average forward return of all sampled stocks over the same days.

### Test 1: support and resistance zones (128 stocks, about 14,000 zone touches)

Zones were built from clustered swing highs and lows plus traded volume, as in the mockup. Each
touch was compared with a move of the same size to a level on a random day for the same stock.

| After the price reaches | 20 days | 60 days | Rose 2 daily ranges before falling 2 |
|---|---|---|---|
| A support zone | +1.5% | +5.5% | 53.8% |
| Same-sized drop, random day | +2.2% | +6.7% | 55.8% |
| Strongest third of support zones | +0.7% | +3.3% | 52.5% |
| A drop landing where no zone is | +3.2% | +9.5% | 58.0% |

Support zones did worse than an arbitrary dip, reliably (the 95% interval for the 60-day gap is
-1.7 to -0.6 points). More touches and heavier volume made it worse. Resistance zones were no
different from random levels. Sizing zones by each stock's volatility changed nothing.

### Test 2: cheap against the stock's own P/E history (340 stocks, 30 monthly dates)

A 2-year window was used because stored prices reach back only 4.7 years.

| Grade on the day | 3 months excess | 12 months excess |
|---|---|---|
| Cheap | +0.1 | +1.7 |
| Fair | +0.9 | -0.3 |
| Expensive | -1.0 | -0.9 |
| Cheap, graded with hindsight (today's range applied to the past) | +2.6 | +12.7 |

Graded honestly, cheap beat expensive by 1 to 2 points, which this sample cannot tell from zero.
Graded with hindsight the gap is 22 points over 12 months, which is an illusion. Any valuation
drawing on the chart must therefore use only what was known at each date.

### Test 3: twenty common chart signals (125 stocks, 110,000 stock-days, 2023-02 to 2026-08)

| Signal | Cases | 20 days | 60 days | 60-day 95% interval |
|---|---|---|---|---|
| 12-1 momentum, top quarter | 27,280 | +0.90 | +2.90 | +0.81 to +5.14 |
| Gap up over 4% on 2x volume | 330 | +1.63 | +4.57 | +0.46 to +8.72 |
| Up day (2%+) on 2x volume | 1,270 | +1.02 | +2.69 | +0.40 to +5.07 |
| New 1-year high | 3,178 | +0.80 | +2.33 | -0.29 to +5.18 |
| More than 20% below 1-year high | 31,951 | +0.44 | +1.38 | -0.31 to +3.36 |
| Squeeze breakout (tight bands, close above upper) | 1,075 | -0.41 | -2.36 | -3.55 to -1.33 |
| Above 200-day average | 68,297 | -0.02 | +0.01 | -1.33 to +1.53 |
| Pullback in uptrend (RSI 2 under 10) | 16,039 | +0.09 | -0.09 | -1.36 to +1.19 |
| RSI 14 under 30 | 11,966 | -0.13 | +0.02 | -1.04 to +1.28 |
| MACD bullish cross | 4,352 | -0.12 | +0.12 | -0.96 to +1.18 |
| Golden cross | 1,763 | -0.85 | -0.79 | -2.96 to +2.02 |
| Bullish engulfing after 3 down days | 1,366 | -0.17 | +0.52 | -0.96 to +2.05 |
| Hammer after 3 down days | 2,466 | +0.15 | -0.00 | -1.08 to +1.16 |

What held up is what decades of published research also finds: momentum, and drift after a
high-volume news or earnings move. The indicator and candlestick-pattern signals most chart sites
lead with (RSI, MACD, moving-average crosses, engulfing, hammer) showed nothing.

### Limits of all three tests

- One market period, mostly rising. No 2008, 2020 or 2022-style decline is in the sample.
- Today's index members only, so companies that fell out are missing.
- Twenty signals were tried, so one or two would look reliable by chance. The ones that held up
  are trusted more because independent research agrees, not because of this sample alone.
- No trading costs. Effects of 1 to 3 points over 60 days are tilts, not a trading system.

## What other products do (read 2026-11-14)

- TrendSpider: automatic trendlines, Fibonacci, chart and candlestick pattern detection,
  multi-timeframe analysis, 200+ indicators, scanners, alerts, a strategy tester with
  out-of-sample and forward testing, and an ML lab (random forest, nearest neighbours). Its pages
  publish no win rates or accuracy for any detection. The part worth copying is the testing, not
  the drawing.
- Kronos (github.com/shiyu-coder/Kronos, MIT): a transformer pretrained on candlestick sequences
  that forecasts future bars. Weights for the 4M, 25M and 102M models are downloadable. Its
  README gives no accuracy figures, its backtest is Chinese A-shares without costs, and it says
  itself that it is not a production trading system. CPU use is not addressed.
- day-trader-skill (github.com/jakeschincariol/day-trader-skill, MIT): agent prompts plus small
  Python tools for intraday opening-range breakouts with fixed risk rules. It prescribes rules
  and offers no evidence for them. It needs 5-minute bars, which this app does not store.

## Conclusion

Drawing buy and sell zones is not worth building: on this data they point the wrong way. The
purpose is still real, in a different shape: **every chart signal the app shows carries its own
test result, computed on the app's data, and the app says plainly when a popular tool shows no
edge.** That is the thing no chart site shows, it is honest, and it is the base every later
feature (patterns, scanners, ML) plugs into.

## Feature order

1. **Signal Lab** (design written). Store daily bars for the universe, define signals once,
   score each nightly against the average stock, show them as a toggleable lane on the Research
   chart and as a "Setup" card listing what is active today with its evidence.
2. **Deeper history.** Page Saxo charts back beyond 1,200 bars (the `Time` + `Mode=UpTo`
   parameters) so scores cover 2020 and 2022. Without this every grade stays provisional. Small,
   backend only; verify first how far back Saxo serves daily bars.
3. **Value range and entry checklist.** The cheap/expensive price range drawn through time from
   P/E percentiles known at each date, stepping on the real report day (EDGAR dates the app
   already reads). A sidebar checklist: quality, valuation, percent below the 1-year high,
   momentum rank, active signals, next earnings date, portfolio weight against the 15% cap. No
   line is called a buy zone.
4. **Earnings drift.** The gap-on-volume signal is a proxy for earnings. Use the real thing:
   surprise against the estimate, report day and first-session reaction, stored nightly for the
   universe (one Finnhub earnings call per symbol, spread across the week to stay inside the
   60-a-minute key), scored in the Signal Lab like any other signal.
5. **Risk tools for swing trades.** Average-true-range stop distance, position size from a
   chosen risk per trade and the weight cap, and a risk-to-reward ruler on the chart. This is
   where chart analysis helps most reliably: sizing and exits, not prediction.
6. **Discover shelves from signals.** "Strong, cheap and in the momentum top quarter", "High
   volume thrust this week", each shelf showing its signal's grade.
7. **Live track record for signals.** Log each supported signal when it fires and score it
   forward like `VerdictCall`, so the app's claims are checked on data nobody had at design time.
8. **Strategy tester.** Combine signals and verdict grades into a rule, test it walk-forward
   with a held-out final period and a cost per trade, and show drawdown beside return.
9. **ML candidates, admitted only through the same test.** Gradient-boosted trees over the
   signal features, and Kronos-mini run offline on the Mac, each compared with plain momentum on
   a held-out period. A model that does not beat momentum out of sample is not shown. Open
   questions to settle first: Kronos on CPU, and the licence of its weights.

Deliberately not planned: automatic trendlines, Fibonacci levels, chart-pattern detection
(head and shoulders, flags) and intraday day-trading rules. They can be added as Signal Lab
definitions later if wanted; each would have to earn its grade like everything else.
