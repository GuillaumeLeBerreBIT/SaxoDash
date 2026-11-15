import { fmtEur, fmtPct } from './format'

const CAP_KINDS = new Set(['single_name', 'concentration'])

export function standingSentence(summary) {
  const pnl = summary?.total_pnl == null ? null : Number(summary.total_pnl)
  if (pnl == null || Number.isNaN(pnl)) return null
  const pct = summary.total_pnl_pct == null ? '' : ` (${fmtPct(Math.abs(Number(summary.total_pnl_pct)), { sign: false, decimals: 1 })})`
  const worth = fmtEur(summary.total_value, { decimals: 0 })
  if (pnl === 0) return `Your investments are worth ${worth}, the same as you paid.`
  const side = pnl > 0 ? 'more' : 'less'
  return `Your investments are worth ${worth}, ${fmtEur(Math.abs(pnl), { decimals: 0 })} ${side} than you paid${pct}.`
}

export function needsYou(attention = [], breaches = []) {
  return breaches.length > 0 ? attention.filter((item) => !CAP_KINDS.has(item.kind)) : attention
}
