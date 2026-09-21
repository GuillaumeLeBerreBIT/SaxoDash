import { useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'

import { instrumentLogoUrl } from '../lib/logos'
import { fmtPct } from '../lib/format'

/** The one container primitive for a bounded, self-contained unit of page
 *  content - reach for it when grouping information that's meaningfully
 *  distinct from its neighbors. A single number with a label is a StatRow
 *  or Metric, not its own Card; before adding a new Card, check whether a
 *  table/chart/StatStrip already on the same page shows the same
 *  information in another form (the 2026-09 audit's most common finding
 *  was a Card that turned out to duplicate one already on the page). */
export function Card({ children, className = '', padding = true, interactive = false, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-gradient-to-b from-zinc-900 to-zinc-900/70 border border-white/[0.06] border-t-white/[0.09] rounded-lg shadow-sm shadow-black/40 ${
        interactive ? 'hover:border-white/[0.12] cursor-pointer transition-colors duration-200' : ''
      } ${padding ? 'p-4 2xl:p-5' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/** `as` defaults to h2: PageHeader's h1 is the only page-level heading, so a
 *  CardHeader is that page's first section level for screen-reader
 *  navigation, not a third-level heading with nothing at h2 in between. Pass
 *  `as="h3"` only for a heading genuinely nested under another CardHeader. */
export function CardHeader({ title, subtitle, right, className = '', as: Heading = 'h2' }) {
  return (
    <div className={`flex items-start justify-between gap-3 2xl:gap-4 ${className}`}>
      <div>
        <Heading className="text-[var(--fig-sm)] font-medium text-zinc-200">{title}</Heading>
        {subtitle && <p className="text-[var(--fig-xs)] text-zinc-500 mt-0.5 2xl:mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function PageHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-end justify-between mb-5 2xl:mb-6">
      <div>
        <h1 className="text-[var(--fig-lg)] font-medium tracking-tight text-zinc-50">{title}</h1>
        {subtitle && <p className="text-[var(--fig-sm)] text-zinc-500 mt-1 2xl:mt-1.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

// The audit found 5+ ad hoc "primary button" treatments (bg-blue-600,
// bg-blue-500, bg-zinc-800, a bordered outline, plus a permanently-disabled
// one) and 3 different input heights with no shared source. Button/Input/
// Select below are that shared source - every action button, text field, and
// simple picker in the app should render through one of these three rather
// than inventing new bg-*/border-*/h-* combinations.
const buttonVariants = {
  primary: 'bg-blue-500 text-white hover:bg-blue-400',
  secondary: 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600',
  ghost: 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]',
  destructive: 'bg-red-500/90 text-white hover:bg-red-500',
}

const buttonSizes = {
  sm: 'h-8 px-2.5 text-[var(--fig-xs)] gap-1.5',
  md: 'h-9 px-3.5 text-[var(--fig-sm)] gap-2',
}

/** `variant`: primary (the one main action per view), secondary (everything
 *  else that isn't primary or destructive - Export, Connect, Add), ghost
 *  (a tertiary action inside a denser context), destructive (delete/remove).
 *  Don't use `disabled` to hide a feature that will never ship (see the
 *  audit's SymbolBar Buy/Sell finding) - remove the button instead. */
export function Button({ variant = 'secondary', size = 'md', type = 'button', className = '', children, ...props }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-md font-medium disabled:opacity-40 disabled:pointer-events-none ${
        buttonVariants[variant] || buttonVariants.secondary
      } ${buttonSizes[size] || buttonSizes.md} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

/** The one text-input treatment (lifted from Transactions' existing search
 *  field, the most-used instance of this pattern already in the app). */
export function Input({ className = '', ...props }) {
  return (
    <input
      className={`h-9 px-3 bg-zinc-950 border border-zinc-800 rounded-md text-[var(--fig-sm)] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 outline-none ${className}`}
      {...props}
    />
  )
}

/** A native &lt;select&gt;, styled to match Input. Native selects already carry
 *  full keyboard and screen-reader support for free - reach for the custom
 *  `Menu` pattern (components/research/menu.jsx) only when the picker needs
 *  more than "choose one option from a flat list" (multi-item, checkable
 *  rows, or an inline search). */
export function Select({ className = '', children, ...props }) {
  return (
    <select
      className={`h-9 px-3 bg-zinc-950 border border-zinc-800 rounded-md text-[var(--fig-sm)] text-zinc-100 focus:border-zinc-600 outline-none ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

const statTones = {
  blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/15',
  emerald: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15',
  red: 'bg-red-500/10 text-red-400 border border-red-500/15',
  zinc: 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/70',
}

const badgeTones = {
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/15',
  zinc: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/70',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/15',
  red: 'bg-red-500/10 text-red-400 border-red-500/15',
  teal: 'bg-teal-500/10 text-teal-400 border-teal-500/15',
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
}

/** Fills a chart's space with a message instead of rendering an empty plot.
 *
 *  Recharts draws nothing at all for a zero- or one-point series when dots are
 *  disabled, so without this a chart that loaded perfectly well looks broken.
 */
export function ChartPlaceholder({ height = 260, tone = 'zinc', children }) {
  return (
    <div
      className={`flex items-center justify-center text-center px-6 text-[var(--fig-xs)] ${
        tone === 'red' ? 'text-red-400' : 'text-zinc-500'
      }`}
      style={{ height }}
    >
      {children}
    </div>
  )
}

const alertTones = {
  error: 'bg-red-500/10 border-red-500/20 text-red-300',
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
  info: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
}

/** A page/section-level status banner - replaces the ad hoc
 *  `&lt;div className="text-red-400 text-sm"&gt;Failed to load...&lt;/div&gt;`
 *  every page's error branch currently hand-rolls independently. */
export function Alert({ tone = 'error', children, className = '' }) {
  return (
    <div className={`rounded-md border px-3.5 py-3 text-[var(--fig-sm)] ${alertTones[tone] || alertTones.error} ${className}`}>
      {children}
    </div>
  )
}

/** A centered "nothing here yet" message - distinct from ChartPlaceholder
 *  (which fills a fixed-height chart area) since this can sit inside a Card
 *  or table body of any height (an empty transaction list, no budgets set). */
export function EmptyState({ title, hint, className = '' }) {
  return (
    <div className={`text-center py-8 px-4 ${className}`}>
      <div className="text-[var(--fig-sm)] text-zinc-400">{title}</div>
      {hint && <div className="mt-1 text-[var(--fig-xs)] text-zinc-600">{hint}</div>}
    </div>
  )
}

/** A small "i" that reveals an explanation on hover or keyboard focus.
 *
 *  For jargon next to a chart or metric that isn't self-explanatory - what a
 *  Monte Carlo band means, why Sharpe uses a risk-free rate. Not a click
 *  target: nothing else on the page depends on it opening or closing.
 */
export function InfoTip({ children }) {
  const [open, setOpen] = useState(false)
  // Opens upward by default (the common case: a trigger below the fold with
  // room above it) but flips below when there genuinely isn't room - a long
  // explanation on a trigger near the top of a card otherwise renders with
  // its opening lines pushed off the top of the viewport, unreadable. 160px
  // is a rough "a few lines of tooltip" budget, not an exact measurement of
  // this tip's actual height (which varies per caller and isn't known until
  // it renders) - good enough to catch the real failure case.
  const [openBelow, setOpenBelow] = useState(false)
  const triggerRef = useRef(null)
  const id = useId()

  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    setOpenBelow(rect ? rect.top < 160 : false)
    setOpen(true)
  }
  const hide = () => setOpen(false)

  return (
    <span className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={id}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="text-zinc-500 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded-full"
      >
        <Info size={13} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`absolute z-20 left-1/2 -translate-x-1/2 w-64 rounded-md border border-white/10 bg-zinc-900 px-3 py-2 text-[var(--fig-2xs)] leading-snug text-zinc-300 shadow-lg shadow-black/40 ${
            openBelow ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
        >
          {children}
        </span>
      )}
    </span>
  )
}

export function Badge({ tone = 'zinc', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center text-[var(--fig-2xs)] font-medium tracking-wide uppercase px-1.5 py-0.5 rounded border ${
        badgeTones[tone] || badgeTones.zinc
      } ${className}`}
    >
      {children}
    </span>
  )
}


/** Underline tab strip for switching between a page's sections (Analytics'
 *  Performance/Risk/Projection, Research's Overview/Valuation/Peers/...) -
 *  extracted from the identical markup both pages already hand-rolled. This
 *  is the "switch section" pattern; for "toggle a filter or range" (a chart's
 *  date range, a benchmark picker), use Pill/RangePills instead - that split
 *  is already how the app uses the two, just not written down until now. */
export function TabList({ children, className = '' }) {
  return <div className={`flex items-center gap-1 border-b border-white/[0.06] ${className}`}>{children}</div>
}

export function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active}
      className={`h-9 px-3.5 text-[var(--fig-sm)] font-medium border-b-2 -mb-px transition-colors ${
        active ? 'text-zinc-100 border-blue-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}

/** A row of headline stats as one bordered strip with dividers - the calm
 *  alternative to N separate single-stat cards. `vertical` stacks the rows
 *  regardless of viewport width, for use as a compact side card next to a chart. */
export function StatStrip({ children, className = '', vertical = false }) {
  return (
    <div
      className={`flex flex-col h-full rounded-lg border border-white/[0.06] bg-gradient-to-b from-zinc-900 to-zinc-900/70 divide-y divide-white/[0.06] ${
        vertical ? '' : 'sm:flex-row sm:divide-y-0 sm:divide-x'
      } ${className}`}
    >
      {children}
    </div>
  )
}

/** `tone` (a text-color class, e.g. `text-blue-400`) tints the label to mark
 *  this row as the strip's standout figure among siblings. `lead` steps the
 *  value up to the old single-stat card's size - for a strip's one figure
 *  that deserves top billing regardless of whether it needs a tint. */
export function StatRow({ label, value, badge, badgeTone = 'zinc', note, tone, lead = false }) {
  return (
    <div className="flex-1 p-3.5 2xl:p-4">
      <div className={`text-[var(--fig-2xs)] font-medium uppercase tracking-wider ${tone || 'text-zinc-500'}`}>{label}</div>
      <div
        className={`mt-1.5 2xl:mt-2 font-semibold text-zinc-50 tracking-tight num font-mono whitespace-nowrap ${
          lead ? 'text-[clamp(20px,1.9vw,28px)]' : 'text-[clamp(18px,1.7vw,24px)]'
        }`}
      >
        {value}
      </div>
      {(badge || note) && (
        <div className="mt-2 2xl:mt-2.5 flex items-center gap-2 flex-wrap">
          {badge && (
            <span
              className={`inline-flex items-center whitespace-nowrap text-[var(--fig-xs)] px-2 py-0.5 rounded-md font-medium num font-mono ${
                statTones[badgeTone] || statTones.zinc
              }`}
            >
              {badge}
            </span>
          )}
          {note && <span className="text-[var(--fig-xs)] text-zinc-500">{note}</span>}
        </div>
      )}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-white/[0.05] rounded ${className}`} />
}

/** A logo for `symbol` (elbstream.com - see lib/logos.js), rendering
 *  `fallback` instead when there's no symbol or the image fails to load.
 *  SymbolBar's letter avatar and Portfolio's holdings-table color dot both
 *  use this rather than each tracking their own load failure. */
export function InstrumentLogo({ symbol, size, className = '', fallback }) {
  // Tracks which symbol failed, not just whether one did - Research's
  // SymbolBar keeps one InstrumentLogo instance across symbol changes, so a
  // plain boolean would keep hiding the logo for every symbol after the
  // first 404.
  const [failedSymbol, setFailedSymbol] = useState(null)
  const src = symbol !== failedSymbol ? instrumentLogoUrl(symbol) : null

  if (!src) return fallback

  return (
    <img
      src={src}
      alt=""
      onError={() => setFailedSymbol(symbol)}
      style={{ width: size, height: size }}
      className={`object-contain bg-white shrink-0 ${className}`}
    />
  )
}

/** Today's % move, colored - the "how did today go" figure the watchlist
 *  rail, Dashboard's top positions and Portfolio's holdings table all show
 *  next to a ticker, TradingView-style. `null` (no live quote) reads as a
 *  dash rather than a false flat 0%. */
export function DayChange({ value, className = '' }) {
  const tone = value == null ? 'text-zinc-600' : Number(value) >= 0 ? 'text-emerald-400' : 'text-red-400'
  return <span className={`num font-mono ${tone} ${className}`}>{fmtPct(value)}</span>
}

/** A single button in a segmented toggle - Research's chart-range picker
 *  and the instrument search bar's asset-type filter share this. */
export function TBtn({ active, onClick, children, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={`h-7 px-2.5 rounded text-[var(--fig-xs)] font-medium transition-colors ${
        active ? 'bg-white/[0.09] text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
      }`}
    >
      {children}
    </button>
  )
}

/** A labelled figure with an optional sub-hint. Shared by OverviewTab,
 *  EarningsTab and SnapshotSection so they render metrics identically. */
export function Metric({ label, value, tone = 'text-zinc-100', hint }) {
  return (
    <div>
      <div className="text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide font-medium">{label}</div>
      <div className={`text-[var(--fig-md)] num font-mono mt-1 2xl:mt-1.5 ${tone}`}>{value}</div>
      {hint ? <div className="text-[var(--fig-2xs)] text-zinc-500 mt-0.5 num font-mono">{hint}</div> : null}
    </div>
  )
}

/** Metric's bordered sibling, for a figure that needs visual separation from
 *  its neighbors - a grid of risk stats, a week's summary tiles. The audit
 *  found this exact box (bg-white/[0.02] border border-white/[0.06]) already
 *  independently reimplemented as Analytics' MetricTile, Earnings'
 *  SummaryTile, and Research's Ratio; this is that box, promoted once. Reach
 *  for bare `Metric` instead when the tile doesn't need its own boundary
 *  (e.g. already inside a Card with siblings). */
export function MetricTile({ label, value, hint, tone = 'text-zinc-50', right }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-md p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[var(--fig-2xs)] text-zinc-500 font-medium uppercase tracking-wider">{label}</span>
        {right}
      </div>
      {value != null && (
        <div className={`mt-1.5 text-[var(--fig-lg)] font-semibold num font-mono tracking-tight ${tone}`}>{value}</div>
      )}
      {hint && <div className="mt-1 text-[var(--fig-2xs)] text-zinc-500">{hint}</div>}
    </div>
  )
}

/** Table header/body cell with the app's shared density scale - edge columns
 *  get more horizontal room than interior ones. Used by every data table
 *  (Dashboard's two, Portfolio Holdings, Transactions) so row density is
 *  governed from one place instead of copied per table. */
export function Th({ children, align = 'left', edge = false, className = '' }) {
  return (
    <th
      className={`font-medium ${edge ? 'px-4 2xl:px-5' : 'px-2 2xl:px-3'} py-1.5 2xl:py-2 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  )
}

/** `whitespace-nowrap` by default - a numeric or date cell should never wrap
 *  onto a second line (a large enough figure otherwise will, mid-number);
 *  every table already scrolls horizontally rather than reflowing (see the
 *  design system's table philosophy), so nowrap costs nothing it wasn't
 *  already the intended behavior. A cell that genuinely needs to wrap can
 *  still override via `className`. */
export function Td({ children, align = 'left', edge = false, className = '' }) {
  return (
    <td
      className={`whitespace-nowrap ${edge ? 'px-4 2xl:px-5' : 'px-2 2xl:px-3'} py-2 2xl:py-2.5 ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </td>
  )
}

/** A table body row with the app's shared border/hover/selected treatment -
 *  use instead of hand-copying `border-b border-white/[0.06] hover:bg-...`
 *  per table (the audit found both an older opaque `border-zinc-800` and a
 *  newer `border-white/[0.06]` convention coexisting; this is the newer one,
 *  standardized). */
export function Tr({ children, selected = false, className = '', ...props }) {
  return (
    <tr
      className={`border-b border-white/[0.06] last:border-0 ${
        selected ? 'bg-blue-500/[0.06]' : 'hover:bg-white/[0.03]'
      } ${className}`}
      {...props}
    >
      {children}
    </tr>
  )
}
