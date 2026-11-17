# UX audit A: Dashboard `/`, Portfolio `/portfolio`, Analytics `/analytics`

Captures (prefix `uxa-`): `uxa-{dash,port,analytics}-{1500,390}.png`, plus `-fold.png` and `.txt` outlines, in the tmp directory. No amounts or holdings are quoted below. Phone heights come from `uxa-blocks.mjs`, desktop from the screenshots.

## 1. Dashboard `/`

Main question: "How am I doing, and does anything need me?"

Desktop, page 2119px tall (about 2 folds). Reading order:
1. Net worth card, 8 cols, about 600px. It holds a hero value, 4 sub-figures, a 5-cell change strip (Day, Week, Month, YTD, Spent MTD), a two-segmented-control chart (series and range) and a footnote.
2. "This week" card, 4 cols, about 400px. It holds 5 alert lines plus a second heading, "Upcoming earnings", inside the same card.
3. Portfolio card, 8 cols, about 510px. It has 3 tiles and a 6-row table.
4. Allocation & movement heatmap, 4 cols, about 380px.
5. Vs the US 500, 4 cols, about 130px (a short card next to a taller one).
6. Smart money, 4 cols, about 330px.
7. Allocation card, 4 cols, about 390px. It has a colour bar, a legend and a currency block.
8. Recent transactions, 8 cols, about 330px.
9. Movers, 4 cols, about 360px.

Above a 1000px fold: net worth, the top of "This week", and the top of the Portfolio table.

Phone, page 4457px tall (about 5 phone screens). Block heights: Net worth 930, This week 452, Portfolio 664, Heatmap 441, Vs US 500 173, Smart money 347, Allocation 417, Transactions 383, Movers 383. Net worth alone is a full screen.

### Critique

**Blocker**
- The net worth chart and the change strip are misleading. A one-day jump in cash flattens the whole history line to zero. The strip shows triple-digit and four-digit percentages in green for Week, Month and YTD (capture region: net worth card, change strip, y 215-285 at 1500px). The cause is a base of near zero, i.e. deposits or cash being read as performance. The first card gives a false answer, and the footnote does not say so. `HeroValue` and `NetWorthChart` should not show a % change when the start value is tiny relative to the end, or when the series jumps. They should show the money delta only, with "cash added" named.
- The page has no single answer. It is nine equal cards and nothing says "all fine" or "do this". The nearest thing, "This week", is placed beside the chart in the right column. It mixes concentration warnings, a data-quality note ("priced off Saxo P/L, not a live quote"), a cash-share note and a cap breach. Three of the five lines say the same thing (MSFT 33%, top 3 = 68%, above your 15% cap).

**Major**
- The same facts repeat across cards. Concentration appears in "This week" three times, in the Allocation card (Top 3, HHI) and in the Portfolio "Top holding" tile. Weights appear in the Portfolio table, the Allocation legend and the heatmap. Return per holding appears in the table, the heatmap in "Since purchase" mode and Movers "Since purchase". Today's change appears in the table, the heatmap and Movers "Today". The unrealised figure appears in the hero and in the Portfolio tile. Value appears in the header chips, the hero, the Portfolio tile and the Positions strip.
- The header chips (two euro figures with no label) next to the net worth hero read as a third and fourth total. At 1500px they show a value that differs from the hero and are not labelled (Layout top bar).
- Portfolio card: 3 tiles take about 90px to say value, top holding and count. The count is already in the context row ("6 positions"). The top holding is already in the first table row. Only the value and since-purchase line is new, and the hero's unrealised figure already covers it.
- "Vs the US 500" is a 130px card with three numbers and no chart. It sits beside the taller Smart money card, which leaves dead space under it (y 1340-1600). The "Edge" figure red-on-red-arrow reads as an alarm after 68 days of history. The card's sub-label says 68 days but the claim is shown as a headline.
- "Smart money" shows net shares in M with no unit explanation beyond the context row, and no link to where the detail is. A "Funds" column already exists on Portfolio.
- The Allocation card's currency block ("100% USD") restates the Portfolio page's currency card. Its HHI figure ("HHI 0.20") needs explaining, and the user rejected anything that needs explaining.
- Heatmap legend "-3% ... +3%" plus the header line "Today -x% biggest driver" plus the "Today / Since purchase" toggle: three controls and notes for one small tile.
- Row-height and type inconsistency. The Portfolio table rows are 48px with logos, while Recent transactions rows are 44px with no logos. Movers uses tickers only, no logo and no name. Smart money has logo, ticker and name.

**Minor**
- Context rows are inconsistent. "Saxo + bank · as of", "At a glance · 6 positions", "Sized by value, grouped by sector", "Since inception · net-worth history · 68 days", "13F · Q2 2026 · net shares, tracked funds". The dot colour carries no stated meaning here.
- "View all →" is `text-[13px] font-semibold` in Recent transactions (Dashboard.jsx:53) and "Analytics →" in Vs benchmark. The two are not the same style or wording.
- Segmented controls: the chart has two groups in one row (series and range). On a phone this wraps to two rows.
- Type colour: percentages use green/red with ▲▼ on the table, but Recent transactions amounts are neutral white with "-" for outflows and "—" for sells (a sell total shows a dash, not the proceeds). Amounts are formatted `<amount>` in one column and `<amount>` in the next, in one row.
- "Spent MTD" in the change strip is not a net worth change. It belongs elsewhere (Money).
- Empty states: "No holdings report in the next 2 weeks." is plain text inside a card with an uppercase-less heading, unlike `EmptyState` elsewhere (Dashboard.jsx uses `EmptyState` for transactions).
- Loading state is a generic skeleton of 4 blocks that does not match the real layout (Dashboard.jsx:121-129).
- Code comment in Dashboard.jsx:36-37 breaks the zero-comments rule (legacy, leave).

Phone: the order is the desktop order flattened, so the heatmap (441px) and the Smart money card (347px) sit before Recent transactions. The net worth card has 2 control rows and a 250px chart. The alert card comes second but only after a full screen of chart.

### Target hierarchy (one recommendation)

Answer first: one top card "Where you stand". It gives the net worth, the money change over the chosen range (no % when the base is not comparable), and one sentence of what needs you ("Nothing needs you" or the top 1 to 2 items from This week, each with a link). The chart sits under it, collapsed to a single range selector. Then the holdings table (the only place for per-holding figures), then one side column. Smart money, Vs the US 500 and the heatmap become a single "How you compare" card or move to Analytics and Investors. Movers, Allocation and the heatmap are deleted as cards: the table already shows today, return and weight, and Portfolio owns allocation.

```
Desktop (1500)
+--------------------------------------+------------------+
| Where you stand: value, change,      | Needs you        |
| one sentence, chart + range          | (max 2 items,    |
|                                      |  merged)         |
+--------------------------------------+------------------+
| Holdings table (value, today,        | Smart money      |
| return, weight)  [View all]          | (top 3)          |
+--------------------------------------+------------------+
| Recent transactions (last 5)         | Vs US 500 (1 row)|
+--------------------------------------+------------------+

Phone (390)
[ Where you stand + sentence ]
[ chart, 1 range row, 220px  ]
[ Needs you (max 2)          ]
[ Holdings (ticker, value,   ]
[  today, return)            ]
[ Smart money top 3          ]
[ Recent transactions        ]
```
Target: 2 folds on desktop become 1.3, and 5 phone screens become about 3.

### Small fixes
- `Dashboard.jsx:161-164` — hide the % in the change strip when the base is not comparable; keep the money delta only.
- `Dashboard.jsx:176` — give `VsBenchmark` a row of the same height as the card beside it, or put it in the net worth card footer.
- `Dashboard.jsx:53` — use the same "View all →" style and wording as the other card links (one shared component).
- `Dashboard.jsx:121-129` — make the skeleton match the real layout (one hero, one table).
- `Dashboard.jsx:169` — merge the three concentration lines into one before they reach `ThisWeek`.
- `components/dashboard/ThisWeek` — use `EmptyState` for "No holdings report in the next 2 weeks" and drop the card's second heading, or hide the block when empty.

## 2. Portfolio `/portfolio`

Main question: "What do I hold, and is it right-sized?"

Desktop, page 2095px tall, about 2 folds. Reading order:
1. Header card with the Saxo connected badge and the Positions / Transactions toggle, 4 tiles (total net worth, investment portfolio, total P/L, bank balance), about 170px.
2. Search bar with an All / Stocks / ETFs segmented control, about 40px.
3. Positions table, 12 columns, about 480px.
4. Sectors donut, about 420px, 4 cols. Concentration, about 230px, 4 cols. Currency, about 190px, 4 cols. Three cards of three different heights in one row.
5. Portfolio value chart, 8 cols, about 340px. Holdings allocation donut, 4 cols, about 400px.
6. Gainers & losers bar chart, 12 cols, about 340px.

Above a 1000px fold: the header tiles, the search and the whole table. That is good.

Phone, page 3258px tall: Positions 525, Sectors 436, Concentration 241, Currency 219, Portfolio value 399, Holdings allocation 417, Gainers & losers 357. The table is first, then four allocation views.

### Critique

**Blocker**
- None that block use, but the "Portfolio value" chart ends in a cliff to a low value (a withdrawal or a re-based series reads as a crash). The line makes the book look like it lost about 40% in a day, with no note. It needs the same "cash moved" treatment as the dashboard.

**Major**
- Four cards describe how the book is split: Sectors donut, Concentration, Currency, Holdings allocation donut. Both donuts show weights already in the table's Weight column. The Dashboard has a fifth and sixth take on the same split. Collapse them to one "How it is split" card with a sector bar and one sentence on the cap.
- Gainers & losers repeats the table's Return column. Dashboard Movers repeats it again. The chart earns its place only if sorted and read at a glance, and a 6-row table sort does the same.
- Header tiles repeat the top-bar chips and the dashboard hero. "Total net worth" here is the same figure as the Dashboard hero; "Bank balance" is not a portfolio fact. A positions page should open with the portfolio value and P/L only.
- The table has 12 columns at 1500px (Instrument, Qty, Avg cost, Last, Today, Value, Return, P/L, Weight, Verdict, Fund shares, Fund change, Congress). Too many for a "stupid simple" page. Avg cost and Last are in the instrument's currency while the others are in euros; the mix needs a column unit. Verdict pills ("Hold · still cheap", "Sell (review)") are coded pills with shades the user already rejected elsewhere; "Fund change", "Congress" ("4 ↑ / 7 ↓") need explaining.
- The weight bar tick for the 15% cap and its footnote ("The tick on each weight bar is your 15% cap.") is the explanation the user dislikes. Amber and white bars encode two things at once.
- "Derived" badge and the "Saxo · 6 positions" amber dot: no stated meaning in the card, and the time (18:56) has no label.
- "Concentration" card: two tiles plus a sentence with a hypothetical amount. The tile sub-labels (tickers) repeat the table.

**Minor**
- Three cards in one row have unequal heights (420, 230, 190), leaving large blanks under Concentration and Currency (y 1020-1210 at 1500px).
- Donut chart legends are different: Sectors has a legend with euro values and %, Holdings allocation has outside labels and logos. The same chart type is drawn two ways.
- Card context rows: "Share of positions value", "Against your 15% cap", "What the book is priced in", "Investment value over time", "Top 5 by value", "Unrealised P/L % per holding". They are descriptions, not sources.
- The Currency card shows a "Saxo cash" row in a card about positions; the label "USD 6 positions" shows a euro value without a unit mix.
- Titles: "Portfolio value" here and "Net worth" on the Dashboard and in header; Dashboard's "Allocation" vs Portfolio's "Holdings allocation" and "Sectors".
- Gainers & losers axis labels use 3 different tick spacings (-60, -40, -20, 0, 20) and the chart is 340px of mostly empty space.

Phone: the table scrolls horizontally (check `Th hideBelow`) but the four split cards take about 1,100px of scroll before the value chart.

### Target hierarchy

Lead with the holdings table, trimmed to what a long-term holder reads: Instrument, Value, Today, Return, Weight and one plain-word action column (Hold, Add, Trim, Review; no coloured pills with a "still cheap" suffix). Fund shares, Fund change and Congress move into a "More" column group that opens on demand, or to the Research Funds tab. Header tiles shrink to two (portfolio value + since purchase, P/L). One "How it is split" card (sector bar, currency in one line, cap in one sentence) replaces Sectors, Concentration, Currency and Holdings allocation. The value chart stays, with a note when cash moved. Gainers & losers goes.

```
Desktop (1500)
+--------------------+---------------------+
| Portfolio value    | P/L since purchase  |   [Positions|Transactions]
+--------------------+---------------------+
| search  [All|Stocks|ETFs]                |
+------------------------------------------+
| Holdings table: Instrument Value Today   |
|   Return Weight Action        [More v]   |
+-----------------------------+------------+
| Portfolio value chart       | How it is  |
|                             | split      |
+-----------------------------+------------+

Phone (390)
[ value + P/L tiles ]
[ search + filter   ]
[ holdings as rows: ticker, value, return, action ]
[ How it is split ]
[ value chart     ]
```
Phone goes from 3258px to about 1900px.

### Small fixes
- `Portfolio.jsx:87` — change context "Top 5 by value" and title to match the single split card.
- `Portfolio.jsx:130-142` — drop the "Bank balance" tile from the positions header.
- `Portfolio.jsx:174-175` — title "Portfolio value" with subtitle "Investment value over time" says the same thing twice; keep one.
- `Portfolio.jsx` (row of Sectors, Concentration, Currency) — set `items-stretch` or one shared height so the row has no blank space.
- Remove the "Derived" tag and give the time a label ("Updated 18:56"), or drop the time.
- Put the unit in the Avg cost and Last column headers ("Last (USD)").

## 3. Analytics `/analytics`

Main question: "Am I beating the market, and how risky is my book?"

Desktop, page 1206px tall, about 1.2 folds. Reading order:
1. Return and risk card, 3 metric tiles plus the S&P 500 / NASDAQ 100 / World Index segmented control, about 190px.
2. Caveat bar ("Based on 38 days of your own history ..."), about 45px.
3. Tab list: Performance, Risk, Projection.
4. Returns vs World Index table, 6 cols, about 470px. Calendar-year returns bar chart, 6 cols, about 330px, leaving a blank under it.
5. Return attribution, 12 cols, about 310px.

Phone, page 1897px tall: Return and risk 339, Returns vs 470, Calendar-year 353, Return attribution 357.

### Critique

**Major**
- The page opens with tiles that mostly say "no data yet". "Avg return" is a dash with "needs 297 more days", and the returns table has 5 of 7 rows full of dashes plus "needs N more days" lines. After 38 days, the honest page is short: one headline that says there is not enough history, and the few real figures. Today the empty rows take about 60% of the table.
- The first tile is empty, the key answer ("Am I beating the index?") is not stated anywhere. The result sits in the lowest row of the table ("Since inception", alpha in red) and in the calendar chart. Put one sentence at the top: "Behind the World Index by x points since you started."
- Three signals of low trust stack up: the amber dot in the context row, the caveat bar and the "needs N days" text. It says the same thing three times. The context row's "Daily portfolio value · computed from your own history · vs World Index" is a data-source sentence in the place of a context.
- The benchmark control sits at the top of the first card but also drives the table and chart below it. The calendar chart legend ("You / World Index") does not follow the selected benchmark name.
- Return attribution: bars with "+1.7% pp" (a redundant "% pp") and a second column of shares ("-25%", "40%", "126%") that has no header. Shares of a negative total flip sign and exceed 100%, which reads as an error. The footnote then says "MSFT alone produced -25% of the total gain", which is a sentence that cannot be right when the total is a loss.
- Calendar-year returns: for a 68-day history the chart draws 2024 and 2025 bars for the benchmark only, plus a 2026* bar. The "You" bars are invisible for two years. A year chart for a book that is months old does not earn its place.
- Tabs Risk and Projection hide behind a tab strip; the first tab already holds what a beginner needs. The Risk tab card is titled "Risk & return" (`Analytics.jsx:135`) while the header card is titled "Return and risk" (`Analytics.jsx:239`), so the same words reversed on one page.

**Minor**
- Number formats differ in one table: `-15.6%` with a hyphen, `-0.5%`, `+1.8%`, alpha as a red pill `-15.1%`, shown beside plain red text. The minus sign is a hyphen in places and a true minus in others.
- Pills for alpha (red background) are the coded pills the user rejected.
- Calendar chart is 330px while the table beside it is 470px, so the right column has blank space.
- The caveat bar uses a different surface from `Card` (no title, no context row).
- Loading state is `ChartPlaceholder` "Loading…" in a bare Card (`Analytics.jsx:43`), unlike the Dashboard skeleton.
- Error state at `Analytics.jsx:222` keeps the title but replaces tiles with the placeholder; fine, but it is the third different empty-state style on the page.

Phone: the benchmark segmented control (3 options) plus the tiles stack to 339px before any answer. The returns table keeps all 4 columns, narrow, with the "needs N more days" lines wrapping under the dash.

### Target hierarchy

One answer card first: a sentence ("Behind / ahead of the World Index by x points since you started, over N days"), the benchmark selector as a small control on the card, and 2 numbers (your return, the index's). Under it, only periods that have data (collapse the rest to one line "Longer periods appear after N more days"). Volatility and max drawdown move to a single "Risk" row below. Attribution stays, with one column ("Contribution, points") and the share column removed. Calendar-year chart appears only once the book has two full years. The tab strip goes while there are fewer than 3 periods to show.

```
Desktop (1500)
+------------------------------------------------+
| Behind/ahead of [World Index v] by x pts, N days|
| You x%   Index y%      (low history note: 1 line)|
+-----------------------+------------------------+
| Periods with data     | Risk: volatility,       |
| (1m, since start)     | max drawdown            |
+-----------------------+------------------------+
| Return attribution (one column)                 |
+------------------------------------------------+

Phone (390)
[ answer sentence + 2 numbers ]
[ periods with data ]
[ risk row ]
[ attribution ]
```
Page goes from 1206px to about 800px on desktop and 1897px to about 1100px on phone.

### Small fixes
- `Analytics.jsx:135` and `:239` — use one title for the same card ("Return and risk"), not two word orders.
- `Analytics.jsx` attribution rows — "+1.7% pp" becomes "+1.7 pts"; add a header to the second column or remove it.
- `Analytics.jsx` attribution footnote — do not print a "gain" sentence when the total is negative.
- `lib/portfolioStats.js` `needsDaysNote` — return one summary line instead of one per row.
- Replace hyphen-minus with the same minus format `fmtPct` uses everywhere in this table and the tiles.
- Alpha cell: plain coloured text with ▲▼ instead of a red pill.
- Calendar chart legend label should read the selected benchmark's name.

## 4. Cross-page inconsistencies
- The same total appears under four names: "Net worth" (Dashboard card, top-bar chip), "Total net worth" (Portfolio tile), "Portfolio" / "Investment portfolio" / "Portfolio value" for the investment part, with one figure labelled three ways.
- Allocation: Dashboard "Allocation" (colour bar and legend), Portfolio "Sectors" (donut with legend), "Holdings allocation" (donut with outside labels). Three chart forms for the same split, one with 6 slices and one with "Top 5".
- Concentration: Dashboard "Top 3: 68% · HHI 0.20", Portfolio "Largest / Top 3" tiles, "This week" lines. Same facts, three formats.
- Gainers and losers: Dashboard "Movers" (Gainers / Losers lists), Portfolio "Gainers & losers" bar chart, Analytics "Return attribution" bars. Same content in three chart styles.
- Benchmark: Dashboard "Vs the US 500" uses the S&P 500 only, Analytics defaults to the World Index. The two pages give different "edge" figures for the same book and the Dashboard card does not say which benchmark differs.
- Empty history: Dashboard shows a huge percentage on a near-zero base, Analytics says "needs N more days" per row. Two ways to handle immature history, one of them wrong.
- Minus and percent formats: `<amount>` red, `-6.82%` with ▼, `-15.6%` in a table, `-15.1%` in a pill, `+1.7% pp`. Move arrows are used in some cells and not others.
- Currency formats in one row: `<amount>` beside `<amount>`, with no per-column unit.
- Context rows describe data in some cards and name a source in others; the status dot colours mean different things.
- "View all →" / "Analytics →" links differ in style and place between cards.
- Verdict pills on Portfolio ("Hold · still cheap") and cap/bar colours need explaining; the user asked for plain words and answer-first.
