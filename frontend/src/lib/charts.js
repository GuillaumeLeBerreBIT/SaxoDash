import { fmtEur } from './format'

// One palette for beat/miss/estimate wherever earnings surprise is drawn -
// the EPS history bars, the calendar bullet bars, the row edges and the
// week-summary chart all read from here rather than inlining hexes.
export const BEAT = '#34d399'
export const MISS = '#f87171'
export const ESTIMATE = '#52525b' // consensus / not-yet-judged
export const REPORTED = '#3b82f6' // reported, but no surprise figure to judge it by
export const TARGET_TICK = '#e4e4e7' // the estimate marker on a bullet bar, once actuals are in
export const TRACK = 'rgba(255,255,255,0.06)' // empty bar track

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

export const gridProps = { stroke: 'rgba(255,255,255,0.06)', vertical: false }

export const axisProps = {
  tick: { fill: '#71717a', fontSize: 11 },
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
