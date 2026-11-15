# UX audit C: Investors (hub, stocks, profile, Congress member)

Captures in tmp/ with prefix `uxc-` (`uxc-<page>-<1500|390>.png`, `-fold.png`, `.report.txt`, `uxc-c-*.png` crops). Pages: hub `/investors` (plus its Congress tab `/investors?tab=congress`), `/investors/stocks`, one fund profile, one Congress member. No amounts, names or holdings of the owner are quoted. Public figures (funds, members) are described generically.

## Measurements

| Page | Desktop 1500 total | Phone 390 total | Above a 1000px fold, desktop |
|---|---|---|---|
| Hub, Funds tab | 5,378 | 20,665 | status card, Following, Convergent buys, Most sold, start of Biggest new bets |
| Hub, Congress tab | 8,948 | 43,217 | status card, Most-bought strip, start of member cards |
| Stocks | 1,230 | 1,388 | whole page |
| Profile | 3,098 | 4,930 | header + 5 tiles, What changed, Concentration (start) |
| Congress member | 67,972 | 68,861 | header + 5 tiles, copy chart, estimated holdings, first ~10 trade rows |

No sideways page overflow anywhere. No console errors or failed API calls. Small (<32px high) targets are numerous on all pages (hub 515, member 1,428), mostly table/card links; touch size is mainly a phone concern.

---

## 1. Hub `/investors`

**Main question:** "What are the best investors doing right now, and which of them should I look at?"

### Hierarchy today (desktop / phone heights)
1. Status card "Smart money" + Funds/Congress switch + Add investor: 97 / 139. Context line is a status dot + "N tracked · signals for Q2 · X of N filed · N have filed Q3".
2. Following (cards of followed funds): 280 / 288
3. Convergent buys (6 stock cards): 218 / 226
4. Most sold (6 stock cards): 218 / 226
5. Biggest new bets (6 cards): 237 / 245
6. Just filed (6 fund cards): 280 / 288
7. All investors (chips, search, sort, Cards/Table, 89 cards): 3,826 / 18,840
8. 13F limits note: 36 / 54

### Critique
**Blocker**
- B1. "All investors" is 89 unpaginated cards: 3,826px desktop, 18,840px phone (91% of the phone page). Stocks and profile paginate (`Show more`, PAGE_SIZE); this directory and the Congress one do not. `components/investors/InvestorDirectory.jsx:56,89`, `InvestorCards.jsx`.
- B2. Congress tab: 249 member cards, 8,735px desktop, 42,894px phone, no pagination. `components/congress/CongressDirectory.jsx:81,124`.

**Major**
- M1. Five shelves stacked, each a row of 6 identical-looking cards, before any directory. Convergent buys / Most sold / Biggest new bets are the same card type (logo, ticker, name, a count line, fund avatars, sector) with a different verb. Three shelves say "which stocks the funds moved"; the Stocks page already owns that. On phone each shelf is a horizontal carousel, so the visible content per shelf is 1.5 cards and the page is a long run of identical cards.
- M2. Following sits first, but its context line ("Investors you follow") and title ("Following") say the same thing, and with 2 followed it leaves 70% of its row empty on desktop. Fine functionally, wasteful visually.
- M3. Every card has a two-line header (grey small caption above, big title below). On this page that is "Investors you follow / Following", "Bought by the most tracked funds / Convergent buys", "Sold by the most tracked funds / Most sold", "Largest new positions by weight / Biggest new bets", "Newest 13F filings / Just filed". The caption restates the title five times. This is the app's panel anatomy (DESIGN.md), but here the shelf titles ("Convergent buys", "Biggest new bets") are jargon the caption has to translate; one plain title ("Stocks many funds bought") would do and drop the caption.
- M4. Fund cards are dense: avatar, name, firm, 1-2 style tags (Value, Concentrated, Activist, Macro, Quant, Contrarian, Tech, Growth), value, position count, 3 tiny stock logos, "+9 new · -11 exited", "Q2 2026 · filed 14 Aug 2026". The tags are the "coded pills" the owner rejected; they need explaining and only sometimes differ. The stock-avatar triple (tiny, clipped logos like "JA", "BI BE", "DS") reads as noise.
- M5. Inconsistent card heights/anatomy inside one grid: cards without a second tag or without a firm name vertically shift (Dodge & Cox: title lines up differently from Warren Buffett's card; the star icon floats at different heights). Visible in the All investors grid.
- M6. Header context line is long and numeric ("89 tracked · signals for Q2 2026 · 87 of 89 filed · 7 have filed Q3 2026"). On phone it truncates ("87 of 89 filed...") so the Q3 info is cut.

**Minor**
- m1. Congress tab: the Funds/Congress segmented control lives in the status card, so switching tab keeps a card with only a title and a context line (97px of chrome with nothing in it, `pages/Investors.jsx:48-62`). It has an empty body.
- m2. Congress hub card title is "Congress", context "House members' disclosed stock trades, copied at the midpoint of each reported range": that is method text in the place of the page's one-line answer.
- m3. "Most bought by Congress, last 90 days" is a wrapped chip strip with `2 ↑ / 1 ↓` glyph pairs. The arrows read as trade signals (AGENTS.md says never arrows).
- m4. Congress member cards: "copy edge / yr" next to "+76.5 pts" needs explaining; "No priced holdings" on cards with a big positive edge number is contradictory, since an edge is shown for a member with no priced holdings in one case (the first card without avatars shows an edge plus "No priced holdings").
- m5. "Following" chip and "Following" shelf and filled-star toggle are three controls for one concept.
- m6. Select element for sort is a native `<select>` (visible in 1500 and 390 captures) beside custom segmented controls; Congress sort ("Copy edge") likewise.
- m7. Empty state of the signals when none: `NO_SIGNALS` appears inside the status card (`pages/Investors.jsx:15-20`), so the state is a paragraph under the title and the shelves are absent. Acceptable.

### Recommended target hierarchy (one)
Lead with "what changed for me", then one signals block, then the directory behind a pager.

Desktop
```
[ Smart money  · 87 of 89 filed · [Funds|Congress] [Add investor] ]
[ Following (only if any): compact row of avatars + "N new · M exited"      ]
[ Stocks many funds bought this quarter ]  [ Stocks many funds sold ]   <- two columns, 5 rows each, "See all"
[ Just filed: 6 compact rows (name, date, new/exited)                  ]
[ All investors: chips (Following | Value | Growth ...), search, sort   ]
[ 24 cards, "Show 24 more"                                              ]
```
Phone
```
[ Smart money ]
[ Following: horizontal avatars ]
[ Bought | Sold   <- segmented, one list of 5 rows ]
[ Just filed: 3 rows ]
[ All investors: search + 12 rows, Show more ]
```
Merge Convergent buys + Most sold into one two-column (phone: one segmented) list. Drop Biggest new bets (it is the Stocks page's "New positions" tab; link to it). Keep the directory paginated at 24 on desktop, 12 on phone. Remove the style tags from the cards (keep them as the filter chips only).

### Small fixes
- `frontend/src/components/investors/InvestorDirectory.jsx:56` — slice `visible` with a Show more state (reuse `PAGE_SIZE`/`PAGE_STEP` from `lib/investors`).
- `frontend/src/components/congress/CongressDirectory.jsx:81` — same pagination (249 members).
- `frontend/src/pages/Investors.jsx:48` — move Funds/Congress switch out of the empty Congress status card or give that card its one-line answer instead of method text (`CONGRESS_SUBTITLE`, line 14).
- `frontend/src/lib/investorHub.js:39` — "Opened a 0.0% position" reads wrong for a tiny position; show "Opened a new position" when weight rounds to 0.0%.
- `frontend/src/lib/investorHub.js:41` — "Added 658% more shares" -> "Added about 7x the shares" or cap with "Added 6x+"; same absurd-percent issue noted in memory for ChangeBadge.
- Congress strip arrows (`components/congress/CongressActivity.jsx`) — replace `2 ↑ / 1 ↓` by "2 bought, 1 sold".

---

## 2. Investors stocks `/investors/stocks`

**Main question:** "Which stocks are the tracked funds buying, selling, holding?"

### Hierarchy today
1. Header card: back link + subtitle + quarter select, four tabs (Most bought, Most sold, Most owned, New positions): 131 / 203
2. Table card (15 rows then Show more): 895 / 895
3. "Showing 15 of 200 / Show more": 28
4. Limits note: 36 / 54

Page is 1,230 / 1,388 tall: the best-sized page of the four.

### Critique
**Blocker**
- B1. On phone the table is `min-w-[720px]` inside `overflow-x-auto`, so only "Stock" and "Owners" show and there is no scroll cue (`pages/InvestorStocks.jsx:53-54`). The tab is "Most bought" yet the Bought column, the one the list is sorted on, is off screen; the visible Owners column is unsorted (40, 13, 16 below 15 and 12), so the order looks broken. Sold, New, Held value, Funds, Congress all invisible.

**Major**
- M1. Six numeric columns (Owners, Bought, Sold, New, Held value, Congress) for a "keep it simple" user: Bought/Sold/New/Owners mix. The sorted column is not highlighted on any tab.
- M2. Congress column uses `1 ↑ / 1 ↓` and `4 holding`, which are two vocabularies in one column; dash for none. Arrows again.
- M3. Funds column: 5 overlapping avatars, many unreadable (clipped 2-letter logos). It answers "who" without names; hover/focus is the only way to know.
- M4. Heading hierarchy: "Stocks" (card title) then tabs, then a second card whose title repeats the active tab ("Most bought · Q2 2026") with a caption "200 stocks · counted by fund". Tab -> card title duplication; the caption is the only new info.
- M5. Only 15 rows visible by default of 200; "Show more" is bottom-left/right in a separate strip from the card (`:89`), unlike other lists in the app.

**Minor**
- m1. Header subtitle truncates on phone ("What the tracked investors own, b...").
- m2. Quarter select is a native `<select>` on both widths, the only one in that card; on phone it wraps under the title, leaving the tab bar wrapping to two lines ("New positions" alone on line 2).
- m3. Ticker/name cells show company name in uppercase for some (SPACE EXPLORATION TECHN CORP) and title case for others (Amazon.Com, Meta Platforms, Inc.): data-source casing leaks (also seen on the hub shelves).
- m4. `GOOG` and `GOOGL` appear as two rows with identical names.

### Recommended target
One line per stock: logo, ticker/name, the tab's own metric as the headline number, and a single plain sentence ("19 funds bought, 1 new"). Everything else in a row expansion.

Desktop
```
[ <- Investors   Stocks      Bought | Sold | Owned | New        Q2 2026 v ]
[ Stock            Funds bought  Funds sold  Held value   Congress        ]  <- sorted column bold
[ ... 15 rows ...                                                         ]
```
Phone
```
[ <- Investors  Stocks    Q2 2026 v ]
[ Bought | Sold | Owned | New        ]  (scrolls, one line)
[ AMZN  Amazon          19 bought   ]
[ ...                                ]
```
Phone shows Stock + the active tab's metric only (not the unrelated Owners column), with the other figures in the row's detail line ("37 own · 5 new").

### Small fixes
- `frontend/src/pages/InvestorStocks.jsx:58-65` — add `hideBelow="md"` to Sold/New/Held value and render the sorted metric (Bought/Sold/Owners/New by `view`) as the one phone column; drop Owners from the phone.
- `frontend/src/pages/InvestorStocks.jsx:53` — remove `min-w-[720px]` once columns hide below md, or add a fade edge so the scroll is discoverable.
- `frontend/src/pages/InvestorStocks.jsx:52` — title `Most bought · Q2 2026` duplicates the active tab; show the quarter in the header select only and use the card caption for "200 stocks".
- Normalise the stock-name casing in the API/mapper (`InvestorStocks` row name).

---

## 3. Investor profile `/investors/:slug`

**Main question:** "Is this investor worth following, and what did they just do?" (and for this user: "would copying them have paid?")

### Hierarchy today (desktop / phone)
1. Header card: back + filed line + quarter select + Follow; avatar, name, firm, style tags, one-line bio, photo credit, five tiles (Reported value, Positions, Top 5 / top 10, This quarter, You hold today): 304 / 651
2. What changed (New, Added, Show all N + footnote): about 590 (left column 5/12) / ~600
3. Concentration (Top 10 holdings Grid|Donut|List, "Remaining 19 positions", Sectors bars, footnote): about 1,020 (right 7/12) / ~1,300
4. If you had copied X (4 tiles, chart, legend, method note): about 460 / ~700
5. All holdings (filters, search, 15-row table, Show more): about 1,000 / ~1,500
6. Limits note: 36 / 54

### Critique
**Major**
- M1. The answer to "is it worth it" (copy performance: copy vs the S&P) is the fourth block, below the fold and below two panels, while the top shows "reported value" and concentration. For this owner it is the headline; it should lead (the member page already puts it first: copy tile row in the header).
- M2. Duplication: Top 10 holdings grid (22.0%, 17.1% ... with "You own", "Added 45%", "Trimmed 6%") then the All holdings table repeats the same 10 first rows with the same weight, value, change, "You own". The Concentration panel's Grid/Donut/List switch is a third view of the same list. One list with a weight bar is enough.
- M3. What changed repeats information in the grid ("Added 45%" badge) and the table ("Added 45%" badge) and the list ("Added 45% more shares"): three places say the same fact about the same ticker.
- M4. Five stat tiles repeat each other: "Positions 29" appears with "Top 5 / top 10 68.7% / 88.5%" and again as "Showing 15 of 29"; "This quarter +1 / -1" repeats the "New" section and the card on the hub. "Top 5 / top 10 68.7% / 88.5%" is jargon needing explanation. "You hold today: 2 stocks" is the only personal tile and the most relevant for the user, but is last.
- M5. Left column "What changed" is 590px beside a 1,020px "Concentration"; a 430px empty gap sits below it on desktop (visible in `uxc-c-prof-a.png`, region x 24-620, y 920-1350).
- M6. Phone: header takes 651px: 5 tiles in a 2x3 grid with an orphan last tile (Positions text wraps to three lines), before any content. Hold-today tile should be first, others behind.

**Minor**
- m1. "Opened a 0.0% position" (`lib/investorHub.js:39`); "Added 658% more shares" for a stock that went from small to large; LEN.B "now 0.0%".
- m2. "Photo: Wikimedia Commons" sits as a separate 11px line between bio and tiles; fine as credit but visually a stray row.
- m3. Header context line truncates on phone ("13F for Q2 2026 · filed 14 Aug 2...").
- m4. "Held 19q" column: the "q" abbreviation is unexplained; "You" column is empty for most rows (92% blank).
- m5. Sector bars: nine full-width 40px rows for what is a 9-number list; "Other" is the hidden rest; the footnote explains it.
- m6. Segmented control `Grid | Donut | List` is three views for 10 numbers; none needed.
- m7. Tags `Value`, `Concentrated` appear twice in capture (hub card and header) and again as filter chips: coded pills.

### Recommended target
Lead with what the owner would do: follow/copy, then what changed, then the list.

Desktop
```
[ <- Investors   filed 14 Aug   Q2 2026 v   [Following]                      ]
[ avatar Name, firm, bio                                                     ]
[ If you had copied: +x% vs S&P +y% (chart, 1 line of method)   | You hold: 2 of their 29 stocks ]
[ What changed this quarter (new, added, trimmed, sold: 6 rows) | Biggest holdings (10 rows + weight bar, sectors as one stacked bar) ]
[ All holdings (table, 15 rows)  <- merge top-10 into this, drop grid/donut ]
```
Phone
```
[ Name, firm, [Following] ]
[ Copy result: copy vs S&P, 2 numbers ]
[ You hold: 2 of 29 ]
[ What changed: 6 rows, Show all ]
[ Holdings: 10 rows, Show more ]
```
Merge: Concentration grid + All holdings table into one holdings table with the weight bar column (it already has one). Sectors become one stacked bar, collapsed. Drop Donut and Grid. Move copy performance up to row 1. Collapse tiles from 5 to 3 (Reported value, Positions, You hold).

### Small fixes
- `frontend/src/pages/Investor.jsx:111-113` — swap order: `CopyPerformancePanel` before `LatestMoves`/`ConcentrationPanel`.
- `frontend/src/pages/Investor.jsx:111` — set `items-start` is fine but the shorter left card leaves a 430px hole; put `LatestMoves` and the holdings table in the left column.
- `frontend/src/lib/investorHub.js:39` — "Opened a 0.0% position" -> "Opened a new position" when rounded weight is 0.
- `frontend/src/lib/investorHub.js:41` — cap huge percentages ("Added more than 5x").
- `frontend/src/components/investors/HoldingsTab.jsx` / table — rename column "Held" to "Quarters held" or show "19 quarters"; hide the "You" column unless any row is held.
- `frontend/src/components/investors/InvestorHero.jsx` — tile order: put "You hold today" first.

---

## 4. Congress member `/investors/congress/:slug`

**Main question:** "Would copying this member's trades have beaten the market, and what are they holding?"

### Hierarchy today
1. Header card: back + "House periodic transaction reports · Filed ..." + avatar, name, party/state, 5 tiles (Copy, S&P 500, Difference, Per year, Left out) + a 3-line method note: 304 / 566 (phone)
2. If you had copied X (subtitle, chart, legend, note): 490 / ~600; beside it
3. Estimated holdings (12 rows, ticker + weight bar): 680 / ~600
4. Disclosed trades: one table with all 1,443 trades, no pagination: ~66,500 / ~66,500 (phone is a horizontally scrolling 720px table)

### Critique
**Blocker**
- B1. The trades table renders every disclosed trade at once: 67,968px page (45 desktop screens), 8,682 text nodes, 1,428 small links. Most rows are the same ("Sold, Spouse, <amount><amount>, 31 Oct 2025, 21 Nov 2025") repeated dozens of times. `components/congress/TradeHistory.jsx:32` maps all `trades`; there is no `slice`, no Show more, no grouping (Investor profile's HoldingsTab and Stocks both paginate). Hurts load, memory, scroll, and print.
- B2. The same table is a 720px-min table on phone, scroll sideways with no cue, 1,443 rows long; asset names are in the first column, the only column visible is Asset and Trade.

**Major**
- M1. The headline "+120.1% copy vs +19.3% S&P, +100.8 pts, +76.5 pts per year" is shown as the first tile row but the same facts are then repeated in the chart card's own title "If you had copied Lisa McClain" and the method note under the tiles; the tile row says "since 14 Aug 2025" while the method note says "Estimated from 1443 disclosed trades since 2021, priced from Jan 2022". Two time bases, one page, no sentence that says which window the headline covers. A first-time reader cannot tell if +120% is over 1 year or 5 years. (For a member whose clone only covers one year, "per year +76.5 pts" extrapolates; the per-year figure for under a year is flagged null elsewhere in the app, so verify.)
- M2. "Left out: 261 unpriced trades · 265 unseen sales" is a tile of the same weight as the performance tiles, yet it is a data-quality caveat. It also appears again in the method note ("265 sales of holdings not seen bought ignored · 261 trades without a price left out"): a third repeat. Caveat in a tile of equal weight to the result inflates its importance and its jargon ("unseen sales") needs explanation.
- M3. Method text is spread across four places: header note (`CongressMember.jsx:104`), chart subtitle (`COPY_SUBTITLE`, line 18, 2 lines), chart footnote ("Price moves only..."), and the card context. About 9 lines of method for a page whose answer is two numbers.
- M4. "Estimated holdings" is a 12-row table beside a chart: the weights (42.5% / 13.6% ...) are estimates computed by the app, not disclosed facts, yet the card title says "From disclosed trades". The first holding being 42% on one report is a model artefact (range midpoints); no caveat on the card.
- M5. Trades table: "Owner" column ("Spouse" on nearly all rows) and a 3-date structure (Traded, Filed) with a repeated row pattern; the unpriceable assets (private companies, "Saronic Technologies", "xAI") show a 2-letter placeholder logo (SA, AP, XA) in a muted tone, which reads as an error. They are real private holdings the member disclosed; they say nothing about the copy result and deserve either a grouped "Not priced" section or a label.
- M6. Header shows party/state as "House · R-MI08"; the hub card shows "R-MI08 · 1,443 trades". "Left out", "copy edge", "Difference", "Per year", "S&P 500 same days": five different words for one comparison across the hub card and the member page.

**Minor**
- m1. Header status dot + "Filed 12 Oct 2026" truncates on phone ("House periodic transaction repo...").
- m2. Phone: tiles are 2x3 with an orphan "Left out" tile, same issue as the profile.
- m3. Chart date axis labels are sparse and inconsistent on phone ("Dec 25, May 26, Oct 26").
- m4. The chart card ends 190px above the holdings card on desktop, leaving a blank block in the left column (`uxc-c-mem-a.png`, region x 24-990, y 820-1010).
- m5. Amount column is a range ("<amount><amount>") right-aligned with Traded/Filed dates right-aligned beside it: dense and hard to scan; no totals by month.
- m6. "Bought / Sold part / Sold" labels are plain bold black; no tone difference. A buy and a sell look identical in the table.

### Recommended target
Answer first, caveats collapsed, trades condensed and paged.

Desktop
```
[ <- Congress   avatar Name, party/state          Last report: 12 Oct 2026 ]
[ Copying would have returned +x% vs the S&P +y% (since <date>)             ]  <- one sentence + 3 tiles: Copy, S&P, Difference
[ chart (copy vs S&P)                         | Estimated holdings (top 8)  ]
[ How this is estimated  (collapsed: 1 paragraph)                           ]
[ Recent trades: latest 25, filter Bought|Sold, Show more                    ]
```
Phone
```
[ Name, party ]
[ Copy +x%  vs S&P +y% ]   (one tile pair, "since <date>")
[ chart ]
[ Holdings: 6 rows, Show more ]
[ How this is estimated (collapsed) ]
[ Recent trades: 10 rows as 2-line items: ticker + "Bought · $1k<amount>", date ; Show more ]
```
Merge: Left out + header method note + chart subtitle + chart footnote into one collapsed "How this is estimated". Tiles 5 -> 3. Trades: show the newest 25, a Bought/Sold filter, and one row per ticker/day for repeated identical fills.

### Small fixes
- `frontend/src/components/congress/TradeHistory.jsx:32` — slice `trades` with a Show more state (PAGE_SIZE/PAGE_STEP from `lib/investors`) like HoldingsTab.
- `frontend/src/components/congress/TradeHistory.jsx:49-52` — tone the trade label (up colour for Bought, down for Sold) via existing semantic utilities, and say "Not priced" for private assets.
- `frontend/src/pages/CongressMember.jsx:104` + `:18` — one method note; delete the duplicate sentences.
- `frontend/src/pages/CongressMember.jsx:22-25` — remove the `LeftOut` tile from the figures row, fold the counts into the method note.
- `frontend/src/pages/CongressMember.jsx:107-113` — `items-start` leaves a hole under the chart; place the holdings card first and trades full-width below (already), or set equal heights.

---

## 5. Cross-page inconsistencies
1. Pagination: Stocks, profile holdings use Show more (15 at a time, `PAGE_SIZE`); hub Funds directory (89), hub Congress directory (249) and Congress trades (1,443) render everything. Same app, same list pattern, three behaviours.
2. Arrows as signals: Stocks Congress column, hub Congress strip, Congress shelves use `n ↑ / m ↓`; the app's own rule bans arrows for anything that reads as a trade signal. Elsewhere "Added 45% / Trimmed 6%" badges use triangle glyphs (Investor profile).
3. Percent-change wording: "Added 45% more shares" (list), "Added 45%" (badge), "+9 new · -11 exited" (hub card), "19 funds bought · 1 new" (shelf). Same concept, four phrasings; absurd values ("Added 658%") in two of them.
4. Copy-performance wording: "If you had copied X" (profile and member) and "copy edge / yr" (Congress card), "Per year", "Difference", "ahead of / behind the S&P 500": the same comparison, named four ways; tile order differs between profile (Copy, S&P 500, Difference, Per year) and the member header (the same four plus Left out), but the member page shows it in the header and the profile shows it at the bottom.
5. Card header anatomy: caption-above-title is used for every panel here, but the caption sometimes repeats the title (hub shelves) and sometimes carries the data line (Stocks "200 stocks · counted by fund"); the status card on the hub uses the dot + counts line where Stocks uses a back-link + description.
6. Native `<select>` for quarter and sort next to custom `Segmented` controls on four pages.
7. Truncated context lines on phone on every page here (hub, Stocks, profile, member): the line is the same node but never wraps.
8. Phone tile grids orphan the last tile on profile and member (5 tiles in 2 columns).
9. Mixed number/caps formats: company names in source casing (UPPERCASE vs Title Case) in shelves, Stocks table, holdings table; `<amount>` compact format in cards vs `<amount>` in tables vs `<amount><amount>` full in trades.
10. Two vocabularies for "you": "You own" (badge), "You hold today" (tile), "Yours" (filter chip), "You" (column).
