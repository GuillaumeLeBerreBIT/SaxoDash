# SaxoDash frontend design system

What "the design system" means in this repo, why each rule exists, and where
the code that enforces it lives. Written up after the 2026-09 page-by-page
redesign (Dashboard → Portfolio → Research → Analytics → Accounts → Spending
→ Transactions → Earnings) so the next person — human or Claude — doesn't
have to re-derive it from the audit conversation or from reading every
component cold.

**This doc explains the *why*. The code is the source of truth for the
*what*.** If a value here and the code disagree, trust the code and fix this
doc.

- `frontend/src/lib/charts.js` — the only place a hex chart color is defined
- `frontend/src/components/ui.jsx` — the only place a shared UI primitive is defined
- `frontend/src/index.css` — type scale, chart-height scale, semantic
  Tailwind-class reference, motion durations

## Philosophy

- **Professional, calm, dense.** This is a personal financial dashboard, not
  a marketing site or a consumer app — muted near-black/zinc palette,
  restrained accent colors, information density over whitespace-for-its-own-sake.
- **Flat over skeuomorphic.** `Card` (`ui.jsx`) is the one container
  language for every domain — investments, banking, research, earnings all
  read as the same product. The original `BankAccountTile` was a
  skeuomorphic gradient "credit card" widget (`rounded-2xl`, per-bank
  full-bleed gradient, a fake chip rectangle) — the single largest
  visual-language violation the original audit found, and the only
  `rounded-2xl` anywhere in the app. It was flattened to the shared `Card`
  language. **A later attempt to reintroduce a literal bank-card look**
  (accent-colored chip swatch, IBAN in a spaced monospace band, card aspect
  ratio) was implemented, screenshot-reviewed, and explicitly rejected on
  sight by design review ("doesnt look good ... this looks awfull now") —
  don't re-propose that specific direction without a genuinely new idea.
- **One green, one red, full stop.** Every gain/loss signal in the app —
  earnings surprises, P&L, spending vs. budget, drawdown — draws from the
  same two colors (`POSITIVE`/`NEGATIVE` in `lib/charts.js`). Never
  introduce a second red or a second green, and never inline a gain/loss hex
  directly in a component.
- **Primitive-first.** Before hand-writing `bg-zinc-950 border
  border-zinc-800 rounded text-xs ...`, check `ui.jsx` — that's almost
  certainly `Input` or `Select` already. A new pattern earns a shared
  primitive once it would otherwise be duplicated a second or third time
  (see `MetricTile`'s doc comment in `ui.jsx` for the precedent: it was
  promoted after being independently reimplemented three times).
- **Financial state is never color-only.** Pair a red/green signal with a
  sign, an icon, or a text label — not color alone.

## Color tokens (`frontend/src/lib/charts.js`)

The one source of chart color. Import from here for any SVG/canvas/recharts
`fill`/`stroke` prop — those can't take a Tailwind class.

| Export | Hex | Meaning |
|---|---|---|
| `BEAT` / `POSITIVE` | `#34d399` | The one green in the app — beat, gain, positive |
| `MISS` / `NEGATIVE` | `#f87171` | The one red in the app — miss, loss, negative |
| `ESTIMATE` | `#52525b` | Consensus figure, not yet judged |
| `REPORTED` | `#3b82f6` | Reported, but no surprise figure to judge it by |
| `PENDING` | `#f59e0b` | Report date passed, actual not posted yet — also used generically as "warning" (e.g. a budget between 80–100%) |
| `TARGET_TICK` | `#e4e4e7` | The estimate marker on a bullet bar once actuals are in |
| `TRACK` | `rgba(255,255,255,0.06)` | Empty bar track |
| `SERIES_INVESTMENTS` | = `POSITIVE` | Investments line on a multi-series chart (deliberately reuses the gain green) |
| `SERIES_BANK` | `#fbbf24` | Bank-balance line — amber-gold, not a `PENDING` warning despite the nearby hue |
| `SERIES_TOTAL` | `#60a5fa` | The headline line among faded siblings |
| `OTHER_SLICE` | `#52525b` | "Everything else" catch-all slice in a top-N+Other donut |
| `AXIS_TEXT` | `#71717a` | Chart tick/legend gray (zinc-500) |
| `CATEGORY_AXIS_TEXT` | `#a1a1aa` | A category axis label a reader identifies rows by — more contrast than `AXIS_TEXT` (zinc-400) |
| `HOLDINGS_PALETTE` (internal) | 10-hue set | Per-holding/per-category identity — deliberately excludes green/red, which are reserved for gain/loss everywhere else |

Helpers: `withAlpha(hex, alpha)` for tinted variants, `colorForTicker(t)` /
`colorForCategory(c)` for deterministic per-identity colors, `surpriseColor(v)`
/ `surpriseSign(v)` for the beat/miss/inline split, `gridProps` /
`axisProps` / `dateAxisProps` / `moneyAxisProps` / `chartTooltipProps` for
shared recharts prop bundles.

## Semantic Tailwind-class reference (`frontend/src/index.css`)

For DOM text/background colors (not chart props), reach for the Tailwind
class — these hex values exist in CSS only for the few places that can't use
a class at all:

| Role | Tailwind class | Hex |
|---|---|---|
| Background | `bg-zinc-950` | `#09090b` |
| Surface (card) | `bg-zinc-900` (gradiented — see `Card`) | |
| Elevated surface | `bg-zinc-900` + `shadow-lg`/`2xl` | |
| Border | `border-white/[0.06]` | |
| Border (emphasis) | `border-white/[0.10]` | |
| Text primary | `text-zinc-50` / `text-zinc-100` | |
| Text secondary | `text-zinc-400` | |
| Text muted | `text-zinc-500` / `text-zinc-600` | |
| Positive | `text-emerald-400` | matches `BEAT`/`POSITIVE` |
| Negative | `text-red-400` | matches `MISS`/`NEGATIVE` |
| Warning | `text-amber-400` | matches `PENDING` |
| Info / accent | `text-blue-400` | matches `REPORTED` |

## Type scale (`--fig-*` custom properties)

`2xs 11 · xs 12 · sm 13 · md 15 · lg 19 · xl 22 · 2xl 24` (px), referenced as
`text-[var(--fig-lg)]`. This scale was audited against a "feels zoomed in"
complaint and confirmed restrained — don't introduce a new size outside this
list; for a bigger hero figure, reuse `StatRow`'s `lead` clamp() instead of
adding a `--fig-3xl`.

Chart heights: `--chart-h-sm` 200px (donut/small panel) · `--chart-h-md`
220px (standard panel) · `--chart-h-lg` 260px (primary chart).

Motion: `--motion-fast` 150ms (hover/focus feedback) · `--motion-page` 200ms
(route change, expand/collapse). Don't add a third duration without tying it
to what it communicates.

## Component primitives (`frontend/src/components/ui.jsx`)

| Primitive | Use it for |
|---|---|
| `Card` / `CardHeader` | The one bounded-content container for every domain. Not for a single restated number — see below. |
| `PageHeader` | The one page-level `h1` + subtitle + right-aligned action slot. |
| `Button` (`variant`: primary/secondary/ghost/destructive, `size`: sm/md) | Every action button. `primary` = the one main action per view; `secondary` = everything else (Export, Connect, Add); `ghost` = a tertiary action in a dense context; `destructive` = delete/remove. Never use `disabled` to hide a feature that will never ship — remove the button. |
| `Input` | The one text-field treatment. |
| `Select` | The one native `<select>` treatment, styled to match `Input`. Reach for `research/menu.jsx`'s `Menu` only when the picker needs more than "choose one from a flat list". |
| `StatStrip` / `StatRow` | A row of headline stats as one bordered strip with dividers — the calm alternative to N separate single-stat cards. |
| `MetricTile` | A bordered figure tile for a grid of stats that needs visual separation from its neighbors (risk stats, week-summary tiles). |
| `Metric` | `MetricTile`'s borderless sibling — for a figure already inside a `Card` with siblings, no separate boundary needed. |
| `Badge` (`tone`: blue/zinc/amber/red/teal/emerald) | Categorical identity tags (transaction type, status) — a separate system from the chart gain/loss policy. |
| `Alert` (`tone`: error/warning/info) | Page/section-level status banner — replaces ad hoc `<div className="text-red-400 text-sm">`. |
| `EmptyState` | A centered "nothing here yet" message inside a `Card`/table body of any height. |
| `ChartPlaceholder` | Fills a chart's space with a message instead of an empty plot — Recharts silently renders nothing for a 0/1-point series. |
| `InfoTip` | A small "i" that reveals an explanation on hover/focus — for jargon next to a metric, not a click target. Flips below the trigger when there isn't room above (viewport-collision handling). For anything longer than a couple of sentences (Analytics' Risk & Return definitions), use an inline expand/collapse toggle instead — a tooltip box reads poorly with a lot of text at any position. |
| `TabList` / `TabButton` | Underline tab strip for switching a page's *sections* (Performance/Risk/Projection). For toggling a filter/range instead, use `Pill`/`RangePills`. |
| `TBtn` | A single button in a segmented toggle (chart-range picker, asset-type filter). |
| `Skeleton` | Loading placeholder block. |
| `InstrumentLogo` | Ticker logo with fallback-on-error, shared so load-failure tracking isn't reimplemented per caller. |
| `DayChange` | Colored today's-%-move figure; `null` reads as a dash, never a false flat 0%. |
| `Th` / `Td` / `Tr` | Shared table cell/row density and border/hover treatment. `Td` defaults to `whitespace-nowrap` — a numeric/date cell should never wrap onto a second line; override via `className` when a cell genuinely needs to wrap. |

## Card philosophy

- `Card` is the one container language for every domain — no second visual
  grammar, ever (no gradient cards, no differently-rounded cards, no
  alternate border treatment for "this domain feels different").
- A single number with a label is a `StatRow` or `Metric`, not its own
  `Card`.
- Before adding a new `Card`, check whether a table/chart/`StatStrip`
  already on the same page shows the same information in another form — a
  `Card` duplicating information already on the page was the audit's most
  common single finding.

## Known anti-patterns (found and fixed)

Kept here so they don't get quietly reintroduced a second time:

- **Skeuomorphic gradient card** for `BankAccountTile` (`rounded-2xl`,
  per-bank gradient, fake chip) — and the later literal bank-card
  reintroduction attempt, rejected. See Philosophy above.
- **Hardcoded chart hex colors** instead of `lib/charts.js` imports — found
  8+ times in the original audit, and recurred twice more in later pages
  (`SpendingTrendChart`'s bar fill, `BudgetProgressBar`'s bar colors) —
  it's an easy mistake to make fresh, always grep for a literal `#` in a
  `fill`/`stroke`/`background` prop before shipping a chart.
- **Hand-rolled input/select/button markup** duplicating `Input`/`Select`/
  `Button` — found repeatedly (`BudgetSection`, `BudgetProgressBar`,
  `PeriodSelector`, `Transactions`' search field and Export button).
- **Hand-rolled icon SVGs** duplicating an icon already imported from
  `lucide-react` elsewhere in the app (Earnings' local `Chevron` component
  duplicating `ChevronLeft`/`ChevronRight`, already used by `Transactions`
  and `AccountTransactions`).
- **The same data shown twice on one page** — `BankAccountTile` used to
  inline its own "recent transactions" list *and* `RecentTransactionsPanel`
  showed the same activity separately. Pick one source of truth.
- **A drill-down page with no context** — `AccountTransactions` used to show
  no bank name, IBAN, or balance, so clicking into an account lost track of
  which one you were looking at.
- **CSS Grid's default `align-items: stretch`** silently stretching a
  shorter sibling card to match a taller one, leaving a mostly-empty bordered
  box. Add `items-start` to the grid container when two cards in a row have
  genuinely different natural heights.
- **`InfoTip` with no viewport-collision handling** — clipped when triggered
  near the top of the page. Fixed by flipping the tooltip below the trigger
  when there isn't ~160px of room above it.
- **Missing zero-guards** — a division with no zero check producing literal
  `NaN%` text; a chart component silently rendering nothing (not even an
  empty state) for a zero-length series.

## Workflow for a new page or component

The pattern used across the full 2026-09 redesign pass:

1. **Critique** — read the existing page/component against this doc: check
   for hardcoded chart colors, hand-rolled markup that duplicates a
   primitive, a second visual grammar, or a `Card` restating information
   already on the page.
2. **Implement** — use shared primitives; only add a new one to `ui.jsx` /
   `lib/charts.js` if the same pattern would otherwise be duplicated a
   second or third time.
3. **Verify** — `npx vitest run`, `npx eslint <touched files>`, `npm run
   build`. Add/adjust tests alongside the change (see `AGENTS.md`).
4. **Screenshot-review** — at both desktop (1440px) and mobile (390px)
   width, using the dev server plus a Django-issued JWT dropped into
   `localStorage` (`access`/`refresh`/`username` keys). See the
   `saxodash-design-system` skill for the exact harness recipe, or the
   general `control-ui` skill for the underlying pattern.
5. **Fix** whatever the screenshot reveals, re-verify, then report back with
   a concise per-item summary (what changed, what was verified).

## History

Full page-by-page pass (2026-09): Dashboard → Portfolio → Research →
Analytics → Accounts → Spending → Transactions → Earnings, each run through
the workflow above. Adjacent plan docs from the same period:
`docs/superpowers/plans/2026-09-19-accounts-page-redesign.md`,
`docs/superpowers/plans/2026-09-19-spending-dashboard-redesign.md`,
`docs/superpowers/plans/2026-09-20-saxo-sim-price-and-sector-fix.md`.
