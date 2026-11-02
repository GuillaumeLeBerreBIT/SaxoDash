import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, Info, MoreHorizontal } from 'lucide-react'

import { instrumentLogoUrl } from '../lib/logos'
import { Dialog, Menu, Tooltip } from './overlays'

const STATUS_DOT_TONES = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  error: 'bg-error',
  earn: 'bg-earn',
  off: 'bg-ink-3',
}

export function StatusDot({ tone = 'ok', className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block w-[7px] h-[7px] rounded-full shrink-0 ${STATUS_DOT_TONES[tone] || STATUS_DOT_TONES.ok} ${className}`}
    />
  )
}

const PANEL_MENU_BUTTON =
  'w-7 h-7 shrink-0 rounded-[7px] grid place-items-center text-ink-3 hover:bg-hover hover:text-ink'

function PanelMenu({ label, items }) {
  const button = (
    <button type="button" aria-label={label} className={PANEL_MENU_BUTTON}>
      <MoreHorizontal size={16} aria-hidden="true" />
    </button>
  )
  return Array.isArray(items) ? <Menu trigger={button} items={items} /> : button
}

function PanelHead({ context, dot, title, right, menu, as: Heading = 'h2', className = '' }) {
  const menuLabel = `${title || context || 'Panel'} options`
  return (
    <div className={`flex flex-wrap md:flex-nowrap items-start justify-between gap-x-2.5 gap-y-2 ${className}`}>
      <div className="min-w-0">
        {context && (
          <div className="flex items-center gap-2 min-w-0 text-[13px] font-medium text-ink">
            {dot && <StatusDot tone={dot} />}
            <span className="min-w-0 truncate">{context}</span>
          </div>
        )}
        {title && (
          <Heading className={`text-[17px] font-bold tracking-[-0.005em] text-ink [text-wrap:balance] ${context ? 'mt-1.5' : ''}`}>
            {title}
          </Heading>
        )}
      </div>
      {(right || menu) && (
        <div className="flex items-center gap-1.5 min-w-0 max-w-full">
          {right}
          {menu && <PanelMenu label={menuLabel} items={menu} />}
        </div>
      )}
    </div>
  )
}

function panelPadding(padding, flush) {
  if (!padding) return ''
  return flush ? 'pt-[14px] pb-[18px]' : 'pt-[14px] px-[18px] pb-[18px]'
}

/** The one container primitive for a bounded, self-contained unit of page
 *  content - reach for it when grouping information that's meaningfully
 *  distinct from its neighbors. A single number with a label is a StatRow
 *  or Metric, not its own Card; before adding a new Card, check whether a
 *  table/chart/StatStrip already on the same page shows the same
 *  information in another form (the 2026-09 audit's most common finding
 *  was a Card that turned out to duplicate one already on the page). */
export function Card({
  children,
  className = '',
  padding = true,
  interactive = false,
  onClick,
  context,
  dot,
  title,
  right,
  menu,
  flush = false,
  titleAs = 'h2',
}) {
  const hasHead = Boolean(context || title || right || menu)
  const activate = onClick
    ? {
        role: 'button',
        tabIndex: 0,
        onKeyDown: (event) => {
          if (event.target !== event.currentTarget) return
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          onClick(event)
        },
      }
    : {}
  return (
    <div
      onClick={onClick}
      {...activate}
      className={`sd-panel bg-pane rounded-xl min-w-0 ${
        interactive ? 'hover:bg-hover cursor-pointer transition-colors duration-200' : ''
      } ${panelPadding(padding, flush)} ${className}`}
    >
      {hasHead && (
        <PanelHead
          context={context}
          dot={dot}
          title={title}
          right={right}
          menu={menu}
          as={titleAs}
          className={`mb-3.5 ${flush ? 'px-[18px]' : ''}`}
        />
      )}
      {children}
    </div>
  )
}

/** `as` defaults to h2: PageHeader's h1 is the only page-level heading, so a
 *  CardHeader is that page's first section level for screen-reader
 *  navigation, not a third-level heading with nothing at h2 in between. Pass
 *  `as="h3"` only for a heading genuinely nested under another CardHeader. */
export function CardHeader({ title, subtitle, right, className = '', as = 'h2' }) {
  return <PanelHead context={subtitle} title={title} right={right} as={as} className={className} />
}

export function PageHeader({ title, subtitle, right }) {
  return (
    <div className="flex flex-wrap md:flex-nowrap items-end justify-between gap-x-4 gap-y-3 md:gap-x-0 md:gap-y-0 mb-5 2xl:mb-6">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-tight text-ink [text-wrap:balance]">{title}</h1>
        {subtitle && <p className="text-[14px] text-ink-2 mt-1 2xl:mt-1.5">{subtitle}</p>}
      </div>
      {right && <div className="flex min-w-0 max-w-full">{right}</div>}
    </div>
  )
}

// The audit found 5+ ad hoc "primary button" treatments (two different blue
// fills, a dark grey fill, a bordered outline, plus a permanently-disabled
// one) and 3 different input heights with no shared source. Button/Input/
// Select below are that shared source - every action button, text field, and
// simple picker in the app should render through one of these three rather
// than inventing new bg-*/border-*/h-* combinations.
const buttonVariants = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'sd-raised bg-raised text-ink hover:bg-hover',
  ghost: 'bg-transparent text-ink-2 hover:text-ink hover:bg-hover',
  danger: 'bg-transparent text-error hover:bg-down-subtle',
  destructive: 'bg-transparent text-error hover:bg-down-subtle',
}

const buttonSizes = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5',
  md: 'h-8 px-3.5 text-[13px] gap-1.5',
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
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg font-semibold disabled:opacity-40 disabled:pointer-events-none ${
        buttonVariants[variant] || buttonVariants.secondary
      } ${buttonSizes[size] || buttonSizes.md} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

const FIELD = 'h-[34px] px-3 bg-track border border-line-input rounded-lg text-[14px] text-ink outline-none'

/** The one text-input treatment (lifted from Transactions' existing search
 *  field, the most-used instance of this pattern already in the app). */
export function Input({ className = '', ...props }) {
  return <input className={`${FIELD} placeholder:text-ink-3 ${className}`} {...props} />
}

/** A native &lt;select&gt;, styled to match Input. Native selects already carry
 *  full keyboard and screen-reader support for free - reach for the custom
 *  `Menu` pattern (components/research/menu.jsx) only when the picker needs
 *  more than "choose one option from a flat list" (multi-item, checkable
 *  rows, or an inline search). */
export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${FIELD} ${className}`} {...props}>
      {children}
    </select>
  )
}

const WARN_SURFACE = 'bg-[color-mix(in_srgb,var(--sd-warn)_14%,transparent)]'
const WARN_TEXT = 'text-warn-text'

const TAG_TONES = {
  neutral: 'sd-raised bg-pill text-ink-2',
  held: 'bg-accent-subtle text-held',
  earn: 'bg-earn-subtle text-earn',
  warn: `${WARN_SURFACE} ${WARN_TEXT}`,
  example: `${WARN_SURFACE} ${WARN_TEXT}`,
  up: 'bg-up-subtle text-up',
  down: 'bg-down-subtle text-down',
}

export function Tag({ tone, children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center h-[22px] px-2 rounded-md text-[11px] font-semibold whitespace-nowrap ${
        TAG_TONES[tone] || TAG_TONES.neutral
      } ${className}`}
    >
      {children}
    </span>
  )
}

const LEGACY_TONE_TO_TAG = {
  blue: 'held',
  zinc: 'neutral',
  amber: 'warn',
  red: 'down',
  teal: 'earn',
  emerald: 'up',
}

/** Fills a chart's space with a message instead of rendering an empty plot.
 *
 *  Recharts draws nothing at all for a zero- or one-point series when dots are
 *  disabled, so without this a chart that loaded perfectly well looks broken.
 */
export function ChartPlaceholder({ height = 260, tone = 'zinc', children }) {
  return (
    <div
      className={`flex items-center justify-center text-center px-6 text-[12px] ${
        tone === 'red' ? 'text-error' : 'text-ink-3'
      }`}
      style={{ height }}
    >
      {children}
    </div>
  )
}

const alertTones = {
  error: { surface: 'bg-down-subtle', dot: 'error' },
  warning: { surface: WARN_SURFACE, dot: 'warn' },
  info: { surface: 'bg-accent-subtle', dot: 'off' },
}

/** A page/section-level status banner - replaces the ad hoc failed-to-load
 *  line every page's error branch currently hand-rolls independently. */
export function Alert({ tone = 'error', children, className = '' }) {
  const { surface, dot } = alertTones[tone] || alertTones.error
  return (
    <div className={`flex items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-[13px] text-ink ${surface} ${className}`}>
      <StatusDot tone={dot} className="mt-[5px]" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** A centered "nothing here yet" message - distinct from ChartPlaceholder
 *  (which fills a fixed-height chart area) since this can sit inside a Card
 *  or table body of any height (an empty transaction list, no budgets set). */
export function EmptyState({ title, hint, className = '' }) {
  return (
    <div className={`text-center py-8 px-4 ${className}`}>
      <div className="text-[14px] text-ink-2">{title}</div>
      {hint && <div className="mt-1 text-[12px] text-ink-3">{hint}</div>}
    </div>
  )
}

/** The one modal/dialog primitive - same backdrop+panel pattern
 *  CommandPalette already uses, generalized. Reach for this instead of a
 *  bespoke overlay whenever a page needs to collect input in a focused
 *  surface (a form, a confirmation) rather than inline on the page. */
export function Modal({ title, children, onClose }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={title}>
      {children}
    </Dialog>
  )
}

/** A small "i" that reveals an explanation on hover or keyboard focus.
 *
 *  For jargon next to a chart or metric that isn't self-explanatory - what a
 *  Monte Carlo band means, why Sharpe uses a risk-free rate. Not a click
 *  target: nothing else on the page depends on it opening or closing.
 */
export function InfoTip({ children, label }) {
  const [open, setOpen] = useState(false)
  return (
    <Tooltip content={children} open={open} onOpenChange={setOpen}>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className="text-ink-3 hover:text-ink rounded-full"
      >
        <Info size={13} />
      </button>
    </Tooltip>
  )
}

export function Badge({ tone = 'zinc', children, className = '' }) {
  return (
    <Tag tone={LEGACY_TONE_TO_TAG[tone] || 'neutral'} className={className}>
      {children}
    </Tag>
  )
}


/** Underline tab strip for switching between a page's sections (Analytics'
 *  Performance/Risk/Projection, Research's Overview/Valuation/Peers/...) -
 *  extracted from the identical markup both pages already hand-rolled. This
 *  is the "switch section" pattern; for "toggle a filter or range" (a chart's
 *  date range, a benchmark picker), use Pill/RangePills instead - that split
 *  is already how the app uses the two, just not written down until now. */
export function TabList({ children, label, className = '' }) {
  return (
    <div role="tablist" aria-label={label} className={`flex items-center gap-1 border-b border-line ${className}`}>
      {children}
    </div>
  )
}

const TAB_KEY_TARGET = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (index, count) => count - 1,
}

export function TabButton({ active, onClick, children, id, controls, className = '' }) {
  function onKeyDown(event) {
    const target = TAB_KEY_TARGET[event.key]
    if (!target) return
    const tabs = Array.from(event.currentTarget.closest('[role="tablist"]').querySelectorAll('[role="tab"]'))
    const next = tabs[target(tabs.indexOf(event.currentTarget), tabs.length)]
    if (!next) return
    event.preventDefault()
    next.focus()
    next.click()
  }

  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={!!active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`h-11 md:h-9 px-3 text-[15px] font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${
        active ? 'sd-tab text-ink border-accent' : 'text-ink-3 border-transparent hover:text-ink-2'
      } ${className}`}
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
      className={`sd-panel flex flex-col h-full rounded-xl bg-pane divide-y divide-line ${
        vertical ? '' : 'sm:flex-row sm:divide-y-0 sm:divide-x'
      } ${className}`}
    >
      {children}
    </div>
  )
}

const statTones = {
  blue: 'bg-accent-subtle text-held',
  emerald: 'bg-up-subtle text-up',
  red: 'bg-down-subtle text-down',
  zinc: 'bg-pill text-ink-2',
}

/** `tone` (a text-color class, e.g. `text-held`) tints the label to mark
 *  this row as the strip's standout figure among siblings. `lead` steps the
 *  value up to the old single-stat card's size - for a strip's one figure
 *  that deserves top billing regardless of whether it needs a tint. */
export function StatRow({ label, value, badge, badgeTone = 'zinc', note, tone, lead = false }) {
  return (
    <div className="flex-1 px-3.5 py-3 2xl:px-[18px] 2xl:py-3.5">
      <div className={`text-[12px] font-medium ${tone || 'text-ink-3'}`}>{label}</div>
      <div
        className={`mt-1 font-bold text-ink tracking-[-0.01em] num whitespace-nowrap ${
          lead ? 'text-[26px]' : 'text-[20px]'
        }`}
      >
        {value}
      </div>
      {(badge || note) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {badge && (
            <span
              className={`inline-flex items-center h-[22px] px-2 rounded-md whitespace-nowrap text-[11px] font-semibold num ${
                statTones[badgeTone] || statTones.zinc
              }`}
            >
              {badge}
            </span>
          )}
          {note && <span className="text-[12px] text-ink-3">{note}</span>}
        </div>
      )}
    </div>
  )
}

export function Skeleton({ className = '', ...props }) {
  return <div className={`animate-pulse bg-tile rounded ${className}`} {...props} />
}

const LETTER_AVATAR_TEXT = [
  [28, 'text-[11px]'],
  [Infinity, 'text-[12px]'],
]

export function LetterAvatar({ symbol, size, chars = 1, className = 'rounded' }) {
  const textSize = LETTER_AVATAR_TEXT.find(([max]) => size <= max)[1]
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`shrink-0 bg-pill flex items-center justify-center ${textSize} font-bold text-ink ${className}`}
    >
      {symbol ? symbol.slice(0, chars).toUpperCase() : null}
    </span>
  )
}

/** A logo for `symbol` (elbstream.com - see lib/logos.js), rendering
 *  `fallback` instead when there's no symbol or the image fails to load.
 *  SymbolBar's letter avatar and Portfolio's holdings-table color dot both
 *  use this rather than each tracking their own load failure. */
export function InstrumentLogo({ symbol, size = 28, className = '', fallback }) {
  // Tracks which symbol failed, not just whether one did - Research's
  // SymbolBar keeps one InstrumentLogo instance across symbol changes, so a
  // plain boolean would keep hiding the logo for every symbol after the
  // first 404.
  const [failedSymbol, setFailedSymbol] = useState(null)
  const src = symbol !== failedSymbol ? instrumentLogoUrl(symbol) : null

  if (!src) {
    return fallback === undefined
      ? <LetterAvatar symbol={symbol} size={size} chars={2} className="rounded-full" />
      : fallback
  }

  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => setFailedSymbol(symbol)}
      style={{ width: size, height: size, borderRadius: '50%', padding: size >= 24 ? 3 : 1 }}
      className={`object-contain bg-white ring-1 ring-line shrink-0 ${className}`}
    />
  )
}

export function Move({ value, digits = 2, className = '' }) {
  if (value == null || Number.isNaN(Number(value))) {
    return <span className={`num whitespace-nowrap text-ink-3 ${className}`}>—</span>
  }
  const n = Number(value)
  const magnitude = Math.abs(n).toFixed(digits)
  if (Number(magnitude) === 0) {
    return <span className={`num whitespace-nowrap text-flat ${className}`}>{magnitude}%</span>
  }
  const up = n > 0
  return (
    <span className={`num whitespace-nowrap ${up ? 'text-up' : 'text-down'} ${className}`}>
      {up ? '▲' : '▼'} {magnitude}%
    </span>
  )
}

/** Today's % move, colored - the "how did today go" figure the watchlist
 *  rail, Dashboard's top positions and Portfolio's holdings table all show
 *  next to a ticker, TradingView-style. `null` (no live quote) reads as a
 *  dash rather than a false flat 0%. */
export function DayChange({ value, className = '' }) {
  return <Move value={value} className={className} />
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
      className={`relative h-7 px-3 rounded-[7px] text-[13px] font-semibold whitespace-nowrap transition-colors after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-[max(100%,2.75rem)] after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] md:after:hidden ${
        active ? 'bg-selected text-ink' : 'text-ink-3 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

export function Segmented({ options, value, onChange, label, className = '' }) {
  return (
    <div role="group" aria-label={label} className={`inline-flex flex-wrap gap-0.5 p-[3px] rounded-[9px] bg-track ${className}`}>
      {options.map((option) => (
        <TBtn key={option.value} active={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </TBtn>
      ))}
    </div>
  )
}

export function Chip({ active, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      className={`inline-flex items-center gap-1.5 h-11 md:h-7 px-[11px] rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors ${
        active
          ? 'bg-accent-subtle text-ink shadow-[inset_0_0_0_1px_var(--sd-ink-3)]'
          : 'sd-raised bg-raised text-ink-2 hover:text-ink'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function QueryState({ isLoading, error, onRetry, label, children }) {
  if (isLoading) {
    return (
      <Card>
        <div role="status" aria-label={`Loading ${label}`} className="flex flex-col gap-3">
          <span className="sr-only">Loading {label}…</span>
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Card>
    )
  }
  if (error) {
    return (
      <Card>
        <div role="alert" className="flex flex-col gap-3 items-start">
          <Alert className="w-full">Could not load {label}.</Alert>
          {onRetry && <Button onClick={() => onRetry()}>Retry</Button>}
        </div>
      </Card>
    )
  }
  return children
}

/** A labelled figure with an optional sub-hint. Shared by OverviewTab,
 *  EarningsTab and SnapshotSection so they render metrics identically. */
export function Metric({ label, value, tone = 'text-ink', hint }) {
  return (
    <div>
      <div className="text-[12px] text-ink-3 font-medium">{label}</div>
      <div className={`text-[17px] font-semibold num mt-1 ${tone}`}>{value}</div>
      {hint ? <div className="text-[12px] text-ink-3 mt-0.5 num">{hint}</div> : null}
    </div>
  )
}

const TILE_TONES = {
  up: 'text-up',
  down: 'text-down',
  warn: 'text-warn',
  earn: 'text-earn',
  flat: 'text-flat',
}

const TILE_TAGS = {
  block: { root: 'div', list: null, term: 'span', detail: 'div' },
  listItem: { root: 'li', list: 'dl', term: 'dt', detail: 'dd' },
}

function TileFrame({ label, right, children, sub, listItem = false }) {
  const tags = listItem ? TILE_TAGS.listItem : TILE_TAGS.block
  const Root = tags.root
  const List = tags.list
  const Term = tags.term
  const Detail = tags.detail
  const title = List ? (
    <Term className="flex items-baseline justify-between gap-2 text-[12px] text-ink-3">
      {label}
      {right}
    </Term>
  ) : (
    <div className="flex items-baseline justify-between gap-2">
      <Term className="text-[12px] text-ink-3">{label}</Term>
      {right}
    </div>
  )
  const content = (
    <>
      {title}
      {children(Detail)}
      {sub && <Detail className="mt-0.5 text-[12px] text-ink-2 num">{sub}</Detail>}
    </>
  )
  return <Root className="bg-tile rounded-[10px] px-3.5 py-3 min-w-0">{List ? <List>{content}</List> : content}</Root>
}

const TILE_VALUE = 'mt-1 text-[20px] font-bold tracking-[-0.01em] num whitespace-nowrap'

export function Tile({ label, value, sub, tone, right, listItem = false }) {
  const absent = value == null
  return (
    <TileFrame label={label} right={right} sub={sub} listItem={listItem}>
      {(Detail) => (
        <Detail className={`${TILE_VALUE} ${absent ? 'text-ink-3' : TILE_TONES[tone] || 'text-ink'}`}>{absent ? '—' : value}</Detail>
      )}
    </TileFrame>
  )
}

/** Metric's bordered sibling, for a figure that needs visual separation from
 *  its neighbors - a grid of risk stats, a week's summary tiles. The audit
 *  found this exact box already independently reimplemented as Analytics'
 *  MetricTile, Earnings' SummaryTile, and Research's Ratio; this is that box,
 *  promoted once. Reach for bare `Metric` instead when the tile doesn't need
 *  its own boundary (e.g. already inside a Card with siblings). */
export function MetricTile({ label, value, hint, tone = 'text-ink', right }) {
  return (
    <TileFrame label={label} right={right} sub={hint}>
      {(Detail) => value != null && <Detail className={`${TILE_VALUE} ${tone}`}>{value}</Detail>}
    </TileFrame>
  )
}

const HIDE_BELOW = { md: 'hidden md:table-cell', wide: 'hidden min-[1440px]:table-cell' }

/** Table header/body cell with the app's shared density scale - edge columns
 *  get more horizontal room than interior ones. Used by every data table
 *  (Dashboard's two, Portfolio Holdings, Transactions) so row density is
 *  governed from one place instead of copied per table. */
export function Th({ children, align = 'left', edge = false, hideBelow, className = '', ariaSort }) {
  const hideClass = HIDE_BELOW[hideBelow] ?? ''
  return (
    <th
      aria-sort={ariaSort}
      className={`h-[30px] text-[12px] font-medium text-ink-3 whitespace-nowrap ${edge ? 'px-[18px]' : 'px-2.5'} ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${hideClass} ${className}`}
    >
      {children}
    </th>
  )
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' }

export function SortableTh({ children, sortKey, sort, onSort, align = 'left', edge = false, hideBelow, className = '' }) {
  const active = sort && sort.key === sortKey ? sort.direction : null
  const Glyph = active === 'asc' ? ArrowUp : active === 'desc' ? ArrowDown : ChevronsUpDown
  return (
    <Th align={align} edge={edge} hideBelow={hideBelow} className={className} ariaSort={ARIA_SORT[active] ?? 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex h-11 min-w-11 items-center gap-1 font-medium hover:text-ink md:h-auto md:min-w-0 ${
          active ? 'text-ink' : ''
        } ${align === 'right' ? 'flex-row-reverse' : ''}`}
      >
        {children}
        <Glyph size={12} aria-hidden="true" className={active ? 'text-ink' : 'opacity-50'} />
      </button>
    </Th>
  )
}

/** `whitespace-nowrap` by default - a numeric or date cell should never wrap
 *  onto a second line (a large enough figure otherwise will, mid-number);
 *  every table already scrolls horizontally rather than reflowing (see the
 *  design system's table philosophy), so nowrap costs nothing it wasn't
 *  already the intended behavior. A cell that genuinely needs to wrap can
 *  still override via `className`. */
export function Td({ children, align = 'left', edge = false, hideBelow, className = '' }) {
  const hideClass = HIDE_BELOW[hideBelow] ?? ''
  return (
    <td
      className={`whitespace-nowrap h-[var(--sd-row-h)] text-[13.5px] ${edge ? 'px-[18px]' : 'px-2.5'} py-1.5 ${
        align === 'right' ? 'text-right num' : 'text-left'
      } ${hideClass} ${className}`}
    >
      {children}
    </td>
  )
}

/** A table body row with the app's shared border/hover/selected treatment -
 *  use instead of hand-copying a border and hover fill per table (the audit
 *  found two divider conventions coexisting; this is the newer one,
 *  standardized). */
export function Tr({ children, selected = false, className = '', ...props }) {
  return (
    <tr
      className={`border-t border-line ${
        selected ? 'bg-selected' : 'hover:bg-hover'
      } ${className}`}
      {...props}
    >
      {children}
    </tr>
  )
}
