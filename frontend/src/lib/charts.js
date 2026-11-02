import { fmtDayMonth, fmtEur } from './format'
import { niceAxis } from './niceTicks'
import { THEMES, themeVars } from './theme'

/** -1 miss / 0 in line / +1 beat - the same >0 / <0 / ==0 split the backend uses. */
export const surpriseSign = (value) => (value == null || value === 0 ? 0 : value > 0 ? 1 : -1)
export const surpriseColor = (value, c) => [c.down, c.estimate, c.up][surpriseSign(value) + 1]

export const statementSeries = (c) => ({
  revenue: c.series[0],
  gross_profit: c.series[1],
  operating_income: c.series[3],
  net_income: c.series[2],
})

export function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export const PERFORMANCE_CAPS = { day: 3, sincePurchase: 30, month: 9 }
export const FLAT_MOVE = 0.1

export function chartPalette({ theme, moves }) {
  const roles = themeVars(THEMES[theme] ? theme : 'republic', moves)
  const pick = (name) => roles[`--sd-${name}`]
  return {
    up: pick('up'),
    down: pick('down'),
    flat: pick('flat'),
    warn: pick('warn'),
    earn: pick('earn'),
    grid: pick('grid'),
    ink: pick('ink'),
    accent: pick('accent'),
    onAccent: pick('on-accent'),
    axis: pick('ink-3'),
    axisCategory: pick('ink-2'),
    crosshair: pick('crosshair'),
    bench: pick('bench'),
    primary: pick('primary-line'),
    estimate: pick('ink-3'),
    track: pick('pill'),
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => pick(`s${i}`)),
    heat: ['heat-d3', 'heat-d2', 'heat-d1', 'heat-0', 'heat-u1', 'heat-u2', 'heat-u3'].map(pick),
    tooltip: { bg: pick('raised'), text: pick('ink'), border: pick('line') },
  }
}

export function performanceFill(pct, { cap, flat = FLAT_MOVE }, c) {
  if (pct == null || Number.isNaN(Number(pct))) return null
  const n = Number(pct)
  if (Math.abs(n) < flat) return withAlpha(c.flat, 0.18)
  const intensity = Math.min(1, Math.abs(n) / cap)
  const base = n >= 0 ? c.up : c.down
  return withAlpha(base, 0.12 + intensity * 0.65)
}

export const chartTooltipProps = (c) => ({
  contentStyle: {
    background: c.tooltip.bg,
    border: `1px solid ${c.tooltip.border}`,
    borderRadius: '8px',
    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5), 0 8px 10px -6px rgba(0,0,0,0.5)',
    fontSize: '12px',
    padding: '8px 12px',
  },
  labelStyle: { color: c.axisCategory, fontSize: '11px', marginBottom: '4px' },
  itemStyle: { color: c.tooltip.text, padding: '1px 0' },
  cursor: { stroke: c.crosshair, fill: withAlpha(c.crosshair, 0.12) },
})

export function colorForTicker(ticker, c) {
  const palette = c.series
  let hash = 0
  for (let i = 0; i < (ticker || '').length; i++) hash = (hash * 31 + ticker.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

export function colorForRank(index, c) {
  return c.series[index % c.series.length]
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
const NEUTRAL_CATEGORIES = ['TRANSFER', 'SAVINGS']

export function colorForCategory(category, c) {
  const palette = c.series
  if (NEUTRAL_CATEGORIES.includes(category)) return c.axis
  const idx = CATEGORY_ORDER.indexOf(category)
  if (idx === -1) return c.axis
  return idx < palette.length ? palette[idx] : withAlpha(palette[idx % palette.length], 0.55)
}

export const gridProps = (c) => ({ stroke: c.grid, vertical: false })

export const axisProps = (c) => ({
  tick: { fill: c.axis, fontSize: 11 },
  axisLine: false,
  tickLine: false,
})

export const formatAxisDate = fmtDayMonth

export const dateAxisProps = (c) => ({ ...axisProps(c), dataKey: 'date', tickFormatter: formatAxisDate })

export const moneyAxisProps = (c) => ({
  ...axisProps(c),
  width: 70,
  tickFormatter: (value) => fmtEur(value, { decimals: 0 }),
})

function paddedDomain([min, max]) {
  const span = max - min
  const pad = span > 0 ? span * 0.1 : Math.abs(max) * 0.01 || 1
  const low = min >= 0 ? Math.max(0, min - pad) : min - pad
  return [low, max + pad]
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return NaN
  return Number(value)
}

export function seriesAxis(rows, keys, options = {}) {
  const values = rows.flatMap((row) => keys.map((key) => toNumber(row[key]))).filter((value) => Number.isFinite(value))
  if (options.includeZero) values.push(0)
  if (values.length === 0) return {}
  const axis = niceAxis(values, { count: options.count })
  if (axis.ticks) return axis
  return { domain: paddedDomain([Math.min(...values), Math.max(...values)]) }
}
