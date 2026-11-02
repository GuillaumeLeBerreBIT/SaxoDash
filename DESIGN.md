# DESIGN.md — SaxoDash

The visual and interaction system for SaxoDash. It replaces the zinc/blue look of the 2026-09
design system (that `docs/design-system.md` is in git history and now points here) with the
direction agreed in the October 2026 redesign rounds.

- **Reference prototype**: https://claude.ai/artifact/YAFabdj3qWKZbXiBfVPGZz. Every page, the
  Chart board, custom boards with edit mode, ⌘K, the theme switch and phone layouts, on real data.
- **Mockup canvas** (component sheets, token sheet, per-page artboards):
  https://claude.ai/artifact/A2rKmvcQNyKuVmBh3p61ED
- **Source of the measurements**: `design-review/references/trade-republic/palette.md`
  (git-ignored, local only).

When this file and the prototype disagree, this file wins. When this file is silent, follow the
prototype.

---

## 1. Direction

**Layout of a trading workstation, palette of Trade Republic's web terminal.**

1. **No accent colour in the chrome.** Selection, the active tab and the primary button are white
   (in Republic). Colour is spent only on data: gains, losses, series, status.
2. **Panels sit darker than the page.** A warm graphite page gradient, with near-black panels
   floating on it. Panels have no borders and no shadows; the contrast step does the separating.
3. **Every panel has the same anatomy**: a context row, then a bold title, then a ⋯ menu (§5.3).
4. **Numbers are the content.** Tabular figures, signed values, arrows next to colour, units stated.
5. **Honest data.** If a figure is absent it says so. Stale data is labelled with its date.
   Example data carries an "Example" tag. Nothing is shown as zero or as live when it is not
   (§9).

What it must not look like: a template SaaS dashboard. That means no gradient hero, no coloured
icon tiles, no blue glow, no rounded-everything cards with drop shadows, no emoji, and no accent
bar on cards.

---

## 2. Themes

Settings → Appearance offers three themes. **A theme changes colour values only. Layout, type
and spacing never change between themes.**

| Theme | Character | Default |
|---|---|---|
| **Republic** | Warm graphite, white accent; measured from Trade Republic | yes |
| **Graphite Blue** | Cool graphite, blue accent | |
| **Porcelain** | Light, blue accent | |

Two independent settings sit beside the theme:

- **Gain and loss colours**: green/red (default) or blue/orange (`moves = cvd`), for red-green
  colour blindness.
- **Density**: comfortable (default, 46 px table rows, 12 px gaps) or compact (38 px rows, 8 px
  gaps).

These choices are stored per browser under `saxodash:appearance` and applied as
`data-theme`, `data-moves` and `data-density` on `<html>`.

---

## 3. Colour tokens

Every colour in the app is one of these roles. Components use the role, never a hex value or
a Tailwind palette colour (`zinc-*`, `emerald-*`, `blue-*`). `src/lib/theme.js` is the single
source of the values below, and CSS variables plus chart colours are both generated from it.

### 3.1 Surfaces

| Role | CSS var | Used for | Republic | Graphite Blue | Porcelain |
|---|---|---|---|---|---|
| Page top | `--sd-page-top` | Top of the page gradient | `#25211C` | `#0F131A` | `#F3F4F6` |
| Page | `--sd-page` | Page background, below 560 px | `#171512` | `#0A0C0F` | `#F3F4F6` |
| Pane | `--sd-pane` | Every panel, table background | `#12100E` | `#101318` | `#FFFFFF` |
| Raised | `--sd-raised` | Menus, popovers, tooltips, dialogs, buttons | `#1A1A1A` | `#161B22` | `#FFFFFF` |
| Hover | `--sd-hover` | Row and item hover | `#1A1A1A` | `#141922` | `#F3F5F8` |
| Selected | `--sd-selected` | Active segment, selected row | `#171717` | `#121925` | `#EAF0FB` |
| Tile | `--sd-tile` | Stat tiles inside a panel | `#181818` | `#141922` | `#F6F7F9` |
| Pill | `--sd-pill` | Header pills, tags, logo fallback | `#1D1B19` | `#141922` | `#FFFFFF` |
| Track | `--sd-track` | Segmented-control track, input fill, ⌘K key | `#080605` | `#07090C` | `#ECEEF1` |
| Bar | `--sd-bar` | Phone bottom bar | `#1D1D1D` | `#161B22` | `#FFFFFF` |

In Porcelain, panels, pills and raised surfaces also get a 1 px `--sd-line` ring, because
white-on-light-grey does not separate on its own.

### 3.2 Text and lines

| Role | CSS var | Used for | Republic | Graphite Blue | Porcelain |
|---|---|---|---|---|---|
| Ink | `--sd-ink` | Values, titles, cell text | `#FFFFFF` | `#E6E9ED` | `#111827` |
| Ink 2 | `--sd-ink-2` | Labels, names beside symbols | `#929191` | `#8B95A3` | `#4B5563` |
| Ink 3 | `--sd-ink-3` | Units, timestamps, column heads, inactive tabs | `#7E7B78` | `#77818F` | `#6B7280` |
| On accent | `--sd-on-accent` | Text on a primary button | `#12100E` | `#0A0C0F` | `#FFFFFF` |
| Disabled | `--sd-disabled` | Disabled controls only | `#2C2A2A` | `#3D4550` | `#A3A9B3` |
| Line | `--sd-line` | Row dividers, Porcelain rings | `#1A1A1A` | `#1C2129` | `#E5E7EB` |
| Input line | `--sd-line-input` | Inputs and selects (≥ 3:1) | `#6B6865` | `#5E6876` | `#8A919C` |
| Focus | `--sd-focus` | 2 px keyboard focus ring | `#FFFFFF` | `#7FB2FF` | `#1F5FD1` |

Republic's Ink 3 is lifted from Trade Republic's `#4E4E4E` (2.3:1) to `#7E7B78` (4.5:1 on the
pane). Input line is added because Trade Republic draws inputs with no border at all. These two
are the only deliberate departures from the measured palette, and both are for accessibility.

### 3.3 Accent

| Role | CSS var | Republic | Graphite Blue | Porcelain |
|---|---|---|---|---|
| Accent | `--sd-accent` | `#FFFFFF` | `#7FB2FF` | `#1F5FD1` |
| Accent hover | `--sd-accent-hover` | `#E6E5E3` | `#A9CBFF` | `#1A4FB0` |
| Accent subtle | `--sd-accent-subtle` | `#171717` | `#17243A` | `#E3EBFA` |

The accent marks: the primary button (one per view), the active tab underline (Graphite Blue and
Porcelain only; in Republic the active tab is just white text), selected chips, links, and the
"held" tag.

### 3.4 Gain and loss

| Role | CSS var | Republic | Graphite Blue | Porcelain | CVD, dark | CVD, Porcelain |
|---|---|---|---|---|---|---|
| Up | `--sd-up` | `#5BC860` | `#3FB27F` | `#12733A` | `#4C9AFF` | `#1F5FD1` |
| Down | `--sd-down` | `#EB503F` | `#E5534B` | `#C0362C` | `#FF9A3C` | `#C2570C` |
| Up subtle | `--sd-up-subtle` | `#1E2E1A` | `#12291F` | `#EAF5EE` | `#152238` | `#E3EBFA` |
| Down subtle | `--sd-down-subtle` | `#2A120F` | `#2D1517` | `#FBECEA` | `#3A220F` | `#FBEADF` |
| Flat | `--sd-flat` | `#929191` | `#8B95A3` | `#6B7280` | same | same |

The Republic up/down pair was checked with the palette validator: its colour-blind ΔE is 9.2,
which passes. A move is **never colour alone**. It always carries ▲ / ▼ and a sign, and
`mv(value)` renders both.

### 3.5 Status and domain

| Role | CSS var | Republic | Graphite Blue | Porcelain |
|---|---|---|---|---|
| Warning | `--sd-warn` | `#F5C542` | `#E8A23A` | `#B88A00` |
| Warning text | `--sd-warn-text` | `#F5C542` | `#E8A23A` | `#8A6700` |
| OK | `--sd-ok` | `#5BC860` | `#3FB27F` | `#12733A` |
| Error | `--sd-error` | `#EB503F` | `#E5534B` | `#C0362C` |
| Earnings | `--sd-earn` | `#B69CFF` | `#D86BD0` | `#9B4DCA` |
| Earnings subtle | `--sd-earn-subtle` | `#221C33` | `#2A1730` | `#F3EAFA` |
| Held | `--sd-held` | `#FFFFFF` | `#7FB2FF` | `#1F5FD1` |

- Warning marks a stale scan, a lapsed session, or a weight above the 15% cap.
- Earnings marks the **E** tag before a report and the user's own cell in the earnings week grid.
- Status always ships with a dot or icon **and** words.

### 3.6 Chart chrome

| Role | CSS var | Republic | Graphite Blue | Porcelain |
|---|---|---|---|---|
| Grid | `--sd-grid` | `#211F1D` | `#161A21` | `#EEF0F3` |
| Crosshair | `--sd-crosshair` | `#9D9CA0` | `#8B95A3` | `#4B5563` |
| Benchmark | `--sd-bench` | `#929191` | `#8B95A3` | `#6B7280` |
| Primary line | `--sd-primary-line` | `#FFFFFF` | `#7FB2FF` | `#1F5FD1` |

Axis text uses Ink 3.

### 3.7 Scales

- **Categorical series** `--sd-s1 … s8`, assigned in fixed order and never cycled. A 9th series
  folds into "Other".
  - Dark: `#3987e5 #d95926 #199e70 #c98500 #d55181 #008300 #9085e9 #e66767`
  - Porcelain: `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300 #6250d6 #e34948`
- **Heat, diverging**: `--sd-heat-d3 d2 d1 0 u1 u2 u3`, used for day-move heatmaps and monthly
  returns. Thresholds are −3 / −1.5 / <0 / 0 / <1.5 / <3 / ≥3 %.

| | d3 | d2 | d1 | 0 | u1 | u2 | u3 |
|---|---|---|---|---|---|---|---|
| Republic | `#3D1C19` | `#311611` | `#1B0607` | `#171512` | `#192316` | `#2F5F2F` | `#408040` |
| Graphite Blue | `#5C2A29` | `#45201F` | `#2A1718` | `#262B33` | `#16302A` | `#1F4A38` | `#2C7A58` |
| Porcelain | `#E58A80` | `#F2B3AB` | `#F8DCD8` | `#EDEDED` | `#DDF0E3` | `#A9D9B9` | `#6FBF8E` |
| CVD, dark | `#4A2A12` | `#3A220F` | `#24160A` | page | `#152238` | `#1F3A66` | `#2C5BA0` |
| CVD, Porcelain | `#E59A63` | `#F2C29F` | `#F7D8C2` | `#EDEDED` | `#DCE6F8` | `#A9C2EE` | `#6E97E2` |

Tile text on a heat cell is Ink, and its value is coloured with Up or Down.

---

## 4. Typography

| Family | Use |
|---|---|
| **Inter** 400/500/600/700 | Everything, numbers included, always with `font-variant-numeric: tabular-nums` on figures |
| **IBM Plex Mono** 400/500 | Keyboard hints (⌘K), API keys, accession numbers. Never figures. |

Inter stands in for Trade Republic's proprietary face. Both load from Google Fonts with a
system-ui fallback.

| Token | Size / weight | Used for |
|---|---|---|
| `display` | 34 / 700, −0.02em | One hero figure per page (net worth) |
| `figure-lg` | 26 / 700 | Instrument price, Next-earnings date |
| `h1` | 22 / 700 | Instrument or investor name |
| `figure` | 20 / 700, −0.01em | Stat tile values, page title on phone |
| `nav` | 17 / 700 | Top tabs; the active one is Ink, the rest Ink 3 |
| `title` | 17 / 700 | Panel titles |
| `subtab` | 15 / 700 | Board tabs and sub-tabs (Research tabs, Money sections) |
| `body` | 14 / 400–600 | Default |
| `cell` | 13.5 / 400–600 | Table cells, list rows |
| `context` | 13 / 500 | Panel context rows, buttons |
| `caption` | 12 / 400–500 | Tile labels, notes, column heads |
| `axis` | 11 / 400 | Chart ticks, tags |

That is the whole scale; do not add sizes. Headings use `text-wrap: balance`.

---

## 5. Layout and components

### 5.1 Spacing and shape

| Thing | Value |
|---|---|
| Page gutter | 24 px desktop, 16 px phone (`max(…, env(safe-area-inset-*))`) |
| Board gap | 12 px (8 px compact) |
| Panel padding | 14 px top, 18 px sides, 18 px bottom; flush tables keep 18 px on the first and last cell |
| Radius | panel 12 · tile and header pill 10 · segmented track 9 · button and input 8 · segment 7 · tag 6 |
| Table row | 46 px (38 px compact), 30 px header |
| List row | min 44 px |
| Touch target | ≥ 44 px on phone |

### 5.2 The board

Every page is a **board**: a 12-column grid of panels with a 12 px gap and `align-items: start`.

- Standard widths: **8 + 4** for answer plus side, **6 + 6** for two equals, **4 + 4 + 4** for
  summaries, **12** for tables.
- Where two columns would leave holes (Research Overview), each side is a flex column of panels
  (`.col`) instead of grid rows.
- Below 1100 px every panel takes the full width. Below 760 px the phone layout applies (§6.4).
- There is no page-title block. The active nav tab is the title, and the first panel starts
  right under the header.
- Each page answers one question, and the panel that answers it sits top-left and is the widest:

| Page | Question |
|---|---|
| Overview | How am I doing, and what needs me? |
| Portfolio | What do I own, and is it balanced? |
| Research | Is this company worth owning? |
| Boards | My own layouts; the first board is the Chart workspace |
| Discover | What should I look at next? |
| Earnings | Who reports, and how did my names react? |
| Investors | What are the best funds and Congress buying? |
| Analytics | Am I beating the market, and at what risk? |
| Money | Cash, accounts, spending, budgets, subscriptions |
| Settings | How the app looks and what it connects to |

### 5.3 Panel anatomy

```
● Context · source · as-of date                [control]  ⋯
Bold title (17/700)
content
note (12, Ink 3)
```

- **Context row** (13/500): a 7 px status dot, then what the panel shows and where it comes from,
  with Ink 2/3 for the secondary parts.
  - Dot colours: OK green for fresh data, Warning for stale or capped, Earnings purple for
    report-related, Ink 3 ("off") for static or empty.
  - A linked panel says what it follows: "🔗 Follows watchlist · **GOOGL**".
- **Title**: one noun phrase or the page's question. No icons.
- **Right side**: at most one control (segmented, link "See all 52 →", or a small button), then
  the ⋯ menu (Add to a board · Copy link · Export CSV).
- **Note**: one line under the content for caveats ("Trades inside the quarter are not visible in
  a 13F.").

Panels are `--sd-pane`, radius 12, with no border and no shadow (Porcelain adds the 1 px line ring).

### 5.4 Header (app frame)

```
Overview  Portfolio  Research  Boards  Discover  Earnings  Investors  Analytics  Money    [Search ⌘K] [€42,634.84] [€821.54] [Bell] (G•)
```

- Tabs are 17/700 words, with 22 px between them. They scroll sideways if needed and never wrap.
- **Pills** are 36 px tall, `--sd-pill`, radius 10, 14/700:
  - Search: Ink 3 text and a ⌘K key.
  - Saxo account value. It shows the value alone until an endpoint provides the day move;
    the move joins then.
  - Cash across accounts.
  - Account button with its initial and a status dot: Warning when Saxo needs re-authentication,
    OK otherwise.
- Below 1420 px the cash pill hides. Below 760 px tabs and Search hide, the page title shows,
  and the bottom bar takes over.
- The header is sticky. Its top band is painted so nothing scrolls under the safe-area inset.
- The filing-alerts bell sits beside the account button, not inside its menu.
- The account button opens a menu: Saxo status (with "Reconnect"), Theme and colours, Sync
  health, Sign out. Settings lives here, not in the tabs.

### 5.5 Controls

| Component | Spec |
|---|---|
| **Button** | 32 px tall (28 px small), radius 8, 13/600 (small 12/600), `--sd-raised`. Primary is `--sd-accent` with On-accent text, at most one per view. Ghost has no fill. Destructive actions are ghost with Error text and confirm in place ("Click again to delete"). |
| **Segmented** | `--sd-track` track with 3 px padding, radius 9. Segments are 28 px, radius 7, 13/600 Ink 3; the active one is `--sd-selected` with Ink. Used for ranges, views, period and benchmark. |
| **Chip** | 28 px, radius 8, `--sd-raised`, 12/600 Ink 2. Pressed is `--sd-accent-subtle` with Ink and a 1 px Ink 3 ring. A count sits inside in Ink 3 ("Oversold **15**"). Used for lenses, filters and symbol switchers. |
| **Tag** | 22 px, radius 6, `--sd-pill`, 11/600. Variants: held, earn (E), warn, up, down, Example. |
| **Input** | 34 px, radius 8, `--sd-track` fill, 1 px `--sd-line-input`. |
| **Tabs (sub)** | 15/700 words, Ink 3, active Ink, no underline in Republic. Board tabs are the same type on 34 px pills, with the active one on `--sd-pill`. |
| **Tile** | `--sd-tile`, radius 10, 12×14 padding. Label 12 Ink 3, value 20/700, sub-line 12 Ink 2. Tiles sit in an auto-fit grid of minimum 150 px. |
| **Logo** | 28 px circle (36 px in headers), white disc, 3 px padding, 1 px line ring, holding the company's logo. The fallback is initials on `--sd-pill`. |
| **Status dot** | 7 px circle, always beside words. |

### 5.6 Data display

- **Tables**: 12/500 Ink 3 headers, sticky inside their panel. Rows are 46 px with a 1 px
  `--sd-line` top border. Numbers are right-aligned and tabular.
  - The first cell is the "who" block: logo, then **name** over "TICKER · context" in 12 Ink 3.
  - Clickable rows show a hover fill and open the instrument. Sortable headers turn Ink and show
    ↑/↓ with `aria-sort`.
  - Wide tables scroll inside the panel. Lower-priority columns hide below 1440 px (`hidew`) or
    on phone (`hidem`).
- **Moves**: `▲ 1.40%` / `▼ 1.40%` in Up/Down. Money uses a true minus: `−€1,298.03`, with a
  sign on deltas only. Euros are written `€10,756.33`; an instrument's own currency stays in that
  currency (`$279.84`).
- **Weight bar**: 6 px track. The fill is Ink, or Warning above the 15% cap, and a 1 px tick
  marks the cap.
- **Sparkline**: 1.5 px line, Up or Down by the window's net move, no fill.
- **Heatmap**: a squarified treemap of HTML tiles (focusable) on the heat scale, with a 2 px pane
  gap. A tile shows its ticker when wide enough, and its move when wider still.
- **Lists** (`li`): a row of logo or tag, then a growing text block, then a right-aligned value.

### 5.7 Charts

Follow the dataviz rules: one y-axis, thin marks, a recessive grid, and a hover layer on every chart.

- **Price/area**: a 2 px line in Up or Down by the visible range's move, and an area fill fading
  from 22% to 0.
  - The last value sits in a tag on the right axis. The y-axis is on the right and the grid is
    horizontal only.
  - **Your average cost** is a dashed Ink 2 line with its own axis tag. A user price line is a
    dashed Warning line.
  - **A gap in stored data** is drawn dotted, never interpolated as solid.
- **Benchmark**: dashed `--sd-bench`, 1.5 px.
- **Crosshair** (dashed `--sd-crosshair`) plus a tooltip on `--sd-raised`: date, then rows of
  swatch, name and value.
- **Bars**: radius 3, a 2 px gap between grouped bars, and the zero line in Ink 3. Highlight the
  current period in Ink and leave the rest Ink 3 (monthly spending), or use Up/Down by sign
  (yearly returns, EPS surprise).
- **RSI sub-pane**: 84 px tall, fixed 0–100 domain, 30/70 dotted guides, and the current value
  named ("20.3 oversold").
- **Heights**: 300 px for a Research price chart, 430 / 380 / 250 px for Chart panes with
  1 / 2 / 4 panes, 220–280 px for analytics panels, 120 px for a mini chart inside a summary panel.
- Chart colours come from `useChartColors()`, never from a constant (§7).

### 5.8 Overlays

Overlays are built on **Radix primitives**: Dialog, DropdownMenu, Popover and Tooltip.

- **Menu**: `--sd-raised`, radius 10, 6 px padding, and a large soft shadow in the
  `--sd-shadow` role (lighter in Porcelain, which also adds its 1 px ring). Items are 13.5 px with a selected fill on hover.
- **⌘K palette**: a dialog 620 px wide at 12vh from the top, over the `--sd-scrim` role (a 55% black wash; Porcelain tints it).
  - It searches instruments, pages, actions, Discover lenses and investors.
  - ↑↓ to move, ↵ to open, esc to close. It also opens with ⌘K, Ctrl+K and `/`.
- **Toast**: bottom centre, `--sd-raised`, 13/600, 2.2 s. The words match the control
  ("Publish" → "Published").
- **Bottom sheet** (phone "More"): `--sd-raised` with a 16 px top radius and 48 px rows.

### 5.9 States

- **Empty**: say what will appear and offer the first action ("An empty board — Add your first
  panel").
- **Stale**: a Warning dot plus "scan from Tue 20 Oct · stale: Saxo needs re-authentication",
  and a Refresh action when there is one.
- **Absent**: "—" or "not returned". Never 0.
- **Not available here**: name the reason and the alternative ("Company data covers US-listed
  shares").
- **Loading**: a skeleton in the final shape. No spinners on panels.

---

## 6. Navigation and pages

### 6.1 Top-level

Overview · Portfolio · Research · **Boards** · Discover · Earnings · Investors · Analytics ·
**Money**. **Settings** sits behind the account button.

| Route | Page | Notes |
|---|---|---|
| `/` | Overview | |
| `/portfolio` | Portfolio | Views: Positions · Transactions (`?view=`); Closed and Tax year join once they have endpoints |
| `/research` | Research | `?symbol=&tab=`, 10 tabs (§6.2) |
| `/boards` | Boards → Chart | The Chart workspace (was `/research/chart`) |
| `/boards/:id` | A custom board | |
| `/discover`, `/discover/:key` | Discover, shelf | Views: Cards (default) · Compact (the prototype's panels) |
| `/earnings` | Earnings | |
| `/investors`, `/investors/:slug`, `/investors/stocks`, `/investors/congress/:slug` | Investors | Funds / Congress switch |
| `/analytics` | Analytics | |
| `/money` | Money | Sections: Overview · Accounts · Spending · Budgets · Transactions (`?section=`) |
| `/settings` | Settings | Appearance · Connections · Sync health |

Old routes redirect and keep their query strings:

| Old route | Redirects to |
|---|---|
| `/research/chart` | `/boards` |
| `/transactions` | `/portfolio?view=transactions` |
| `/accounts` | `/money?section=accounts` |
| `/accounts/:id` | `/money/accounts/:id` |
| `/spending` | `/money?section=spending` |
| `/spending/transactions` | `/money?section=transactions` |

### 6.2 Research keeps everything

The restyle drops nothing. Research has the same ten tabs as before: Overview, Financials,
Statistics, Peers, Earnings, Funds, Congress, Filings, News, Guide (`?tab=valuation` still opens
Statistics). Every existing card stays, re-skinned and re-arranged as follows.

**The header panel** holds:

- logo, name, ticker · industry · market cap, and the price with its day move;
- the tab row and the held-symbol chip switcher;
- "Open in Chart".

On the tabs other than Overview, the user's position shows inline in the header. The price
chart sits on Overview only; the watchlist rail sits beside every tab.

**Overview** splits into two columns:

| Left (8) | Right (4) |
|---|---|
| Price chart | Your position |
| Performance | Investment snapshot (the five verdicts) |
| Range statistics | Analysts, Funds and Congress |
| Thesis and risks | Capital structure |
| | Next earnings |
| | Company facts |

**The other tabs** contain:

| Tab | Content |
|---|---|
| Financials | Revenue and profit; the step-by-step from revenue to profit; quarterly margins; cash and debt; assets and liabilities; statements table |
| Statistics | Ratio groups; valuation vs its own history; ratios by year (chart and table) |
| Peers | Comparison table; quality vs valuation quadrant |
| Earnings | Next earnings; beat record; signals; EPS vs estimate; annual EPS |
| Funds | Ownership summary; holders table |
| Congress | Ownership summary; members table |
| Filings | Insider sentiment; insider activity; insider transactions; SEC filings |
| News | Company news |
| Guide | Snapshot guide; worked combinations |

The verdict wording and thresholds stay in `lib/snapshot.js`, `lib/quadrant.js` and
`lib/guide.js`. The restyle changes presentation only.

### 6.3 Boards

- **Board tabs**: Chart · the user's boards · "+ New board" · "Edit board" (custom boards only).
- **Chart** is the existing workspace, restyled. It keeps:
  - the tool rail on the left (crosshair, price line, trend line, text, measure, eraser);
  - 1, 2 or 4 panes;
  - the toolbar: symbol, ranges, chart type, MA 20, MA 50, RSI and layout;
  - the right column: the watchlist, then the symbol panel (performance, seasonals, technicals,
    analyst gauge, earnings dots).
  - The active pane has a 1 px Ink 3 ring.
- **A custom board** is a 12-column grid with 64 px rows. Each panel has x, y, w and h in
  grid units.
  - A board has one **followed symbol**. Watchlist, heatmap and shelf rows set it, and the
    chart, symbol and news panels follow it ("Follows watchlist · GOOGL").
  - **Edit mode** shows:
    - a toolbar with the name field, Add panel, a hint, Delete board, Cancel and Save;
    - panels outlined with 1 px dashed Ink 3, plus grip, remove and corner-resize handles;
    - 12 column guides;
    - a drop zone (accent at 16% with a dashed accent outline) that tracks the snap target.
  - Dropping onto a panel pushes that panel down, then the grid compacts upward. Panel bodies are
    inert while editing.
  - Cancel restores the board as it was when Edit was pressed.
  - **Panel library**: Watchlist, Price chart, Today heatmap, Your earnings, News, Symbol stats,
    Positions, Allocation, Discover shelf, Smart money, Vs the US 500, Net worth.
  - Boards are saved per browser (`saxodash:boards`), like the chart workspace.
  - On phone, panels stack in reading order and editing is off.

### 6.4 Phone (< 760 px)

- Bottom bar: Overview · Portfolio · Research · Discover · More. "More" opens a sheet with
  Boards, Earnings, Investors, Analytics, Money and Settings.
- The header becomes the page title, the value pill and the account button.
- One column, in the order panels appear in the source. Tables hide `hidem` columns, and the
  Chart tool rail becomes a horizontal strip.

---

## 7. Implementation rules

- **One source of colour.** `src/lib/theme.js` exports `THEMES`, `MOVES` and `themeVars()`.
  `ThemeProvider` writes the variables onto `<html>`. Tailwind's `@theme` maps roles to utilities:
  - surfaces: `bg-page`, `bg-pane`, `bg-raised`, `bg-tile`, `bg-pill`, `bg-track`;
  - text: `text-ink`, `text-ink-2`, `text-ink-3`, `text-up`, `text-down`, `text-warn`,
    `text-earn`;
  - borders: `border-line`, …
- **Charts** read `useChartColors()`, which returns resolved hex values for the active theme and
  moves, and re-renders on change. `withAlpha()` stays for hex inputs. No chart file holds a
  colour literal.
- **No palette classes.** After the migration no Tailwind colour-family class (`slate` through `rose`,
  with any colour prefix), no `bg-white`/`bg-black`/`text-white`/`text-black`, and no hex or `rgb()`
  literal may appear outside `theme.js`. `src/test/noPaletteClasses.test.js` enforces this, with a
  named allow-list: the white logo discs (`InstrumentLogo`, `InvestorAvatar`) and `withAlpha`'s
  `rgba()` composition in `lib/charts.js`. Shadows and scrims are theme roles (`shadow`, `scrim`).
- **Primitives** live in `src/components/ui.jsx` and keep their names: Card is the panel, with
  `context`, `title` and `menu`.
- **Motion**: 150 ms for hover and focus, 200 ms for page fade-in. `prefers-reduced-motion`
  turns both off.
- **Accessibility**:
  - Text contrast ≥ 4.5:1 for Ink 3 on pane, in every theme.
  - Every interactive element has a visible 2 px `--sd-focus` ring.
  - Moves carry arrows. Charts have an `aria-label`, and a table view exists wherever the data
    matters.
- **Zero comments in generated code** (AGENTS.md); the reasoning goes in commits and PRs.

## 8. Do and don't

| Do | Don't |
|---|---|
| Put colour in data | Tint panels, headers or icons with the accent |
| Use one primary button per view | Use a blue link-colour for every action |
| Put status in a dot plus words | Use colour as the only signal |
| Write "Saxo needs re-authentication" | Write "Error 409" |
| Use "Example" tags on placeholder data | Show invented numbers as the user's own |
| Use the 12 type sizes | Add a 13th size |
| Draw a dotted line across a gap | Interpolate across missing days |

## 9. Data honesty (visual rules)

- An absent figure renders as "—" or "not returned". Never 0.
- Every panel's context row names its source and its as-of date.
- A stale source turns the dot to Warning and says why.
- Prices that are delayed or last-close are labelled so (`PriceBasisNote`).
- Placeholder or example rows carry the **Example** tag. Banking details stay off screenshots
  and mockups.
