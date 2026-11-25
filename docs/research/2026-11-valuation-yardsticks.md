# Valuation yardsticks: graded on stored history (2026-11-25)

Command: `python manage.py grade_valuation` on the dev database, then `--since 2023-01-01`.
Universe: 513 stocks in `in_universe`. Each run also excludes the 86 split suspects (a close that moves 1.5x or more in one session) and is shown below.

## Summary

- **The P/E range does not hold up.** Stocks flagged cheap (P/E at or below the 25th percentile) did worse than the average stock 60, 120 and 250 sessions on. At 250 sessions the grade is "worked against": -2.6% over the full history, and -7.4% from 2023. Expensive P/E flags show no clear edge.
- **The growth line does not hold up either.** Cheap growth flags show no edge. Expensive growth flags lag the average stock (-2.5% at 250 sessions; -5.5% from 2023), graded "worked against". The growth-line spread (cheap minus expensive, +2.7% at 250 sessions) is positive, but neither growth flag grades "held up".
- **Nothing is supported.** Under the rules agreed in the plan (Task 4 step 3), that means: turn the zones off by default and label the badge's price word as a rule of thumb. This is a recommendation for the owner, not a decision.
- **Excluding split suspects does not change any grade.** The full-history and without-suspects runs agree on every grade.
- **The 2023 window is worse, not better.** Every P/E and growth "worked against" case is stronger from 2023.

## Limits

- Split suspects: 86 stocks have a one-session move of 1.5x or more and are probably unadjusted splits. The without-suspects run removes them and shows the same direction.
- Survivorship: the universe is today's 513 stocks, so names that dropped out are missing. This flatters every flag equally, and the cheap-P/E result is already negative despite it.
- Restatements: the fundamentals are as stored, not as first reported. The release-date lag (45 and 60 days) is a model assumption.
- Grading rule (`signals/evaluate.py`): "held up" needs a positive 95% interval and positive halves; "worked against" needs the reverse. A cheap flag that would hold up is downgraded to "cannot be judged fairly", so a cheap flag can only ever be "no edge" or "worked against" here.

---

## Full history: all stocks

### All stocks

513 stocks; 34 never flagged (too little history or losses); 86 whose close moves 1.5x or more in one session (likely an unadjusted split).

| Flag | Sessions ahead | Cases | Stocks | Mean vs average stock | 95% range | First half | Second half | Grade |
|---|---|---|---|---|---|---|---|---|
| P/E range: cheap | 60 | 16320 | 404 | -0.5% | -0.9% to -0.1% | -0.3% | -0.7% | worked against |
| P/E range: cheap | 120 | 16055 | 398 | -1.3% | -1.9% to -0.6% | -0.9% | -1.6% | worked against |
| P/E range: cheap | 250 | 15192 | 373 | -2.6% | -4.1% to -1.0% | -1.9% | -3.3% | worked against |
| P/E range: expensive | 60 | 18179 | 427 | -0.5% | -0.9% to -0.2% | -0.4% | -0.6% | no edge |
| P/E range: expensive | 120 | 17871 | 424 | -0.9% | -1.5% to -0.1% | -1.0% | -0.8% | no edge |
| P/E range: expensive | 250 | 16797 | 415 | -1.2% | -2.6% to +0.3% | -1.5% | -1.0% | no edge |
| Growth line: cheap | 60 | 17211 | 348 | +0.0% | -0.4% to +0.5% | +0.1% | -0.1% | no edge |
| Growth line: cheap | 120 | 17048 | 347 | -0.1% | -0.8% to +0.7% | +0.3% | -0.5% | no edge |
| Growth line: cheap | 250 | 16493 | 340 | +0.1% | -1.4% to +1.7% | +0.4% | -0.2% | no edge |
| Growth line: expensive | 60 | 36860 | 443 | -0.6% | -0.9% to -0.3% | -0.4% | -0.7% | worked against |
| Growth line: expensive | 120 | 36254 | 443 | -1.2% | -1.6% to -0.7% | -1.0% | -1.3% | worked against |
| Growth line: expensive | 250 | 34081 | 428 | -2.5% | -3.6% to -1.4% | -1.8% | -2.9% | worked against |

| Yardstick | Sessions ahead | Cheap minus expensive |
|---|---|---|
| P/E range | 60 | +0.0% |
| P/E range | 120 | -0.4% |
| P/E range | 250 | -1.4% |
| Growth line | 60 | +0.6% |
| Growth line | 120 | +1.1% |
| Growth line | 250 | +2.7% |

Split suspects: AAPL, ABNB, ACGL, AFL, AIG, ALGN, ALNY, AMD, APA, APH, BALL, BAX, BE, BIIB, BKR, BRO, C, CAT, CBRE, CF, CHRW, CIEN, CME, CMI, CNC, COHR, COO, COP, COR, CSX, CTVA, CVNA, D, DD, DE, DECK, DGX, DHR, DPZ, DVN, DXCM, ECHO, ECL, EMR, EOG, EQT, EXC, EXPE, FANG, FAST, FISV, FITB, GL, HON, IRM, JBHT, JCI, LHX, LRCX, MAR, MCO, MPWR, MRNA, NBIS, NCLH, NDSN, NEE, NFLX, NVDA, ODFL, ORLY, PDD, PEG, PPL, PTC, ROL, ROP, SNPS, STT, TPL, UNH, UNP, VRT, WRB, WSM, WST.

### Without split suspects

427 stocks; 29 never flagged (too little history or losses); 0 whose close moves 1.5x or more in one session (likely an unadjusted split).

| Flag | Sessions ahead | Cases | Stocks | Mean vs average stock | 95% range | First half | Second half | Grade |
|---|---|---|---|---|---|---|---|---|
| P/E range: cheap | 60 | 11865 | 326 | -0.5% | -0.8% to -0.0% | -0.3% | -0.6% | worked against |
| P/E range: cheap | 120 | 11636 | 321 | -1.2% | -2.0% to -0.5% | -0.7% | -1.5% | worked against |
| P/E range: cheap | 250 | 10904 | 297 | -2.5% | -4.1% to -1.0% | -1.5% | -3.4% | worked against |
| P/E range: expensive | 60 | 13707 | 350 | -0.5% | -0.8% to -0.2% | -0.3% | -0.6% | no edge |
| P/E range: expensive | 120 | 13447 | 347 | -0.7% | -1.4% to -0.1% | -0.8% | -0.7% | no edge |
| P/E range: expensive | 250 | 12542 | 338 | -0.9% | -2.0% to +0.4% | -1.2% | -0.8% | no edge |
| Growth line: cheap | 60 | 12236 | 279 | +0.1% | -0.3% to +0.5% | +0.0% | +0.1% | no edge |
| Growth line: cheap | 120 | 12103 | 279 | -0.0% | -0.8% to +0.9% | +0.0% | -0.1% | no edge |
| Growth line: cheap | 250 | 11653 | 272 | +0.2% | -1.2% to +1.9% | -0.2% | +0.7% | no edge |
| Growth line: expensive | 60 | 28331 | 368 | -0.5% | -0.8% to -0.2% | -0.3% | -0.6% | worked against |
| Growth line: expensive | 120 | 27828 | 368 | -1.0% | -1.5% to -0.5% | -0.8% | -1.1% | worked against |
| Growth line: expensive | 250 | 26010 | 353 | -2.1% | -3.1% to -1.1% | -1.4% | -2.4% | worked against |

| Yardstick | Sessions ahead | Cheap minus expensive |
|---|---|---|
| P/E range | 60 | +0.1% |
| P/E range | 120 | -0.5% |
| P/E range | 250 | -1.6% |
| Growth line | 60 | +0.6% |
| Growth line | 120 | +1.0% |
| Growth line | 250 | +2.3% |

---

### All stocks from 2023-01-01

513 stocks; 35 never flagged (too little history or losses); 86 whose close moves 1.5x or more in one session (likely an unadjusted split).

| Flag | Sessions ahead | Cases | Stocks | Mean vs average stock | 95% range | First half | Second half | Grade |
|---|---|---|---|---|---|---|---|---|
| P/E range: cheap | 60 | 4329 | 371 | -1.3% | -2.3% to -0.2% | -1.0% | -1.5% | worked against |
| P/E range: cheap | 120 | 4064 | 365 | -3.1% | -4.5% to -1.6% | -2.4% | -3.7% | worked against |
| P/E range: cheap | 250 | 3201 | 331 | -7.4% | -10.1% to -4.7% | -6.3% | -8.4% | worked against |
| P/E range: expensive | 60 | 4884 | 394 | -1.3% | -2.0% to -0.5% | -2.0% | -0.8% | no edge |
| P/E range: expensive | 120 | 4576 | 389 | -1.8% | -3.4% to -0.2% | -3.0% | -1.2% | no edge |
| P/E range: expensive | 250 | 3502 | 362 | -2.9% | -6.8% to +1.3% | -4.2% | -2.1% | no edge |
| Growth line: cheap | 60 | 4183 | 265 | -0.2% | -1.0% to +0.8% | -0.2% | -0.2% | no edge |
| Growth line: cheap | 120 | 4020 | 262 | -0.7% | -2.5% to +1.1% | -0.5% | -1.0% | no edge |
| Growth line: cheap | 250 | 3465 | 249 | -1.2% | -4.9% to +2.7% | -1.3% | -1.1% | no edge |
| Growth line: expensive | 60 | 11911 | 425 | -1.3% | -1.9% to -0.7% | -1.7% | -1.0% | worked against |
| Growth line: expensive | 120 | 11305 | 425 | -2.5% | -3.5% to -1.4% | -3.1% | -2.0% | worked against |
| Growth line: expensive | 250 | 9132 | 401 | -5.5% | -7.9% to -2.5% | -5.1% | -5.8% | worked against |

| Yardstick | Sessions ahead | Cheap minus expensive |
|---|---|---|
| P/E range | 60 | -0.0% |
| P/E range | 120 | -1.3% |
| P/E range | 250 | -4.5% |
| Growth line | 60 | +1.1% |
| Growth line | 120 | +1.8% |
| Growth line | 250 | +4.3% |

Split suspects: AAPL, ABNB, ACGL, AFL, AIG, ALGN, ALNY, AMD, APA, APH, BALL, BAX, BE, BIIB, BKR, BRO, C, CAT, CBRE, CF, CHRW, CIEN, CME, CMI, CNC, COHR, COO, COP, COR, CSX, CTVA, CVNA, D, DD, DE, DECK, DGX, DHR, DPZ, DVN, DXCM, ECHO, ECL, EMR, EOG, EQT, EXC, EXPE, FANG, FAST, FISV, FITB, GL, HON, IRM, JBHT, JCI, LHX, LRCX, MAR, MCO, MPWR, MRNA, NBIS, NCLH, NDSN, NEE, NFLX, NVDA, ODFL, ORLY, PDD, PEG, PPL, PTC, ROL, ROP, SNPS, STT, TPL, UNH, UNP, VRT, WRB, WSM, WST.

### Without split suspects from 2023-01-01

427 stocks; 30 never flagged (too little history or losses); 0 whose close moves 1.5x or more in one session (likely an unadjusted split).

| Flag | Sessions ahead | Cases | Stocks | Mean vs average stock | 95% range | First half | Second half | Grade |
|---|---|---|---|---|---|---|---|---|
| P/E range: cheap | 60 | 3456 | 304 | -1.3% | -2.4% to -0.1% | -1.0% | -1.5% | worked against |
| P/E range: cheap | 120 | 3227 | 299 | -3.3% | -4.8% to -1.7% | -2.6% | -3.8% | worked against |
| P/E range: cheap | 250 | 2495 | 269 | -8.6% | -11.2% to -5.2% | -7.1% | -9.8% | worked against |
| P/E range: expensive | 60 | 4047 | 325 | -1.2% | -1.9% to -0.3% | -1.9% | -0.7% | no edge |
| P/E range: expensive | 120 | 3787 | 322 | -1.5% | -3.0% to +0.4% | -3.0% | -0.7% | no edge |
| P/E range: expensive | 250 | 2882 | 304 | -2.3% | -5.9% to +1.8% | -5.4% | -0.7% | no edge |
| Growth line: cheap | 60 | 3424 | 219 | +0.2% | -0.7% to +1.2% | +0.2% | +0.2% | no edge |
| Growth line: cheap | 120 | 3291 | 217 | -0.0% | -2.1% to +2.0% | +0.0% | -0.1% | no edge |
| Growth line: cheap | 250 | 2841 | 205 | +0.1% | -4.0% to +4.8% | -0.6% | +1.0% | no edge |
| Growth line: expensive | 60 | 9949 | 356 | -1.2% | -1.8% to -0.6% | -1.5% | -0.9% | worked against |
| Growth line: expensive | 120 | 9446 | 356 | -2.2% | -3.3% to -1.0% | -2.6% | -1.8% | worked against |
| Growth line: expensive | 250 | 7628 | 336 | -4.9% | -7.1% to -2.2% | -4.5% | -5.3% | worked against |

| Yardstick | Sessions ahead | Cheap minus expensive |
|---|---|---|
| P/E range | 60 | -0.1% |
| P/E range | 120 | -1.8% |
| P/E range | 250 | -6.3% |
| Growth line | 60 | +1.4% |
| Growth line | 120 | +2.1% |
| Growth line | 250 | +5.0% |
