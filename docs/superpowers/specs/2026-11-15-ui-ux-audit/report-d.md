# UX report D: app shell, Money, Settings, signed-out pages

Captures (prefix `uxd-`, in <scratch>/): money / money-accounts / money-spending / money-budgets / money-tx / account / settings (+ -account, -conn, -sync) / dash / palette / menu / login / signup / forgot / notfound, each at -1500 and -390 (some with -fold). Measurements: uxd-measure.txt. No amounts, IBANs or names below.

## 1. App shell (all routes)

Hierarchy today
- Desktop top bar (64px, sticky): 9 text tabs in 17px bold (Overview, Portfolio, Research, Boards, Discover, Earnings, Investors, Analytics, Money), then Search pill with a keyboard hint, two figure pills (Saxo account value, cash across accounts; the second only >=1420px), alerts bell, avatar with status dot. Settings is only reachable through the avatar menu, labelled "Theme and colours" / "Account" / "Sync health".
- Phone: page title left, search icon, one figure pill, bell, avatar; bottom bar with 4 tabs (Overview, Portfolio, Research, Discover) plus "More" (Boards, Earnings, Investors, Analytics, Money, Settings, Search).
- Main question the shell answers: "where am I and is my data live". The two figure pills answer "what am I worth" on every page, which is useful, but see below.

Critique
- MAJOR: nav order does not follow the user's job (decide what to buy or sell). Order today is Overview, Portfolio, Research, Boards, Discover, Earnings, Investors, Analytics, Money. Analytics (how I did) sits after Investors (watching others). Boards is the chart workspace but its name does not say "charts"; it is second-tier next to Research with no hint of the difference. `lib/navigation.js:3-13`.
- MAJOR: nine equal-weight 17px bold tabs; no grouping, so "decide" pages (Research, Discover, Earnings) look the same as "review" pages (Analytics, Money). On phone the three buy/sell-relevant pages Earnings, Boards, Investors are hidden behind More, while Overview sits in the bar; Research and Discover are in the bar, good.
- MAJOR: the avatar menu mixes unlike things: a Saxo status line (which acts as Connect or Reconnect), three Settings sections with names that differ from the section labels (menu "Theme and colours" opens Appearance; "Account" opens Account), a credit link to a logo vendor. `TopBar.jsx:118-130`. The same credit link is repeated at the bottom of Settings (`Settings.jsx:269-273`).
- MAJOR: connection health is only a 7px dot on the avatar; its meaning ("Saxo connected / needs reconnect / sync failing") is only in the aria label and the menu. Money's Accounts tab shows a different, separate status badge row for banks. Two places, two vocabularies ("Saxo connected" badge on Portfolio, dot in menu, "Argenta sync failed" tag on Money).
- MINOR: figure pills are unlabelled visually (only `sr-only` / `title`). The first reads as portfolio value but is actually Saxo account value including cash; the Portfolio page's own big number is "net worth" with a different total. A reader sees three different big totals across the shell, Portfolio and Money without being told which is which.
- MINOR: the cash pill disappears below 1420px, so the shell is different at 1366 or 1440 laptop widths with no cue.
- MINOR: command palette (capture uxd-palette-1500): the list of pages is clipped mid-row at the panel bottom (the last row "Money" cut in half) with no scroll cue; page rows all labelled "PAGE" in caps, which is noise; no keyboard footer. `CommandPalette.jsx`. Search icon button on phone is 36px, below the 44px touch target; avatar and bell likewise (`TopBar.jsx` PILL h-9).
- MINOR: phone top bar shows the page title as a `<p>`, not a heading, while each page then has an `sr-only` h1; sighted phone users see the title only in the bar and never in the page, desktop users see none at all (see cross-app).
- MINOR: alerts bell has no count badge on the bar (unread dots are only inside the panel), so nothing says "something new".

Target (one recommendation)
```
desktop:  [Overview] [Portfolio] | [Research] [Discover] [Earnings] [Charts] | [Investors] | [Analytics] [Money]      Search  Value  bell  avatar
phone bar: Overview | Portfolio | Research | Discover | More (Earnings, Charts, Investors, Analytics, Money, Settings)
```
- Rename Boards to Charts (its own `sr-only` h1 already says "Chart workspace"). Order: own book, then decide (Research, Discover, Earnings, Charts), then others' moves, then reflection (Analytics, Money). Add a thin divider or extra gap between the groups rather than separate rows.
- Keep one figure pill (Saxo account value) with a visible tiny label on desktop; the cash pill goes (Money shows it first anyway).
- Avatar menu: Saxo status line, Settings, Sign out only. Settings page owns Account, Appearance, Connections, Sync. Drop the logo credit from the menu (keep the Settings footer).
- Status: make the dot appear only when something is wrong (amber or red); green dot says nothing a user needs.

## 2. Money (`/money`, sections via tabs)

Hierarchy today (desktop 1500, default Overview tab, page height 1573)
1. Section tab strip (Overview, Accounts, Spending, Budgets, Transactions), 5 tabs, no page title (the h1 is `sr-only`, `OverviewSection.jsx:17`).
2. Three equal summary cards in a row: Cash (234px, tallest, with Bank / Saxo cash breakdown), Spent this month (166), Budget left (162): the row is ragged because the first card is taller.
3. Left column: Spending by category donut (502px) then "Needs review" list (661px, 10 rows of dropdowns + "Keep as Other" buttons, "167 more").
4. Right column: Budgets editor (276), Subscriptions (404). Right column ends 600px above the left, leaving an empty hole.
Phone (page 3368px): cards stack at 234 / 194 / 162, donut 606, review list 1081 (one third of the page), budgets 361, subscriptions 432. Tab strip scrolls sideways and clips the fifth tab ("Budgets" cut at the edge, `uxd-money-390-fold.png`).
Main question: "how is my cash and spending this month". Today the first thing read is a total mostly made of broker cash (Saxo cash), which swamps the actual bank figure; the user's real month signal (spent versus last month) is third in reading order.

Critique
- BLOCKER (for the page's purpose): the Needs review block is 661px desktop and 1081px phone and asks for 177 manual decisions with the same visual weight as a summary. It is a chore queue placed above budgets and subscriptions and it dominates the page. Items to be categorised do not help decide to buy or sell.
- MAJOR: duplication across Money tabs. Overview shows Spending by category, Budgets, Subscriptions, Needs review, Spent this month, Budget left; Spending tab repeats Spending by category and Needs review; Budgets tab repeats Budgets, Budget left and Subscriptions; Accounts tab repeats "this month's spending" with the same comparison badge. Five tabs, about 60% of cards shown twice (measure: money-spending and money-budgets blocks match Overview).
- MAJOR: tab label "Overview" duplicates the app's top-level "Overview" tab, and the sub-tab strip (Overview / Accounts / ...) sits directly under the top tab strip with similar text style: two stacked tab rows, no page title between them. The active top tab "Money" and the active sub tab "Overview" both read bold-white.
- MAJOR: "Cash" mixes bank cash and broker cash and calls the sum Cash, then the Accounts tab's "Total balance" is just banks. Two numbers called balance/cash with different scope; the header cash pill duplicates the first (same figure).
- MAJOR: card anatomy is "dot + context line, then bold title" on every card ("Bank accounts + Saxo cash / Cash", "November 2026 / Spending by category"). The context line is often a restatement rather than information ("Monthly limit per category · this month" over "Budgets"). The green dot says "ok" on nearly every card so carries no meaning; amber appears on "Needs review" which is the one place a dot is earned.
- MAJOR: Spending-by-category donut is 502px tall with the donut occupying about 250px and big empty margins above and below inside the card (capture), and its legend repeats the same figures. One bucket ("Other") is 63% of spending; the chart mostly says "uncategorised".
- MAJOR: Accounts tab: "Labeled accounts" card is 1069px desktop and 1564px phone: a raw list of IBANs and counterparty labels plus 16 "Suggestions" with "Label this" buttons. It is configuration, not information, and it is longer than the whole rest of the tab. It shows full unmasked account numbers while the account tiles mask theirs (inconsistent privacy treatment).
- MAJOR: sync state of banks is two colour-coded tags in the header of the first card ("connected", "sync failed") plus a "Sync now" button, sharing a row with the page's only summary; the failed state is amber text on dark, small, with no explanation or action beside it.
- MINOR: budget row inputs are raw number fields with no currency symbol or unit, and "Add a budget" row uses a native select, an input and a small button, three different control styles/heights in one row (`BudgetSection.jsx`).
- MINOR: Spending tab and Transactions tab headers use `titleAs="h1"` for a visible card title (`TransactionsSection.jsx:116`) while Overview/Spending/Budgets/Accounts use an `sr-only` h1; the page has one visible title only on the Transactions tab.
- MINOR: empty-space imbalance on desktop: Budget left card (162) and Spent card (166) sit beside a 234 Cash card; right column shorter than left in Overview.
- MINOR: phone Money tab strip is the only tab strip that scrolls off the right edge with no fade cue.
- MINOR: Subscriptions block lists merchants with monthly price and a "Dismiss" link (ink-3 on dark, 12px, about 24px tall hit area).

Account page (`/money/accounts/:accountId`, 1704px desktop, 2281px phone)
- Blocks: header card (196px) with back link, bank name as title, Balance tile (with account type as sub), Available tile only when different, IBAN tile; then Bank transactions card (1392px desktop, 1880px phone) with search, category select, 25-row table with pagination.
- BLOCKER (phone): sideways overflow: the page measured 404px wide at a 390 viewport (`uxd-account-390.png`); the IBAN tile value is clipped at the right edge. Cause: `Tile` value is `whitespace-nowrap` (`ui.jsx` TILE_VALUE) in a 2-column grid that cannot shrink; `AccountTransactions.jsx:106-110`.
- MAJOR: on phone the fixed bottom nav overlaps table rows mid-screen in the full-page capture (that is a capture artifact of fixed positioning, not a bug), but rows are two-line with a truncated description repeated on the second line (description and raw description both truncated to the same text) so the second line adds nothing.
- MAJOR: the card heading (bank name) is the h1 while the account's own name (shown on the Accounts tab tile as small text above the bank) is lost; the status dot is a hard-coded green (`dot="ok"`), unrelated to the account's sync state (`AccountTransactions.jsx:104`).
- MINOR: back link reads "Back to Accounts" in a card header context line, small (13px) with a 44px target only below `md`; consistent with nothing else in the app (Research, Investors and Discover shelf use different back patterns).
- MINOR: Balance tile shows the account type as sub text in a different casing than the Accounts tab.
- MINOR: category select on each row is a native control inside a dense table; fine on desktop, but on phone each row's category chevron and the amount compete.
- MINOR: loading/error: error state keeps header card with a warn dot and `QueryState`; "Account not found" uses its own EmptyState: fine, but the not-found wording is "No account with this id", a developer phrase.
- MINOR: code comment at `AccountTransactions.jsx:22-24` breaks the repo's no-comment rule (legacy).

Target hierarchy for Money (one recommendation)
- Cut the tab strip to three: Overview, Accounts, Transactions. Spending and Budgets fold into Overview (Spending already links to Transactions by category). "Needs review" becomes a one-line amber notice with count and a "Review" button at the top of Overview that opens the Transactions tab filtered to uncategorised; the list itself lives there.
- Cash card splits: bank cash first (the thing Money owns), Saxo cash one line in the Accounts tab; no header duplicate.
- Merge Spent this month + Budget left into one card with a progress bar (spent versus budget) and the vs-last-month note.
- Labeled accounts + Suggestions go under a collapsed "Labels" section at the bottom of Accounts, masked IBANs.
```
desktop Overview
+ Money            [Overview] Accounts Transactions        Sync now +
| ! 177 transactions need a category            [Review] |
| Spent this month  [bar vs budget]  vs last month   | Bank cash |
| Spending by category (donut, 320px)  | Budgets (rows) + Subscriptions |
phone: notice, spent-vs-budget card, bank cash, donut, budgets, subscriptions collapsed
```

Small fixes
- `ui.jsx` TILE_VALUE — drop `whitespace-nowrap` or add `truncate`/`min-w-0` so the IBAN tile cannot push the page wider than 390px; or in `AccountTransactions.jsx:107-109` stack tiles with `grid-cols-1` below sm.
- `AccountTransactions.jsx:104` — drive `dot` from the account's sync state, not constant "ok".
- `AccountTransactions.jsx:53` — change "No account with this id" to "That account is not connected".
- `Money.jsx:30` — add fade or snap to the TabList on phone so the clipped fifth tab reads as scrollable.
- `components/money/OverviewSection.jsx:17`, `AccountsSection.jsx:18`, `SpendingSection.jsx:48`, `BudgetsSection.jsx:13` — a visible title (use `PageHeader`) rather than `sr-only` h1, or none anywhere (see cross-app).
- `LabeledAccountsSection.jsx` — mask IBANs the way `BankAccountTile` does.

## 3. Settings (`/settings`)

Hierarchy today (desktop 1500, default section Appearance)
1. h1 "Settings" (22px) via PageHeader, ~48px.
2. Left section list card (192px: Account, Appearance, Connections, Sync health), right body card (441px for Appearance; Account 3 cards totalling about 790px; Connections 523; Sync 352).
3. Footer credit link.
Phone: section list card (192px) stacked above the body (Appearance 761px). So on phone the user scrolls past a 192px nav card to reach content, and sections are not tabs or a segmented control.
Main question: "change how the app looks / is the data connected".

Critique
- MAJOR: default section is Appearance, but "Account" is first in the list and the Settings entry from the avatar menu ("Account") goes elsewhere; the first item in the list is not the first thing shown.
- MAJOR: Connections and Sync health are two sections about one thing (is my data live). Sync health repeats each source's connection state plus last sync, and Connections already prints "last synced". A user must look in two places; the header dot, menu line, Settings Connections, Settings Sync health and Money's bank status tags make five places for connection state.
- MAJOR: Appearance has an odd card anatomy: the context line "Changes colours only; layout stays the same" is a sentence above the title "Theme", reversing normal reading order; it then holds three unrelated settings (theme, gain/loss colours, density) under that one "Theme" title (h3s inside). The card title is wrong for 2/3 of its content.
- MAJOR: the theme cards use a mini-diagram with a hex of dots that carries no information; "Blue / orange" gain-loss option and its note explain colour blindness in a sentence the user must read; the user dislikes anything needing explanation.
- MINOR: "Other sources" in Connections lists Finnhub, SEC EDGAR and the House Clerk with no status dot and prose such as "with a key set on the server": operator talk, not user info; delete or move to a Guide/about line.
- MINOR: Sync-health rows use task names in mono (internal function names) as headings when failing.
- MINOR: wording drift: menu "Theme and colours" vs section "Appearance" vs card "Theme"; section "Sync health" vs sentence "Latest run of each task".
- MINOR: logo credit duplicated (menu and page footer).
- MINOR: empty lower half of the page on desktop (content 441px, page 1000px), fine.
- MINOR: Segmented controls are fine; section list buttons are 40px tall, acceptable.

Target
- Sections: Appearance (theme cards only plus the two segmented controls, title "Appearance"), Connections (merges sync health: one row per source with status, last synced, one action), Account. Order: Account first in list and default? Recommendation: default to Connections when anything is not ok, else Account.
- Phone: replace the stacked nav card with a horizontal Segmented / TabList (like Money) so content starts at the top.
```
desktop: Settings
  [Account] [Appearance] [Connections]  (left list)   | one card per section
phone:   Settings / [Account | Appearance | Connections] / card
```
Small fixes
- `Settings.jsx:75` — put `title="Appearance"` and drop the context sentence or move it under the title.
- `Settings.jsx:239` — default section: `account` or `connections` when degraded.
- `Settings.jsx:38-42, 169-174` — remove "Other sources" or reduce to plain names without operator notes.
- `TopBar.jsx:122` — rename "Theme and colours" to "Appearance" (match the section).
- `Settings.jsx:269-273` — keep a single logo credit (this one) and drop `TopBar.jsx:126-130`.

## 4. Signed-out pages (Login, Signup, Forgot, NotFound)

Hierarchy today
- Login (desktop 1000 viewport, panel ~400px tall on 320px-wide card, vertically centred): logo tile, h1 "Sign in to SaxoDash", two fields, primary button, two links.
- Signup and Forgot use the same AuthShell. Forgot/Reset are shorter.
- NotFound: bare 404 number, one sentence, button "Back to Dashboard", on a flat dark page.

Critique
- MAJOR: NotFound is not a signed-out page only; it also renders for signed-in users with no shell (no top bar), so a typo drops the user out of the app chrome. "Back to Dashboard" uses a name that is not in the nav (the page is called Overview). `NotFound.jsx:12`.
- MAJOR: auth links on phone wrap to two lines each ("Forgot / password?" and "Create an / account") because both sit in one justify-between row in a 320px card with 16px link text; looks accidental (`uxd-login-390.png`, `Login.jsx:51-54`).
- MINOR: the auth card is `max-w-80` (320px) with `rounded-lg`, not the app's `rounded-xl` `sd-panel`; headings use `--fig-md` 500 weight whereas the app uses 17-22px bold; field labels are 12px ink-2 on an input with placeholder text identical to the label (label and placeholder both say "Email or username", "Password"): redundant.
- MINOR: on desktop the card is small against a large empty field, no product sentence; for a private tool that is fine, but the login has no hint of what the app does or whether signup is open; no show-password toggle.
- MINOR: logo tile is a generic line-chart icon (reads as a template).
- MINOR: NotFound button wording "Back to Dashboard" vs nav "Overview"; error boundary uses another style again (`--fig-lg` 500 weight).
- MINOR: `Login.jsx:24` shows one generic error with no per-field cue beyond aria-invalid (no red outline observed in design), acceptable.
Target: keep the card; fix wrapping (stack the two links vertically on one line each or put "Create an account" on its own centred line); NotFound inside Layout for signed-in users with "Back to Overview"; unify heading weight with `PageHeader` scale.
Small fixes
- `Login.jsx:51` — `flex-wrap gap-x-4` or `flex-col items-center gap-1` on phone; same in Signup/Forgot link rows.
- `NotFound.jsx:12` — "Back to Overview".
- `AuthShell.jsx:30-31` — placeholder removed or changed to an example.
- `App.jsx` — add the NotFound route inside the `Layout` route as well.

## 5. Cross-app section

Navigation order and naming vs the user's job (decide what to buy or sell)
- The decision path today is Research (per-stock verdict), Discover (candidates), Earnings (timing), Portfolio (what I hold and its verdict column). The nav order reads Overview, Portfolio, Research, Boards, Discover, Earnings, Investors, Analytics, Money which already starts well but interleaves "Boards" (a chart tool) between Research and Discover and puts Investors (others' trades, a signal source) before Analytics and Money. Proposed order above. "Boards" is the only label that does not say what is in it. "Overview" and the Money tab "Overview" and Research's "Overview" tab are the same word three times at three levels.
- Settings is invisible in the top bar and called three different things in the menu.

Page-title and header patterns that differ
- Visible page title patterns: (a) none, `sr-only` h1 only: Dashboard, Portfolio, Analytics, Investors, Discover, Earnings, Boards, Investor, Money tabs except Transactions; (b) `PageHeader` visible h1 22px: Settings only (`PageHeader` is used by nothing else; `grep PageHeader` shows only Settings and the definition); (c) Card header as h1: Account transactions, Transactions tab, Discover shelf, Investor stocks (`titleAs="h1"`); (d) own 22px h1 built by hand: Congress member, Investor hero, Research header (three hand-copies of the `PageHeader` class string, `CongressMember.jsx:99`, `InvestorHero.jsx:52`, `ResearchHeader.jsx:154`); (e) auth pages use a different h1 style again.
- On desktop most pages therefore show no title (the active tab is the only cue), while Settings and a few drill-downs show one; on phone the top bar shows the title for all. Result: same hierarchy position, three different looks.
- Card heads: context line above title ("dot + context / bold title") is the app's pattern, but context is sometimes a category, sometimes a period, sometimes a sentence; Settings puts a full sentence there.

`ui.jsx` primitives: overlap and bypass
- Tabs: `TabList/TabButton` is used by Money, Analytics, Research header only; Settings builds its own section list; Portfolio, Discover, Investors, Earnings use `Segmented`, `Chip`, `RangePills`, `PeriodSelector`, `TBtn` (five pill/segment controls plus `TabButton`, about six ways to say "choose one of N"). `RangePills` and `PeriodSelector` (separate components outside ui.jsx) overlap `Segmented`.
- Tables: `Th/SortableTh/Td/Tr` are used by 13 files, but 20 files contain a raw `<table` and several (StatementTable, RatioHistoryTable, TechnicalsTable, MonthlyReturnsHeatmap, PeersTab, InsiderTransactions, Dashboard, DiscoverShelf) build or partly build their own; so row density is governed in one place only for roughly two thirds of tables.
- Stat tiles: `Tile`, `MetricTile`, `Metric`, `StatRow`/`StatStrip` all exist with near identical anatomy (`Tile` and `MetricTile` literally share `TileFrame`; they differ in absent-value handling and tone map). Meanwhile at least 7 files hand-roll `bg-tile rounded-[10px] px-3.5 py-3` boxes: `BankAccountTile`, `OwnershipCard` (x2), `research/OverviewTab`, `PerformanceTiles` (px-3 py-2.5, a slightly different padding), `CongressCard`, `InvestorCard`, `TopHoldings` (px-3 py-3), `StockSignalCard`. Padding drifts between px-3 / px-3.5 and py-2.5 / py-3.
- Headings: `PageHeader` unused (see above); `CardHeader`/`Card context title` duplicates `PanelHead`; Card's `title` supports `titleAs`, `PageHeader` does not integrate.
- Status: `StatusDot` and `Tag` and `Badge` overlap (three small status chips). Money alone uses tags for sync state, Portfolio uses a "Saxo connected" badge.
- Recommendation: promote `Segmented` as the single choose-one control (fold RangePills, PeriodSelector, TBtn in), make `PageHeader` the one title (visible on desktop for every page, with right slot for the page's primary action and status), make `Tile` the only bordered figure box, and gate raw `<table` through `Th/Td/Tr` in `noPaletteClasses`-style test.

Other cross-page inconsistencies
- Totals: three different "big" money figures in the shell, Portfolio and Money (Saxo account value, net worth, cash), without a labelled relationship.
- "Money" page is the only page with two stacked tab rows; Analytics and Research use a TabList too but not under another strip.
- Connection state: dot (avatar), menu line, Settings Connections, Settings Sync health, Money tags, Portfolio badge, five spots, different wording ("Saxo connected", "Connected", "sync failed", "Sync degraded").
- Back links: "Back to Accounts" (Account page) vs others in Research/Investor/Discover shelf use different styles.
- Back-to-home wording: "Dashboard" (404) vs "Overview" (nav).
- Dot colour: green dot on every card carries no meaning while amber is used for real warnings; the signal is diluted app-wide.
- Phone targets: top-bar controls are 36px high app-wide (below 44px).
- Legacy comments remain in `AccountTransactions.jsx`, `ui.jsx` (against repo style; not a UX issue).
