# Valuation yardsticks on stored history (2026-11-18)

Plan: `docs/superpowers/plans/2026-11-18-valuation-yardstick-test.md`. Command: `python manage.py grade_valuation`
(`--since 2023-01-01` for the Signal Lab's window). Engine: `signals/evaluate.score`, horizons 60, 120 and 250
sessions, graded on 250. Cases: one per stock per month (first session), measured from the next open against the
same-day average of all index stocks with data.

## Summary

**Neither yardstick's "cheap" reading held up. The stock's own P/E range points the wrong way.**

- **P/E range, cheap** (the verdict badge and the green zone): stocks at or below their usual 25th-percentile P/E
  did *worse* than the average stock. Over a year that's -2.6% (95% range -3.7% to -1.3%) across 2003-2026 and
  -7.4% since 2023, negative in both halves of each window. Survivorship flatters "cheap", so the true figure is
  likely worse, not better.
- **P/E range, expensive** (the red zone): -1.6% a year over the full history (95% range -2.6% to -0.5%, both
  halves), so the warning held there; since 2023 it is no edge (-2.7%, range spans zero).
- **P/E range, cheap minus expensive**: -0.9% a year over the full history and -4.7% since 2023. The range does not
  separate better from worse buys; "cheap" did worse than "expensive".
- **Growth line, cheap**: no edge in any window (-0.4% a year, range -1.6% to +0.9%).
- **Growth line, expensive** (price more than 10% above an uncapped growth line): -2.5% a year over the full
  history (range -3.4% to -1.6%) and -6.5% since 2023, negative in both halves of both windows. **This is the one
  reading with evidence behind it, and it is a warning, not a buy signal.** Cheap minus expensive: +2.1% a year,
  +4.0% since 2023.
- Excluding the 147 stocks whose close moves 1.5x or more in one session (likely an unadjusted split in the stored
  bars, see limits) changes no conclusion.

How to read the grade column: the grades are written from a buyer's side. For an *expensive* flag, "worked
against" means the flagged stocks did worse than average, which is what the warning claims.

## Decision under the rules fixed in the plan

Neither yardstick's cheap reading is supported, so the rule is: turn the cheap and expensive zones off by default
and label the badge's price word as a rule of thumb. Two facts go beyond that rule and are for the owner to weigh:

1. The verdict's buy grade (strong quality **and** cheap) rests on the P/E range's "cheap", which did worse than
   average. That grade's track record (`VerdictCall`) should be read in that light.
2. The growth line's "expensive" warning is the only valuation reading here with evidence. Using it would be a new
   design (it changes what the page says), not a tweak.

## Limits

- **Survivorship.** The universe is today's index members. This flatters every "cheap" reading, which makes the
  P/E range's negative result stronger, not weaker.
- **Restated earnings.** Finnhub may serve restated quarterly EPS, a mild hindsight that cannot be removed with the
  data held.
- **Unadjusted splits in the bars.** Some stored price series are not split-adjusted (LRCX 814 -> 81 on 2024-10-03,
  COO 372 -> 96 on 2024-02-20, CSX 24 -> 8 on 2011-06-16), while Finnhub's EPS is adjusted. The 1.5x rule also
  catches real crash days, so the exclusion run is deliberately broad; it changes no conclusion. The same bars feed
  the Research chart and the Signal Lab.
- **Reporting lag.** Both yardsticks count a quarter 35 days after its period end. The live verdict counts it from
  the period end, but live data only holds quarters already published, so that is not hindsight on today's badge.
- **Window.** The P/E range uses the 1,200 sessions before each day, as the live scan does, and needs 104 weekly
  values.

## Results
### All stocks

513 stocks; 32 never flagged (too little history or losses); 147 whose close moves 1.5x or more in one session (likely an unadjusted split).

| Flag | Sessions ahead | Cases | Stocks | Mean vs average stock | 95% range | First half | Second half | Grade |
|---|---|---|---|---|---|---|---|---|
| P/E range: cheap | 60 | 26924 | 473 | -0.4% | -0.7% to -0.1% | -0.5% | -0.3% | worked against |
| P/E range: cheap | 120 | 26501 | 470 | -1.1% | -1.6% to -0.6% | -1.2% | -1.1% | worked against |
| P/E range: cheap | 250 | 25776 | 461 | -2.6% | -3.7% to -1.3% | -2.7% | -2.5% | worked against |
| P/E range: expensive | 60 | 29028 | 463 | -0.4% | -0.7% to -0.1% | -0.6% | -0.3% | worked against |
| P/E range: expensive | 120 | 28583 | 459 | -0.7% | -1.2% to -0.2% | -1.2% | -0.4% | worked against |
| P/E range: expensive | 250 | 27659 | 459 | -1.6% | -2.6% to -0.5% | -2.0% | -1.4% | worked against |
| Growth line: cheap | 60 | 28521 | 425 | -0.1% | -0.3% to +0.2% | -0.1% | -0.1% | no edge |
| Growth line: cheap | 120 | 28275 | 423 | -0.2% | -0.8% to +0.4% | -0.2% | -0.3% | no edge |
| Growth line: cheap | 250 | 27802 | 420 | -0.4% | -1.6% to +0.9% | -0.5% | -0.3% | no edge |
| Growth line: expensive | 60 | 56512 | 463 | -0.5% | -0.7% to -0.3% | -0.4% | -0.6% | worked against |
| Growth line: expensive | 120 | 55613 | 463 | -1.1% | -1.5% to -0.6% | -1.0% | -1.1% | worked against |
| Growth line: expensive | 250 | 53735 | 458 | -2.5% | -3.4% to -1.6% | -2.0% | -2.8% | worked against |

| Yardstick | Sessions ahead | Cheap minus expensive |
|---|---|---|
| P/E range | 60 | +0.0% |
| P/E range | 120 | -0.4% |
| P/E range | 250 | -0.9% |
| Growth line | 60 | +0.5% |
| Growth line | 120 | +0.8% |
| Growth line | 250 | +2.1% |

Split suspects: AAPL, ABNB, ACGL, AFL, AIG, ALGN, ALNY, AMD, APA, APH, BALL, BAX, BE, BIIB, BKR, BRO, C, CAT, CBRE, CF, CHRW, CIEN, CME, CMI, CNC, COHR, COO, COP, COR, CSX, CTVA, CVNA, D, DD, DE, DECK, DGX, DHR, DPZ, DVN, DXCM, ECHO, ECL, EMR, EOG, EQT, EXC, EXPE, FANG, FAST, FIS, FISV, FITB, FLEX, FOX, GD, GEN, GL, GPN, HAL, HBAN, HIG, HON, HOOD, HSIC, HSY, INCY, INTU, IR, IRM, ITW, J, JBHT, JCI, KDP, KEY, LDOS, LEN, LHX, LIN, LNT, LRCX, LVS, MAR, MCO, MDLZ, MGM, MNST, MOS, MPWR, MRNA, MRVL, MS, NBIS, NCLH, NDSN, NEE, NFLX, NOC, NUE, NVDA, O, ODFL, OKE, ORLY, OXY, PCG, PDD, PEG, PGR, PHM, PNC, PODD, PPL, PTC, REGN, RF, RMD, ROL, ROP, ROST, SBUX, SMCI, SNPS, SPGI, STT, SYK, TKO, TMUS, TPL, TRGP, TROW, TSCO, TTWO, UAL, UNH, UNP, VLO, VRT, VRTX, VTRS, WMB, WRB, WSM, WST, WTW, WY.

### Without split suspects

366 stocks; 23 never flagged (too little history or losses); 0 whose close moves 1.5x or more in one session (likely an unadjusted split).

| Flag | Sessions ahead | Cases | Stocks | Mean vs average stock | 95% range | First half | Second half | Grade |
|---|---|---|---|---|---|---|---|---|
| P/E range: cheap | 60 | 18623 | 338 | -0.3% | -0.6% to -0.0% | -0.3% | -0.4% | worked against |
| P/E range: cheap | 120 | 18302 | 335 | -1.0% | -1.6% to -0.4% | -0.7% | -1.3% | worked against |
| P/E range: cheap | 250 | 17760 | 328 | -2.3% | -3.6% to -1.0% | -1.6% | -3.0% | worked against |
| P/E range: expensive | 60 | 20942 | 329 | -0.3% | -0.6% to -0.1% | -0.5% | -0.3% | worked against |
| P/E range: expensive | 120 | 20614 | 325 | -0.5% | -0.9% to +0.0% | -1.0% | -0.1% | worked against |
| P/E range: expensive | 250 | 19972 | 325 | -1.2% | -2.1% to -0.1% | -1.8% | -0.8% | worked against |
| Growth line: cheap | 60 | 19673 | 300 | +0.0% | -0.3% to +0.3% | -0.0% | +0.0% | no edge |
| Growth line: cheap | 120 | 19522 | 299 | -0.1% | -0.7% to +0.5% | -0.1% | -0.1% | no edge |
| Growth line: cheap | 250 | 19215 | 296 | -0.1% | -1.4% to +1.4% | -0.3% | +0.1% | no edge |
| Growth line: expensive | 60 | 40524 | 331 | -0.4% | -0.6% to -0.2% | -0.3% | -0.5% | worked against |
| Growth line: expensive | 120 | 39862 | 331 | -0.8% | -1.3% to -0.3% | -0.8% | -0.9% | worked against |
| Growth line: expensive | 250 | 38498 | 326 | -1.9% | -2.8% to -0.8% | -1.6% | -2.0% | worked against |

| Yardstick | Sessions ahead | Cheap minus expensive |
|---|---|---|
| P/E range | 60 | +0.0% |
| P/E range | 120 | -0.5% |
| P/E range | 250 | -1.2% |
| Growth line | 60 | +0.4% |
| Growth line | 120 | +0.7% |
| Growth line | 250 | +1.7% |

### All stocks from 2023-01-01

513 stocks; 34 never flagged (too little history or losses); 147 whose close moves 1.5x or more in one session (likely an unadjusted split).

| Flag | Sessions ahead | Cases | Stocks | Mean vs average stock | 95% range | First half | Second half | Grade |
|---|---|---|---|---|---|---|---|---|
| P/E range: cheap | 60 | 5158 | 407 | -1.0% | -1.8% to -0.2% | -0.6% | -1.5% | worked against |
| P/E range: cheap | 120 | 4735 | 398 | -2.9% | -4.3% to -1.3% | -1.5% | -4.4% | worked against |
| P/E range: cheap | 250 | 4010 | 372 | -7.4% | -10.4% to -3.8% | -3.9% | -11.6% | worked against |
| P/E range: expensive | 60 | 5200 | 409 | -0.9% | -1.7% to -0.0% | -1.4% | -0.5% | no edge |
| P/E range: expensive | 120 | 4755 | 399 | -0.7% | -2.3% to +1.0% | -1.6% | +0.0% | no edge |
| P/E range: expensive | 250 | 3831 | 374 | -2.7% | -7.0% to +2.4% | -3.5% | -2.0% | no edge |
| Growth line: cheap | 60 | 4308 | 269 | -0.2% | -1.1% to +0.7% | -0.2% | -0.2% | no edge |
| Growth line: cheap | 120 | 4062 | 262 | -0.8% | -2.6% to +1.1% | -0.5% | -1.2% | no edge |
| Growth line: cheap | 250 | 3589 | 253 | -2.5% | -6.5% to +1.7% | -1.3% | -4.1% | no edge |
| Growth line: expensive | 60 | 12127 | 427 | -1.3% | -2.0% to -0.8% | -1.7% | -1.0% | worked against |
| Growth line: expensive | 120 | 11228 | 424 | -2.7% | -3.7% to -1.4% | -3.2% | -2.2% | worked against |
| Growth line: expensive | 250 | 9350 | 406 | -6.5% | -9.3% to -3.1% | -5.8% | -7.1% | worked against |

| Yardstick | Sessions ahead | Cheap minus expensive |
|---|---|---|
| P/E range | 60 | -0.1% |
| P/E range | 120 | -2.2% |
| P/E range | 250 | -4.7% |
| Growth line | 60 | +1.1% |
| Growth line | 120 | +1.9% |
| Growth line | 250 | +4.0% |

Split suspects: AAPL, ABNB, ACGL, AFL, AIG, ALGN, ALNY, AMD, APA, APH, BALL, BAX, BE, BIIB, BKR, BRO, C, CAT, CBRE, CF, CHRW, CIEN, CME, CMI, CNC, COHR, COO, COP, COR, CSX, CTVA, CVNA, D, DD, DE, DECK, DGX, DHR, DPZ, DVN, DXCM, ECHO, ECL, EMR, EOG, EQT, EXC, EXPE, FANG, FAST, FIS, FISV, FITB, FLEX, FOX, GD, GEN, GL, GPN, HAL, HBAN, HIG, HON, HOOD, HSIC, HSY, INCY, INTU, IR, IRM, ITW, J, JBHT, JCI, KDP, KEY, LDOS, LEN, LHX, LIN, LNT, LRCX, LVS, MAR, MCO, MDLZ, MGM, MNST, MOS, MPWR, MRNA, MRVL, MS, NBIS, NCLH, NDSN, NEE, NFLX, NOC, NUE, NVDA, O, ODFL, OKE, ORLY, OXY, PCG, PDD, PEG, PGR, PHM, PNC, PODD, PPL, PTC, REGN, RF, RMD, ROL, ROP, ROST, SBUX, SMCI, SNPS, SPGI, STT, SYK, TKO, TMUS, TPL, TRGP, TROW, TSCO, TTWO, UAL, UNH, UNP, VLO, VRT, VRTX, VTRS, WMB, WRB, WSM, WST, WTW, WY.

### Without split suspects from 2023-01-01

366 stocks; 24 never flagged (too little history or losses); 0 whose close moves 1.5x or more in one session (likely an unadjusted split).

| Flag | Sessions ahead | Cases | Stocks | Mean vs average stock | 95% range | First half | Second half | Grade |
|---|---|---|---|---|---|---|---|---|
| P/E range: cheap | 60 | 3672 | 292 | -1.1% | -2.0% to -0.3% | -0.8% | -1.4% | worked against |
| P/E range: cheap | 120 | 3351 | 284 | -3.5% | -5.1% to -1.7% | -2.3% | -4.8% | worked against |
| P/E range: cheap | 250 | 2809 | 264 | -9.3% | -12.1% to -6.2% | -6.6% | -12.6% | worked against |
| P/E range: expensive | 60 | 3686 | 289 | -0.6% | -1.6% to +0.3% | -1.1% | -0.2% | no edge |
| P/E range: expensive | 120 | 3358 | 281 | +0.0% | -1.8% to +2.1% | -1.1% | +0.9% | no edge |
| P/E range: expensive | 250 | 2716 | 268 | -1.3% | -5.3% to +3.8% | -2.2% | -0.6% | no edge |
| Growth line: cheap | 60 | 2878 | 187 | -0.1% | -1.0% to +1.1% | -0.3% | +0.2% | no edge |
| Growth line: cheap | 120 | 2727 | 182 | -0.4% | -2.5% to +1.8% | -0.6% | -0.1% | no edge |
| Growth line: cheap | 250 | 2420 | 175 | -1.4% | -6.0% to +4.3% | -1.9% | -0.6% | no edge |
| Growth line: expensive | 60 | 8886 | 309 | -1.1% | -1.7% to -0.5% | -1.4% | -0.9% | worked against |
| Growth line: expensive | 120 | 8224 | 307 | -2.2% | -3.5% to -0.8% | -2.6% | -1.9% | worked against |
| Growth line: expensive | 250 | 6860 | 294 | -5.2% | -8.3% to -1.7% | -4.5% | -5.7% | worked against |

| Yardstick | Sessions ahead | Cheap minus expensive |
|---|---|---|
| P/E range | 60 | -0.5% |
| P/E range | 120 | -3.5% |
| P/E range | 250 | -8.0% |
| Growth line | 60 | +1.0% |
| Growth line | 120 | +1.8% |
| Growth line | 250 | +3.8% |
