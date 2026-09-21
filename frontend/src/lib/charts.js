import { fmtEur } from './format'

// This file is the ONLY source of chart color in the app - a component that
// needs a gain/loss/warning/neutral hex for an SVG, canvas, or recharts prop
// (none of which can take a Tailwind class) imports it from here. The 2026-09
// UI audit found 8 components hand-copying the exact BEAT/MISS hex values
// instead of importing them; if you're about to write '#34d399' or '#f87171'
// anywhere, import POSITIVE/NEGATIVE instead.

// One palette for beat/miss/estimate wherever earnings surprise is drawn -
// the EPS history bars, the calendar bullet bars, the row edges and the
// week-summary chart all read from here rather than inlining hexes.
export const BEAT = '#34d399'
export const MISS = '#f87171'
export const ESTIMATE = '#52525b' // consensus / not-yet-judged
export const REPORTED = '#3b82f6' // reported, but no surprise figure to judge it by
export const PENDING = '#f59e0b' // report date has passed, provider hasn't posted the actual yet
export const TARGET_TICK = '#e4e4e7' // the estimate marker on a bullet bar, once actuals are in
export const TRACK = 'rgba(255,255,255,0.06)' // empty bar track

// Generic gain/loss aliases - same two values as BEAT/MISS (this app has
// exactly one green and one red, full stop), named for use outside an
// earnings context (P&L lines, drawdown fills, gainers/losers bars) where
// "BEAT"/"MISS" would read oddly. Never introduce a second red or green.
export const POSITIVE = BEAT
export const NEGATIVE = MISS

// Muted label/axis text - the one gray used for chart ticks, legends, and
// "neutral, not a spending category" swatches (zinc-500 equivalent).
export const AXIS_TEXT = '#71717a'

// A lighter gray than AXIS_TEXT, deliberately: a category axis (e.g. ticker
// names on a horizontal bar chart) is the label a reader identifies each row
// by, not incidental chrome like a numeric axis's tick marks, so it gets more
// contrast (zinc-400 equivalent).
export const CATEGORY_AXIS_TEXT = '#a1a1aa'

// Series-identity colors for a multi-line "value over time" chart that shows
// more than one line at once (NetWorthChart's Investments/Bank/Total) - these
// name which line is which, not a gain/loss sign, so they're kept distinct
// from POSITIVE/NEGATIVE even where a value happens to coincide.
export const SERIES_INVESTMENTS = POSITIVE // reuses the gain green deliberately - investments are the growth-oriented slice
export const SERIES_BANK = '#fbbf24' // amber-gold; a bank balance isn't a PENDING/warning signal despite the nearby hue
export const SERIES_TOTAL = '#60a5fa' // lighter accent blue than REPORTED - reads as "the headline line" over two dashed/faded siblings

/** -1 miss / 0 in line / +1 beat - the same >0 / <0 / ==0 split the backend uses. */
export const surpriseSign = (value) => (value == null || value === 0 ? 0 : value > 0 ? 1 : -1)
export const surpriseColor = (value) => [MISS, ESTIMATE, BEAT][surpriseSign(value) + 1]

/** '#rrggbb' + 0..1 alpha -> 'rgba(...)', so tinted variants stay derived
 *  from BEAT/MISS instead of being hand-mixed. */
export function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export const chartTooltipProps = {
  contentStyle: {
    background: '#18181b',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)',
    fontSize: '12px',
    padding: '8px 12px',
  },
  labelStyle: { color: '#a1a1aa', fontSize: '11px', marginBottom: '4px' },
  itemStyle: { color: '#fafafa', padding: '1px 0' },
  cursor: { stroke: 'rgba(96,165,250,0.25)', fill: 'rgba(96,165,250,0.08)' },
}

// Blue-family ramp for sector / category breakdowns. Lifted here so the
// Portfolio sector bars and the Dashboard exposure donut share one.
export const SECTOR_PALETTE = ['#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#0ea5e9', '#1e40af']

// The catch-all "everything else" slice in a top-N+Other donut (holdings,
// sectors) - a real chart slice, so kept distinct from AXIS_TEXT even though
// both are the same neutral gray family.
export const OTHER_SLICE = '#52525b'

// Multi-hue, dark-background-legible palette for per-holding identity (pie
// slices, logo-fallback dots). Deliberately excludes green/red - those are
// reserved for P&L sign everywhere else in the app, so reusing them here
// would read as a gain/loss signal instead of "this is ticker X".
const HOLDINGS_PALETTE = [
  '#60a5fa', '#fbbf24', '#a78bfa', '#22d3ee', '#fb923c',
  '#f472b6', '#2dd4bf', '#818cf8', '#facc15', '#c084fc',
]

/** Deterministic color per ticker from HOLDINGS_PALETTE - same ticker always
 *  gets the same color across the app, without the backend's per-position
 *  hash-to-raw-hex color (which produces arbitrary, sometimes muddy hues). */
export function colorForTicker(ticker) {
  let hash = 0
  for (let i = 0; i < (ticker || '').length; i++) hash = (hash * 31 + ticker.charCodeAt(i)) >>> 0
  return HOLDINGS_PALETTE[hash % HOLDINGS_PALETTE.length]
}

// Fixed order (not hashed) so the same category always gets the same color
// regardless of how many categories are present in a given period - unlike
// colorForTicker, where an arbitrary/growing ticker set makes a stable hash
// the only practical option.
const CATEGORY_ORDER = [
  'GROCERIES', 'DINING', 'TRANSPORT', 'UTILITIES', 'SUBSCRIPTIONS',
  'SHOPPING', 'HEALTH', 'TRAVEL', 'ENTERTAINMENT', 'OTHER',
]

// Movement between your own accounts, not spending - a distinct neutral so
// it never collides with a real spending category's color in a shared list.
const NEUTRAL_CATEGORY_COLOR = AXIS_TEXT
const NEUTRAL_CATEGORIES = ['TRANSFER', 'SAVINGS']

export function colorForCategory(category) {
  if (NEUTRAL_CATEGORIES.includes(category)) return NEUTRAL_CATEGORY_COLOR
  const idx = CATEGORY_ORDER.indexOf(category)
  return idx === -1 ? NEUTRAL_CATEGORY_COLOR : HOLDINGS_PALETTE[idx % HOLDINGS_PALETTE.length]
}

export const gridProps = { stroke: 'rgba(255,255,255,0.06)', vertical: false }

export const axisProps = {
  tick: { fill: AXIS_TEXT, fontSize: 11 },
  axisLine: false,
  tickLine: false,
}

export function formatAxisDate(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export const dateAxisProps = { ...axisProps, dataKey: 'date', tickFormatter: formatAxisDate }

export const moneyAxisProps = {
  ...axisProps,
  width: 70,
  tickFormatter: (value) => fmtEur(value, { decimals: 0 }),
}
