# UX audit B: Discover, Discover shelf, Earnings, Boards

Captures (prefix `uxb-`, in the tmp directory): `uxb-{discover,shelf,earnings,boards}-{1500,390}.png`, `-fold.png`, `.txt`. Script: `uxb-cap.mjs`, `uxb-cap2.mjs`. I did not run the full ux-measure checks (contrast, type sizes). Block heights are rough, taken from the full-page captures. The shelf used is `/discover/profitable-below-200d`.

Note: full-page phone captures show the fixed bottom nav floating mid-page. That is a capture artefact, not a bug.

---
## 1. Discover (`/discover`)

### Hierarchy today
Main question: what looks interesting in the index universe right now?

Desktop (page 2681px tall, about 2.7 folds):
1. Control card, about 120px. Contains scan status ("S&P 500 ∪ Nasdaq-100 · Updated 19 h ago"), a Refresh button, nine lens chips with counts, and a Cards/Compact toggle.
2. Nine shelves in four groups (Price action, Fundamentals, Events). Each is a card of about 190px, a title, a one-line rule description, "See all N" and 4 to 6 stock cards of about 110px each with a sparkline.
3. Above the 1000px fold: the control card plus 3 shelves, all Price action. Fundamentals and Events are not visible until the second screen.

Phone (3285px tall):
- A control card of about 200px. The nine chips wrap to 5 rows and take about 130px.
- Shelves, each a horizontal strip showing about 1.5 cards. Each shelf is 190 to 230px tall.
- The top bar title truncates to "Disco…".

### Critique
**Major**
- No answer first. 9 shelves × 4 to 6 cards give about 50 stock cards, none ranked against the others. It is a screener catalogue, not a recommendation. The page already holds the verdict engine's output (Buy, Add, Wait, and so on), but Discover never uses it. `pages/Discover.jsx:117-139`.
- Duplicated names. The same stock shows on several shelves (one large-cap appears on 4 of 9 in the capture; several names repeat across Oversold, Profitable & below 200d and EPS growth). The user sees the same card repeatedly and cannot tell which listing is the better idea.
- The lens chips (`components/discover/LensChips.jsx`) restate each shelf title and count, 100px above the shelf. On phone they cost about 130px before any content. They are a table of contents for a page that already scrolls briefly. They also do not say what tapping does (scroll? filter?).
- The cards carry a different metric per shelf (RSI, vs 200D + From high, ROE/Margin/EPS 5Y, P/E, Yield/Payout/D/E, EPS 5Y/Rev 5Y/Margin, Reports date). That is jargon and abbreviation ("EPS 5Y", "D/E", "RVOL", "vs 200D") the user has said they do not want explained. No card shows what to do.

**Minor**
- Four shelves lead with technical-indicator names (Oversold, Overbought, Above 50- & 200-day averages, Unusual volume). Overbought (30 stocks) and Above averages (196) are not actionable for a long-term buyer; Oversold (4) and Unusual volume (5) are rarely more than noise. Several of the "Overbought" stocks show tiny moves, so the shelf does not earn the top slot.
- Shelf subtitles ("RSI 14 ≤ 30 ⓘ") are in 3 different styles: raw rule, prose, and prose with maths ("ROE ≥ 15% · Net margin ≥ 10% · 5-year EPS growth > 0% · …"). Wrapping to 3 lines on phone (`DiscoverShelf` header).
- Price format on cards, `<amount>`, is a different style from the portfolio header's `<amount>`. The sparkline has a "3M" label on every card (about 20 labels the user does not need).
- Percent change colours: a flat 0.00% shows in grey with no arrow, others have ▲/▼ plus colour. Fine, but the star (watch) icon is a 20px target on a 110px card.
- Group labels ("Price action", "Fundamentals", "Events") are 11px muted text with no rule; they read as stray captions, and the gap before them is larger than between shelves.
- 81 interactive targets under 32px on desktop (21 on phone). On phone the star, "See all" and chips are the worst offenders.
- The Cards/Compact toggle (`Discover.jsx:120`) is a view preference on a page where there is no view that is clearly better; it adds a control to the top card.

### Recommended target hierarchy
Lead with a single "worth a look" list drawn from the verdict, and demote the rest to a collapsed "Browse by rule" section.

Desktop:
```
+--------------------------------------------------------------+
| Updated 19h ago                                   [Refresh]  |
+--------------------------------------------------------------+
| Worth a look today                                           |
| [Strong + cheap]  card  card  card  card  card  card         |
|  one line each: "Strong business, price below its usual."    |
+--------------------------------------------------------------+
| Browse by idea (tabs, one shelf shown at a time)             |
| Cheap | Growing | Pays dividend | Reports soon | Price moves |
|  card card card card card card   [See all N]                 |
+--------------------------------------------------------------+
```
Phone:
```
Updated 19h ago  [Refresh]
Worth a look today
 [card][card]  (horizontal)
Browse: [Cheap v]  (select)
 [card][card]
 See all
```
What goes: the lens chip row, the Cards/Compact toggle, per-card sparkline labels. Move Overbought, Above averages and Unusual volume into one "Price moves" tab. Rename shelves in plain words (for example "Cheap for what they earn", "Growing steadily"). Stocks already shown in "Worth a look" are not repeated in other tabs.

### Small fixes
- `components/discover/LensChips.jsx:3` — hide below `sm` (the shelves follow directly) or make it a horizontal scroll row.
- `pages/Discover.jsx:120` — drop `ViewToggle` or hide it on phone.
- Sparkline "3M" label — render once per shelf header, not on every card (`components/discover/DiscoverCard.jsx`).
- Top bar page title on phone truncates ("Disco…", "Earni…"): allow the title to shrink the search and amount pills, or abbreviate to an icon-only search. (`components/TopBar.jsx`)
- Make the star and "See all" at least 32px tall on phone.

---
## 1b. Discover shelf (`/discover/profitable-below-200d`)

### Hierarchy today
Main question: which of these 67 stocks should I look at?

Desktop (3429px): back link, header card (rule, count, sort order, updated) of about 130px with the sector chips, then a 67-row table, each row about 27px: stock, sector, 3-month sparkline, last, 1 day, "Why it is here" text, chart icon, star. The first screen shows about 25 rows.

Phone (4223px): header card about 360px (the sector chips alone take 5 rows), then the table with Stock, Last, 1 day and a clipped fourth column "Why it is h…". The document measures 432px of sideways overflow at 390 wide.

### Critique
**Blocker (phone)**
- Page-level sideways scroll of 432px at 390px (measured: `scrollWidth - clientWidth`). The table sits in an `overflow-x-auto` wrapper (`pages/DiscoverShelf.jsx:101-102`) but something above it, probably the header card or the unwrapped rule line ("67 stocks · ROE ≥ 15% · Net margin ≥ 10% · 5-y…" is clipped), is wider than the viewport. The "Why it is here" column is the one that carries the meaning, and it is the one cut off.

**Major**
- The ordering is by market size ("Ordered by market cap, highest first"), not by how good the setup is. The top of the list is the 5 biggest companies, which says nothing about why they are here. The verdict engine could order by the verdict.
- No verdict column: the table repeats the Discover cards' jargon ("ROE 110% · Margin 64% · EPS 5Y +95.3% · vs 200D -20.2%") in a 10px muted string. Every row has the same four metrics, so the row says nothing a header could not say once.
- Two share classes of one company (GOOG, GOOGL) appear as separate rows; the same company twice in a 67-row list.
- Sector chips: 11 chips, 5 rows on phone, about 140px of chips before data.

**Minor**
- 214 targets under 32px on desktop (row icons, star, chart icon at 16px, no labels, `aria-label` only).
- The sparkline column is 3 months of red for almost every row (the shelf is "below 200-day average"), so it carries no discrimination.
- Same up/down arrows but 1-day moves have a different colour weight from the Discover cards.
- "Updated 19 h ago" is at the far right of the header and detached from the title.

### Recommended target
Desktop:
```
< Discover
Cheap, good businesses   67 stocks     Updated 19h ago
[All sectors v]  sort: [Verdict v]
Stock        Verdict         Price   1 day   Why      * 
NVDA Nvidia  Strong, cheap   ...     ...     "Profit 64%, price 20% under its 200-day"
```
Phone:
```
< Discover
Cheap, good businesses
67 stocks · [All sectors v]
NVDA  Strong, cheap     <amount>  -2.0%  >
```
One "Why" sentence replaces the metrics string; the rule definition goes behind an info toggle. Sector chips become one select.

### Small fixes
- `pages/DiscoverShelf.jsx:101` — wrap the Card in `min-w-0` and make the rule line `truncate` or wrap, so the document does not overflow.
- `pages/DiscoverShelf.jsx:106-107` — keep Stock, Last and 1 day on phone and put the "why" under the stock name instead of a fourth column.
- Sector chips: replace with a `<select>` below `md`.
- Collapse GOOG/GOOGL (same `name` root) into one row or label the class.

---
## 2. Earnings (`/earnings`)

### Hierarchy today
Main question: who reports this week, especially my holdings?

Desktop (4981px, about 5 folds):
1. Week navigation plus All/Mine toggle, about 40px.
2. "Your week" card, about 70px. In the capture it reads "None of yours report this week." (the owner holds nothing reporting) and it still takes full width.
3. "Market week" grid card, about 230px: 5 day columns × 3 session rows (Before open, After close, During hours/time not set) of logo dots, each cell with a "+22 more" overflow and a count badge.
4. "84 reporting · Monday" day list, about 4400px: a 84-row table (Company, Mkt cap, Qtr, EPS est, Revenue, Move, chevron), grouped by session.

Phone (4716px): day strip (Mon to Fri with counts), "Your week" card, then the same day list with 3 columns (Company, EPS est, Move). The Market week grid is hidden below md.

### Critique
**Major**
- The page is portfolio first by decision, but the answer slot is wasted when empty: "None of yours report this week" occupies a full card and the whole first screen is filler. When it is empty it should be one line, or the card should show "Next report of yours: <date>" (the data has `next_mine`).
- 84 rows of obscure tickers is the bulk of the page. Most rows have no market cap ("—"), no move ("—"), and tiny revenues ("<1Me", "0Me"). Rows that are all dashes do not earn their place. About 60 of the 84 Monday rows have no market cap. Nothing separates the notable names from micro-caps. (`components/earnings` DayList.)
- Number formats mix: market cap "110.368" and "20.348" with no unit (looks like billions, unlabelled); revenue "117.138b", "14.318b", "5.298b", "<1Me", "0Me" with a trailing "e" and an unusual "Me"; EPS "19.21e", "−0.91e" (negative sign is a true minus, good, but "e" suffix is unexplained). The column is headed "EPS · est". Three different unit styles in one table.
- Quarter column says "Q3 2026" for companies in Q4 2026 and "Q1 2027" — fiscal labels with no hint, the user reading "Q2 2027" on a day in Nov 2026 will think it is wrong.
- "During hours / time not set" merges two different things.

**Minor**
- Selected day: the Mon cell is outlined, but the heading below says "Monday" and "84 reporting" while the grid header says "218 reporting" with a different noun ("Market week"). The two counts sit one card apart with no link.
- "Move" is almost all "—" because the nightly scan only gives it to universe names, and it is a column every row pays for.
- The weekly grid's 15 tiny logo dots per cell cannot be identified without hover; "+22 more" is a 10px grey link.
- Week label "16 – 22 Nov 2026" is the only orientation; the "Today" button only shows when week ≠ 0, fine. The prev/next buttons are 24px on desktop (`NAV_BUTTON`).
- Loading state is a plain "Loading…" card (`Earnings.jsx:89-93`), where Discover uses skeletons.
- 24 interactive targets under 32px on desktop, 3 on phone.
- On phone the day strip's counts ("84", "47", "50") are tiny 10px figures; the whole row list has no sticky day header so after scrolling 4000px you do not know which day it is.

### Recommended target hierarchy
Desktop:
```
< 16 - 22 Nov >                               [All | Mine]
+--------------------------------------------------------+
| Your week: 2 reports  (or: "Nothing of yours this      |
|  week. Next: <name>, <date>")      one row per holding |
+--------------------------------------------------------+
| Mon 84 | Tue 47 | Wed 50 | Thu 31 | Fri 6   (day strip, |
|  replaces the Market week grid)                         |
+--------------------------------------------------------+
| Monday: big names first (cap > threshold)   [20 rows]  |
|   Company   Cap   When   EPS est   Revenue est  Move    |
|  [Show 64 smaller companies]                            |
+--------------------------------------------------------+
```
Phone:
```
< 16 - 22 Nov >   [All|Mine]
Your week: none. Next: <date>
Mon Tue Wed Thu Fri (strip)
Monday - 84 reporting
 Company    EPS est   Move
 ...(20 rows) [Show 64 smaller]
```
What goes: the Market week grid (the day strip does its job on desktop too); the whole micro-cap tail collapses behind one button. Rows sort by market cap within a session. One count per day, one number format.

### Small fixes
- `pages/Earnings.jsx:103` — render a one-line empty state when there are no held reports; show `next_mine`.
- `pages/Earnings.jsx:105` — drop `hidden md:block`/the grid in favour of the day strip, or at least do not render it when stats are absent.
- `pages/Earnings.jsx:89-93` — use the Skeleton used by Discover instead of a bare "Loading…" card.
- Market cap column: add a unit ("B"), same style as revenue; drop the "e" suffix and "Me" for revenue ("12M", "<1M").
- `NAV_BUTTON` (`Earnings.jsx:69`): 32px minimum on desktop.
- DayList: sticky day header on phone.

---
## 3. Boards (`/boards?symbol=AAPL`)

### Hierarchy today
Main question: what is this chart doing, and what else do I follow?

Desktop (1014px tall, the whole page is one screen, the panels scroll inside):
1. Top bar, then board tabs (Chart, Morning check, Semiconductors, + New board), 40px.
2. Left tool rail (crosshair, line, text, indicators, and so on), 48px wide.
3. Symbol header (logo, ticker, "Held" tag, price, move, "In 1 list"), 66px.
4. Range buttons (1W to ALL), indicator toggles (MA 20, MA 50, RSI), a "Saxo connected" badge at right, 36px.
5. Candles plus volume, about 740px. Annotations: two "E" earnings badges.
6. Right rail: All/Stocks/ETFs tabs, "Search any stock or ETF…", watchlist (dropdown "Open positions", 6 rows, list/grid toggle, second search "Search symbol to add") and the symbol panel (next earnings, volume, average volume, market cap, Performance with 6 tiles, Earnings…), which scrolls inside a box.

Phone (1026px): board tabs, tool row, symbol header (about 190px), ranges and indicators, chart. The watchlist and symbol panel are not reachable on this page at 390 in the capture.

### Critique
**Major**
- Two search boxes in the right rail: "Search any stock or ETF…" and "Search symbol to add" (about 36px each, 100px apart), and a third one in the top bar (⌘K). Three ways to type a symbol, with two different meanings.
- The page's first element in the rail is an All/Stocks/ETFs tab and the search, before the list, and the watchlist box is cropped at about 5 rows (the sixth is cut mid-row, "AMZN" visible half) while the symbol panel below is also cut mid-section ("Earnings" heading cropped at the bottom edge). Two nested scroll areas with cut-off content read as broken.
- The watchlist's action badges ("Sell (review)", "Hold · still cheap", "Hold") sit under the ticker and push each row to 44px, but they are the only place the verdict shows on this page; the chart header does not show the verdict for the active symbol (Research has the answer sentence). The page answers "what is it doing" but not "what should I do".
- The symbol panel repeats Research's overview (Next earnings, Volume, Average volume, Market cap, Performance, Earnings), and the chart header repeats the price and move. "Volume" appears in the OHLC strip, the volume pane label, and the panel (39.1M three times). Performance tiles (1W to 1Y) duplicate the range buttons' meaning. Per the user's approved merge direction, these duplicates should merge into one place.
- Performance tiles at 1500px wide are clipped: "19.21%", "31.05%" and "16.71%" run to the tile edge (the big figure at 22px overflows its 80px tile), a visible defect.

**Minor**
- "Saxo connected" is a green status badge in the toolbar on every visit; when connected it is noise. Show it only when it is not.
- Indicator toggles MA 20, MA 50 have outlines, RSI does not, with inconsistent "on" styling between the three (RSI looks disabled).
- Header "In 1 list" with a chevron: a dropdown naming a watchlist count is cryptic.
- The "Period ▲ +20.85%" label top right of the chart is separate from the symbol header's "+0.39% latest session": two percentages, two periods, same colour.
- OHLC strip in 11px muted text, the MA values in orange and blue that match the lines; fine, but on phone it wraps to 3 lines and eats 60px of chart.
- Phone: two rows of controls (tool rail, then range, then indicators) take about 170px above the chart, and the symbol header is 190px with "In 1 list" on its own row. The chart starts at about y=450 of a 844 viewport.
- Left rail icons have no labels or tooltips visible; the bottom icon (collapse) is a mystery.
- Board tabs: "Morning check", "Semiconductors" are user boards; "Chart" is the workspace. Not explained, fine, but the horizontal scroll on phone cuts the third tab ("Semiconductors" runs to the edge, "New board" invisible).

### Recommended target hierarchy
Keep the chart as the answer, move the verdict beside it and drop the rest of the panel.

Desktop:
```
[Chart] [Morning check] [Semis] [+]
+---------------------------------------------+ +--------------+
| AAPL Held  356.27 +0.39%   Strong · Hold    | | Watchlist    |
| 1W 1M 3M 6M 1Y ALL   MA20 MA50 RSI          | |  search  [+] |
|                                             | |  row (verdict|
|              candles + volume               | |   as small   |
|                                             | |   text)      |
|                                             | |  ...         |
+---------------------------------------------+ | Next report  |
                                                | In 73 days   |
                                                | Open in      |
                                                |  Research >  |
                                                +--------------+
```
Phone:
```
Boards: [Chart v]
AAPL Held 356.27 +0.39%  Hold
1W 1M 3M 6M 1Y ALL   [Indicators v]
candles + volume
Watchlist (collapsed, 6)  >
```
What goes: the second search (one search for add and open), the "Saxo connected" badge when connected, the Performance tiles (the range buttons already show those periods) and Volume/Average volume duplicates. What moves: the verdict to the symbol header; "Next earnings" stays as a single line. One scroll area on the rail.

### Small fixes
- Performance tiles (Boards symbol panel, `components/boards/`): reduce the figure size or use `text-[15px]` so 5-character percentages fit an 80px tile.
- `pages/Boards.jsx` — hide the "Saxo connected" badge when `connected` is true.
- Show the verdict tag from the watchlist (already fetched) in the symbol header.
- Make the RSI toggle look the same as MA 20 / MA 50 (outlined when off).
- Phone: put "In 1 list" on the same row as the price.
- Phone: add a way to reach the watchlist and symbol panel (a collapsed section under the chart).

---
## Cross-page inconsistencies
- Currency format: stock prices `<amount>` (Discover, Boards watchlist shows bare `115.88`); portfolio totals `<amount>`. The Boards watchlist's "Last" has no currency while Discover's price does.
- Large-number units: Earnings market cap with no unit, revenue "117.138b" / "5.1Me", Boards market cap "5.18T", volume "39.10M". Three schemes.
- Empty/loading: Discover uses skeletons, Earnings uses a bare "Loading…" card, Boards shows the chart frame empty.
- Page title: `h1` is `sr-only` on Discover and Earnings (and the phone top bar truncates the page name to "Disco…" and "Earni…"), while Boards shows its name in the top bar untruncated; there is no visible page heading on any of the three at 1500.
- Verdict wording appears in the Boards watchlist ("Sell (review)", "Hold · still cheap") and never on Discover or Earnings, where it would help more.
- Stock cards on Discover, rows on the shelf and rows on Earnings each draw a stock differently (card with sparkline; row with sector and sparkline; row with logo only). Same stock, three layouts, three different "tap" targets (Discover card goes to the chart or research? Earnings goes to Research earnings tab).
- Tiny tap targets (under 32px) on all three pages: 81 / 214 / 24 / 25 at 1500px.
- Duplicated metric names with differing wording: "vs 200D", "From high", "EPS 5Y" on Discover versus "EPS vs estimate", "Average volume (30D)" on Boards.
