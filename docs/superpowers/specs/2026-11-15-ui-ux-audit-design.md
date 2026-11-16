# UI/UX audit of every page: findings and target layouts

Date: 2026-11-15. Branch: `feat/ui-ux-audit` (from `feat/signals-on-candles`, PR #58).
Status (2026-11-16): the owner approved building all pages ("go ahead, finish research then do the
other pages"). Built on this branch: Research, Overview, Portfolio, Analytics, Discover and its shelf
page, Earnings, the chart page's symbol panel, Investors hub and profile, the not-found page. Not
built: see "What is left" at the end. Not pushed, no pull request yet.

The four page-group reports, with measured block heights, critique, wireframes and `file:line`
small fixes, are in `2026-11-15-ui-ux-audit/report-{a,b,c,d}.md` (amounts removed). This file is the
summary a new session should read first.

## Who it is for

One retail investor with some experience who buys for the long term and sometimes swing trades.
Their words: keep it stupid simple, plain words, show only what earned its place. They rejected coded
pills and anything that needs explaining. They want a mockup before a chart or layout feature is built.

## Rules every page follows after this work

1. **Answer first.** Each page opens with one card that states the page's answer in a sentence.
   Detail is below it or behind a click.
2. **One fact, one place, one wording.** A figure that appears twice on a page is removed from one
   place; a concept has one name app-wide (see "Wording" below).
3. **No list longer than 25 rows without "Show more".**
4. **No coded pills.** A verdict is an action word plus a reason in plain words.
5. **Phone: the answer is on the first screen and nothing scrolls sideways.**
6. **Shared primitives, not page-local copies** (see "Primitives").
7. **A status dot means something or is not drawn.** Today nearly every card has a green one.

## Component library decision

Keep the app's own components. `@tremor/react` targets React 18 and bundles Recharts 2 (the app is on
React 19 and Recharts 3) and colours by Tailwind palette names, which `noPaletteClasses.test.js` bans.
shadcn/ui is compatible but would be re-skinned almost entirely, and neither draws the candlestick
chart. Not verified: Tremor v4 beta and Tremor Raw blocks on React 19 / Tailwind 4.

## Primitives to build or consolidate (`frontend/src/components/ui.jsx`)

- `DataTable`: sticky header, `scope` on headers, sortable column marked, "Show more" paging,
  null as a dash, phone layout that drops columns instead of scrolling. 20 files hold a raw `<table>`.
- One stat tile. `Tile`, `MetricTile`, `Metric` and `StatRow`/`StatStrip` overlap.
- One choose-one control: `Segmented`. Fold `RangePills`, `PeriodSelector`, `TBtn` and Settings' own
  list into it; keep `TabList` for page-level tabs only.
- `PageHeader` as the one page title. Today only Settings uses it and most pages have no visible title.
- `ChartFrame` for Recharts cards (title, loading, empty, colours).
- One menu on Radix DropdownMenu (`research/menu.jsx` and `chartMenus.jsx` duplicate it).

## Wording to unify

| Concept | Use | Seen today |
|---|---|---|
| The user's holdings | "your portfolio" | "the book", "your book" |
| Total | "Net worth" (all), "Portfolio value" (investments) | four names |
| Home page | "Overview" | "Dashboard" on the 404 page |
| Copy result | "If you had copied" + "ahead of / behind the S&P 500" | "copy edge / yr", "Difference" |
| Position change | "Added 45% more shares" | four phrasings |
| Large numbers | one compact format with unit | "117.138b", "5.18T", none |

## Bugs found, to fix whatever is decided about layout

1. Dashboard: a cash deposit shows as a four-digit percentage gain in green. Show the money change
   only when the base is not comparable.
2. Congress member page renders every trade (1,443 rows, about 68,000px). Page it.
3. Investors hub renders all 89 fund cards and all 249 member cards. Page them.
4. Phone sideways overflow: Discover shelf (432px), Money account page (IBAN tile `whitespace-nowrap`).
5. Money "Labeled accounts" shows IBANs unmasked. Mask all but the last four characters.
6. Analytics attribution says "produced -25% of the total gain" when the total is a loss, and prints
   "+1.7% pp".
7. Analytics calendar-year chart draws benchmark bars for years before the portfolio existed.
8. Boards: Performance tile figures overflow their tiles at 1500px; the palette clips its last row.
9. Investor profile: "Opened a 0.0% position", "Added 658%".
10. NotFound renders without the app shell for a signed-in user.

## Target layouts

### Research (approved)
One answer card under the header: action word, one line of why, three cells (Company, Price, You).
It replaces the header verdict badge, the sentence above the chart (which keeps only stop-loss and
earnings warnings), the Verdict card and the Your position card. Checks collapse to "7 of 7 pass" or
list only failures. Snapshot becomes five one-line rows. Setup folds into the snapshot's Momentum row.
Performance and Range merge into one strip under the chart. Analysts, Funds and Congress become one
"Who else owns it" card. Capital structure, Ownership and Company facts move to Statistics. Trade
plan is open only for Buy or Add. Notes go last, collapsed while empty. Recent chips and the second
search leave the header. Mockup: https://claude.ai/artifact/CVqA8e2oR2buGZ3CY4JGid

### Overview (Dashboard)
One "Where you stand" card (value, change over the chosen range, one sentence, chart) beside "Needs
you" (at most two items). Then holdings (value, today, return, weight) beside "Smart money" (top 3).
Then recent transactions beside one row against the index. Goes: the heatmap's three controls,
Allocation's HHI and currency block, Movers (the table has it), the two unlabelled top-bar totals.

### Portfolio
Two tiles (portfolio value, profit since purchase). Holdings table first with six columns:
Instrument, Value, Today, Return, Weight, Action in plain words; the rest behind "More". Below: value
chart beside one "How it is split" card (sector, concentration, currency merged). Goes: Gainers and
losers, net worth and bank tiles.

### Analytics
One sentence first: ahead of or behind the chosen index by how many points over how many days, with
both returns. Then only the periods that have data, and risk. Attribution as one column. The
short-history caveat is said once.

### Discover
"Worth a look today": stocks the verdict grades Strong and Cheap, one plain line each. Then "Browse
by idea": one shelf shown at a time behind tabs. Goes: the lens chip row, the Cards/Compact toggle,
per-card jargon metrics. Shelf page: verdict column, sorted by it, one "why" sentence per row, sector
as one select, share classes merged, no sideways scroll.

### Earnings
"Your week" as one line when nothing of the user's reports, with their next report. Day strip
replaces the Market week grid. Each day lists large companies first; the small-company tail is
behind one button. One number format.

### Charts (Boards)
Chart is the answer; the verdict sits in the chart header. Right rail: watchlist with one search,
next report, "Open in Research". Goes: second search, Performance tiles, volume tiles, nested scroll
areas. Phone: watchlist reachable as a collapsed section.

### Investors
Hub: Following, then bought and sold side by side (five rows each), then just filed, then the
directory paged at 24. Goes: Biggest new bets shelf (it is a tab on Stocks), style tags, captions
that repeat titles, arrows in the Congress strip. Stocks: sorted column marked; phone shows the stock
and the active tab's metric. Profile: copy result first, then what changed beside biggest holdings,
then one holdings table (top-10 grid and donut go). Congress member: one sentence and three tiles,
chart beside estimated holdings, method collapsed in one place, newest 25 trades with Show more.

### Money, Settings, shell, signed-out pages
Money: three tabs instead of five; "Needs review" becomes a one-line notice linking to the queue;
broker cash and bank cash labelled apart; IBANs masked. Settings: Connections and Sync health merge;
"Appearance" holds theme, colours and density under that one name. Shell: navigation in the order
Overview, Portfolio | Research, Discover, Earnings, Charts | Investors | Analytics, Money; one
connection status with one wording; labelled totals or none; bell shows an unread count. Signed-out:
NotFound inside the shell, auth card in the app's type scale.
Open for the owner: renaming "Boards" to "Charts" in the navigation.

## Accessibility findings not yet fixed

Chart is pointer-only (pan, zoom, place and move lines); touch targets under 44px on phone (rail
buttons 36px, menu triggers 28px, watchlist remove is hover-only); watchlist row is a button inside a
button; table headers lack `scope` in several tables; truncated text without `title`; notes textarea
without a label. Fixed on this branch: secondary and warning text contrast in all themes, MA 20 in
the light theme, focus ring on earnings badges and textareas, pane activation on touch and focus,
11 to 12px text floor in the chart.

## Order of work

0. Done on this branch: Research small fixes, contrast, focus (commits `8468a38`, `fb471f8`).
1. Bugs list above (no design decision needed).
2. Primitives: `DataTable` with paging, one tile, `PageHeader`, number format helper.
3. Research answer card (approved).
4. Overview, Portfolio, Analytics.
5. Discover, shelf, Earnings, Charts.
6. Investors pages.
7. Money, Settings, shell, signed-out pages.

Each step: tests first, screenshots at 1500px and 390px in the default and light themes, one commit
or PR per step into `develop`.

## What was built (2026-11-16)

| Page | Change | Commit |
|---|---|---|
| Research | Answer card, one-line snapshot rows, one ownership card, reference cards on Statistics | `f0a41bc`, `90327eb` |
| Overview | One "Where you stand" card with a sentence; split, movers and heatmap removed | `e7b09be` |
| Portfolio | Two tiles; holdings table shows seven columns, six more behind "More columns"; allocation donut and gainers chart removed | `395a239` |
| Analytics | One sentence against the chosen index; only periods with data; attribution in points; no index bars before the portfolio existed | `e045d04` |
| Discover | "Worth a look today" (new `GET /api/verdicts/worth-a-look/`), one idea at a time; shelf page with an Action column, one sector select, merged share classes, phone rows without sideways scroll | `453a041` |
| Earnings | Day strip on every width replaces the market grid; 15 largest per day, the rest behind one button | `2dffc86` |
| Charts | Symbol panel states the verdict; Performance and volume rows removed | `f4e9685` |
| Investors | Bought and sold side by side, new bets left to Stocks; "Now 8×" and "under 0.1%" wording; copy result first on the profile | `5ece0e7`, `4286fe6` |
| Shell | Not-found page inside the app shell | `4286fe6` |
| Congress member, fund profile | One sentence on what copying returned (`lib/copySentence.js`); method behind a click | `a1f0533` |
| Investors Stocks | Sorted column marked; phone shows the stock and that column, no sideways scroll | `23fa7f7` |
| Shared (second pass, mockup https://claude.ai/artifact/B2EvaLBg6PqKjMqMsufrm9) | Opportunity and Review replace Buy and Sell (review); action as coloured text; price bar | `36809ae` |
| Portfolio (second pass) | Value, today's move and a full-width history chart with buys and sales marked | `a838521` |
| Discover (second pass) | A shop: search, filters with counts, rows of cards with a year of prices, filtered grid; `GET /api/verdicts/browse/` | `c1eeeaa`, `d628d8e` |
| Overview (second pass) | Daily summary of what to look at, holdings with action words | next commit |

Bugs 1 to 7 and 9 to 10 of the list above are fixed. Bug 8 is half fixed: the overflowing Performance
tiles are gone, the palette clipping its last row is not checked.

## What is left

- **Screenshots.** Portfolio onwards were verified by tests only: the dev database was not running on
  2026-11-16. Capture each page at 1500px and 390px before merging (`tmp/page.mjs <path> <prefix>`
  needs a fresh token in `tokens.json`).
- **Owner decisions:** rename "Boards" to "Charts" and reorder the navigation; whether the chart page
  keeps both searches (the page search opens a symbol, the watchlist search adds one).
- **Money and Settings** are untouched apart from masked account numbers and the wrapped tile.
  Banking work is paused by the owner.
- **Investor profile:** the top-10 grid and donut are still there.
- **Primitives:** `DataTable`, one stat tile, `PageHeader` on every page, `ChartFrame`, one menu.
- **Accessibility backlog** above.
- `MoversCard`, `AnalystRatingCard` and `VerdictCard` were deleted as unused. `AllocationPanel` and
  `PortfolioHeatmap` stay: board panels still render them.
