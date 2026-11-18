# Chart value guides: growth line, P/E chip, 52-week high, volume gaps

Date: 2026-11-17. Status: reviewed by a builder check; awaiting the owner's approval.
Mockup (approved direction, real dev data): https://claude.ai/artifact/6z7fc2i5VZ71imwwove9q6

## Why

The Research chart shades green below the verdict's `cheap_below` and amber above `expensive_above`
(`components/research/ChartGuides.jsx::PriceZones`, `lib/priceZones.js`). Both are flat prices: today's
trailing EPS times the 25th and 75th percentile of the stock's own P/E. For a fast grower that line sits far
above every past candle, so the whole chart is green. NVDA on 2026-11-16: `cheap_below` $336, close $156,
100% of two years of candles in the cheap zone. The chart judges last year's prices with this year's earnings.

The owner wants the chart to help them see value directly on the candles, simply ("keep it stupid simple"),
and wants room to experiment with more analysis tools later. They are new to chart analysis.

## Goals

1. Replace the flat zones with a **growth line**: the price the company's own earnings growth justified on
   each day, using only figures known on that day.
2. Add a **P/E chip** beside the price: today's P/E against the stock's usual range, in words.
3. Add a **52-week high** line and a **volume gaps** layer, the two candle-derived tools with evidence in the
   Signal Lab (distance from the 1-year high; gap up on 2x volume).
4. Adopt the mockup's **cleaned-up drawing style** for these guides: no painted background, thin lines,
   price tags on the right axis, words beside the tag.

## Non-goals

- Chart patterns (double top/bottom, head and shoulders, triangles, flags) and trendlines. They become a
  separate project that first grades them on the stored 23 years of bars, as the Signal Lab did. On NVDA's
  last two years only 1 of 4 confirmed patterns went the pattern's way.
- Changing the verdict's own grade, action or track record. The verdict keeps judging valuation on its P/E
  percentiles. The growth line is chart context only.
- Smoothing the growth line between reports. Earnings arrive quarterly; the line steps.

## Anti-goals

- Anything that paints most of the chart one colour again.
- A line that sits off the chart and leaves only "↑ off chart" tags as the main feature.
- Hindsight: no candle may be judged with earnings published after its date.
- Copy that reads as an instruction ("buy", arrows). The existing rule stands.

## Approaches considered

- **A. Compute in the nightly verdict run, serve with the verdict (chosen by the owner).** The scan already
  stores `fundamentals_history.quarterly_eps`; `compute_verdicts` already turns stored scan rows into a
  `StockVerdict`. One definition, tested in Python, and the verdict can adopt the same rule later without
  the chart and badge disagreeing. Cost: a migration, and values appear only after the next nightly run.
- B. Compute in the browser from the earnings the Research page already fetches. Fast to try, but a second
  P/E method beside the verdict's; the 2026-11-15 audit already flagged two methods disagreeing.
- C. Hybrid: series from the backend, cap and fair band as frontend settings. Flexible, but the rule then
  lives in two places.

The mockup page remains the place to experiment with rules cheaply.

## Design

### 1. Growth line (backend, `verdicts`)

A new pure module `verdicts/growth_line.py` turns quarterly EPS into dated steps. A step starts when a
quarter's figure becomes known and holds until the next one.

- **Known date.** A quarter counts from `period_end + REPORT_LAG_DAYS` (35). `quarterly_eps` holds the
  quarter-end, not the report day; 35 days is a deliberate approximation that never runs ahead of the
  10-Q deadline (40 days for large filers). EDGAR report days (`research/report_dates.py`) are not used:
  that would add a provider call to a module that must not make any.
- **One-off quarters.** A quarter is replaced by the median of the four quarters before it when its EPS is
  more than 2.5x or less than 0.4x that median (the median must be positive). Only earlier quarters are
  used, so the rule is itself point-in-time; a quarter with fewer than four earlier quarters is kept as it
  is (the stored series reaches back to the 1990s for the holdings, so this only touches the oldest
  steps, which fall outside the ten years kept). Examples in the dev data: GOOGL Q2 2026 $9.11 against a median
  of $2.84 (replaced), META Q3 2025 $1.05 against ~$6.6 (replaced).
- **Trailing EPS** at a step: the sum of the last four adjusted quarters. No step when fewer than four are
  known or the sum is not positive.
- **Growth** at a step: the compound annual growth of trailing EPS over three years
  (`(ttm_now / ttm_3y_ago) ** (1/3) - 1`). No step when either figure is missing or not positive.
- **Fair P/E** = growth in percent, held between 15 and 30 (`FAIR_PE_FLOOR`, `FAIR_PE_CAP`); the FAST Graphs
  P/E = G rule with Graham's 15 as the floor. When growth exceeds 30 the step is marked `capped: true`.
- **Fair price** = fair P/E x trailing EPS.
- Output: a list of steps
  `{"from": "YYYY-MM-DD", "price": float, "pe": float, "growth": float, "eps_ttm": float, "capped": bool}`,
  oldest first. Only steps from the last ten years are kept.

`StockVerdict` gains `growth_line = JSONField(default=list, blank=True)`, `pe_p25` and `pe_p75`
(`FloatField(null=True)`), in one `verdicts` migration. `compute._store` fills all three in the same
per-ticker transaction as the rest of the verdict: the line from the row's `fundamentals_history.quarterly_eps`,
the percentiles from `row.pe_history` (`null` when the valuation is `not_judged`). A row without enough history
gets `[]`. `payload._detail` adds the three fields.

### 2. Reading the price against the line

Done where it is drawn (`lib/valueGuides.js`, new; replaces the zone half of `lib/priceZones.js`), from the
step that covers the candle's date:

| Step | Close below 90% of the line | Within ±10% | Above 110% |
|---|---|---|---|
| `capped: false` | cheap | fair | expensive |
| `capped: true` | cheap | growth priced in | growth priced in |

For a capped step the line is a floor, labelled "P/E 30+": being above P/E 30 does not make a company
growing faster than 30% a year overpriced. The 10% band is `FAIR_BAND` in that module.

### 3. P/E chip (frontend)

A pill beside the price in the chart header: a dot, "P/E 19.8", and "below / inside / above its usual 45–77".
Reads `current_pe`, `pe_p25` and `pe_p75` from the verdict, so it always agrees with the verdict badge.
Hidden when the verdict is `not_judged`. Tooltip: "Today's P/E against the middle half of its own weekly P/E
over about the last five years". The chip uses the verdict's existing P/E method, which counts a quarter
from its quarter end with no report lag; the growth line's stricter 35-day rule is not applied to it, so the
two can differ by a few days around a report. Accepted: the chip must match the badge.

### 4. Drawing (frontend)

- `PriceZones` is replaced by `GrowthLine` in `ChartGuides.jsx`: one amber stepped line (`colors.warn`),
  no fill. The right-axis tag shows the latest step's price; the words beside it read "Growth-fair · P/E 24"
  or "Growth floor · P/E 30+". When the line is outside the visible price range the tag pins to the edge
  with an arrow, as zone tags do today; the price scale is never stretched for it.
- The hover card gains "P/E then" (close / the covering step's `eps_ttm`), "Growth-fair" and the reading
  from section 2 for the hovered day.
- **52-week high**: a dotted step line of the rolling 252-session high (`colors.ink2`), right-axis tag with
  the price and "52w high −35.7%". Computed in `lib/indicators.js` from the bars the chart already has; needs
  252 sessions before the first visible bar, so the chart shows it only from the first bar that has them.
- **Volume gaps**: the Signal Lab's own definitions, so the evidence quoted is the evidence for what is
  drawn (`signals/definitions.py`: `news_gap_up` opens more than 4% above the previous close on more than 2x
  the 20-session volume and closes at or above 98% of its open; `news_gap_down` opens more than 4% below it on
  more than 2x volume). The frontend mirrors these rules in `lib/indicators.js`, pinned by a parity test as
  `indicatorParity.test.js` does for other indicators. Drawn as a box between the previous close and the
  gap day's open, from the gap day until price trades back through the previous close or 60 sessions pass,
  whichever is first. The Guide tab says gap up held up and gap down "cannot be judged fairly", as the
  Setup card does. Only gaps in the last 252 sessions. Up gaps green, down
  gaps red, low opacity; open gaps get a dashed outline. A short label ("Gap up 2.6x vol") on unfilled gaps
  and gaps of 3% or more; the hover card gives size, volume multiple, and whether and when it filled.
  Computed in `lib/indicators.js`.
- Style: the right-axis tags replace the top-left word boxes for all guides. Tags that would overlap are
  pushed apart vertically, as in the mockup.

### 5. Sentence above the chart

The owner chose to **show both yardsticks, labelled as two views** (2026-11-17). They can disagree (MSFT:
badge cheap at P/E 27 against its usual 28–36; growth line fair to expensive), and that is shown, not hidden.

- The word and "why" stay on the verdict: `why` reads the stored `verdict.valuation` ("Strong company, cheap
  price."), so it always matches the badge and the chip. The "The verdict updates tonight" clause goes, since
  nothing on the chart compares the live price with `cheap_below` any more.
- The "next" line that quotes `cheap_below` / `expensive_above` prices is replaced by the growth-line reading,
  introduced as a second view: "Against its growth: earnings grew 24% a year over three years, which supports
  a P/E of 24, about $437. Price is +18% from that line, so fair." For a capped step: "Against its growth:
  earnings grew 167% a year, more than a P/E of 30 assumes. At P/E 30 that is about $237; price is −34%
  below it, so cheap even on that floor." With no growth line: "Too little earnings history for a growth line."
- The "opportunity zone" / "buy zone" wording and its green tone go: they belonged to the flat zones.
- `cheap_below` and `expensive_above` stay in the verdict and payload (other cards and the track record may
  read them); only the chart stops drawing them. Stop-loss and earnings lines are unchanged.

### 6. Switches

The Guides menu (`chartPrefs.guides`) becomes: `value` (growth line + chip, on), `high52` (on), `gaps` (on),
`plan` (stop-loss, off, unchanged). The stored `zones` key maps to `value` when read so a saved preference
survives.

### 7. Records to update

- `docs/decisions.md`: rewrite "The chart shows where the price is cheap or expensive for the company, in
  words, and nothing from the candles" to describe the growth line, the chip, and why two candle tools are
  now drawn (they are the two with evidence; everything else stays in the Setup card and Guide tab).
- Guide tab: one entry each for the growth line, the chip, the 52-week high and volume gaps, saying what they
  are and the evidence for each.

## Testing

Backend (`verdicts/test_growth_line.py`): steps start 35 days after quarter end; a one-off quarter is
replaced and its neighbours are not; fewer than four quarters or non-positive EPS gives no step; growth
under 15 gives P/E 15, over 30 gives 30 with `capped`; a test that no step uses a quarter whose known date
is after the step's date. `test_compute` asserts the field is filled and `[]` without history;
`test_views` asserts `growth_line`, `pe_p25`, `pe_p75` in the detail payload.

Frontend: `valueGuides` readings including the capped column; 52-week high with fewer than 252 prior bars;
gap detection, the 60-session end, fill detection; `chartPrefs` migration of `zones` to `value`; the chip's
three words; the sentence for normal, capped and missing lines. Screenshot review on NVDA, MSFT, GOOGL in
Republic and Porcelain at desktop and phone width, per the `saxodash-design-system` skill.

## Rollout

Migrate the dev database after adding the field. The growth line is empty until the next `compute_verdicts`
run; run it once by hand on the dev database before the screenshot review.

## Calls made by Claude (owner to check)

- 35-day report lag; one-off rule 2.5x / 0.4x against the previous four quarters' median.
- Fair P/E between 15 and 30; above 30 the line is a floor reading "growth priced in", never "expensive".
- Fair band ±10%.
- The verdict's grade and action are unchanged; the growth line is a labelled second view (owner chose this).
- Gaps use the Signal Lab's definitions (4% open gap, 2x volume), not the mockup's range gaps, so fewer and
  larger gaps are drawn; past year, 60-session boxes.
- New `pe_p25` / `pe_p75` fields on `StockVerdict` rather than joining `ScreenerRow` in the payload.
- The chip keeps the verdict's no-lag P/E so it matches the badge.

## Left to the builder

Component and function names beyond those named here, tag collision handling, exact label copy within the
rules above, and how `TVChart` passes the new layers through.

## Addendum 2026-11-18: usual P/E line and fair corridor

The owner previewed the branch and chose "A plus B" after comparing FAST Graphs, GuruFocus GF Value, P/E band
charts and Morningstar's fair-value bands.

- **Approaches considered.** A: a second line at the stock's usual P/E (FAST Graphs' blue "normal P/E" line).
  B: a faint ±10% corridor around the growth line, so "fair" is visible (GuruFocus' colourless band, without
  their red and green shading). C: a P/E ladder (earnings x 15/20/25/30) with no fair word. The owner chose A and B
  together.
- **Usual P/E line.** For each candle: the covering growth step's `eps_ttm` x the middle of the stock's usual
  range, `(pe_p25 + pe_p75) / 2`. A thin dashed line in `colors.accent`, stepped like the growth line (dashed because the light theme's accent is the MA 50 blue). Right-axis tag:
  "Usual P/E 61". Hidden when the chip is hidden. Claude's call: the midpoint of the range the chip already
  prints, rather than a stored median, so the line, the chip and the badge read from the same two numbers and no
  migration or nightly scan is needed. Like FAST Graphs' normal P/E, it applies today's five-year range to past
  earnings; the earnings stay point-in-time.
- **Fair corridor.** A fill in `colors.warn` at low opacity between 0.9x and 1.1x the growth line, built from
  `FAIR_BAND`. On a capped step only the part below the line is drawn, since above a P/E 30+ floor reads "growth
  priced in", not "expensive". No other shading; the anti-goal on painting the chart stands.
- **Hover card** adds "Usual P/E" with its price for the hovered day.
- **Switch.** Both sit under the existing `value` guide.
- Frontend only: `lib/valueGuides.js`, `ChartGuides.jsx`, the hover legend, Guide tab copy, tests.

### Revision 2026-11-18: green and red zones instead of the amber corridor

After seeing the amber corridor the owner asked where cheap and expensive show, and asked for green and red back,
but not as full zones: "from where it starts down" for cheap and the reverse for expensive. The corridor is
replaced by:

- a thin green line at 0.9x the growth line (where cheap starts) with a green zone below it that fades out over
  another 10% of the line's price;
- a thin red line at 1.1x (where expensive starts) with a red zone above it that fades out over another 10%;
- nothing between the two lines (fair is clear, as on GuruFocus);
- on a capped step only the green side, since above a P/E 30+ floor is not expensive.

The fade stops each zone well short of painting the chart, which keeps the anti-goal.

### Revision 2026-11-18: cheap and expensive tags; usual P/E line removed

The owner asked which P/E each colour starts at and chose to remove the usual P/E line. The right axis now tags
the green line "Cheap · P/E 21" in green and the red line "Expensive · P/E 25" in red (MSFT), each P/E being the
growth line's P/E x 0.9 and x 1.1, rounded. A capped step has only the cheap tag ("Cheap · P/E 27" for NVDA).
The P/E chip still shows the stock's usual range.

### Revision 2026-11-18: one yardstick, the verdict's own P/E range

The owner asked for what is financially correct and rejected two views that disagree. Neither yardstick is
proven (the P/E range test found 1-2 points a year, not reliably different from zero; the growth line was never
tested), so the chart now uses the one the verdict and its track record already use, drawn point in time:
`StockVerdict.eps_line` (trailing EPS at each quarter end, the verdict's method) times `pe_p25` (green line,
"Cheap · P/E 28") and `pe_p75` (red line, "Expensive · P/E 36"), with zones fading outward and fair clear between.
The growth line, its 35-day lag, one-off rule, cap and the "Against its growth" sentence are removed; the sentence
now reads "Cheap below US$528.35 (P/E 28), expensive above US$687.68 (P/E 36)." Migration 0004 (unpushed) now
adds `eps_line` instead of `growth_line`. Grading both yardsticks on history is planned in
`docs/superpowers/plans/2026-11-18-valuation-yardstick-test.md`.
