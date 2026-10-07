import { fmtEur, fmtPct } from './format'

const FLAT_THRESHOLD = 0.05

export function spendingDelta({ total, previousTotal, comparisonLabel }) {
  if (!previousTotal) {
    return { pct: null, direction: null, badge: undefined, tone: 'zinc', note: undefined }
  }

  const pct = ((total - previousTotal) / previousTotal) * 100
  const note = `vs ${fmtEur(previousTotal)} ${comparisonLabel ?? 'last period'}`

  if (Math.abs(pct) < FLAT_THRESHOLD) {
    return { pct, direction: 'flat', badge: fmtPct(0, { sign: false }), tone: 'zinc', note }
  }

  const up = pct > 0
  return {
    pct,
    direction: up ? 'up' : 'down',
    badge: `${up ? '▲' : '▼'} ${fmtPct(Math.abs(pct), { sign: false })}`,
    tone: up ? 'red' : 'emerald',
    note,
  }
}
