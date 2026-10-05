import { fmtEur, fmtMoney, fmtNum, UNKNOWN } from './format'

const TONES = { BUY: 'blue', SELL: 'zinc', DIVIDEND: 'amber', DEPOSIT: 'teal', FEE: 'red' }
const CANONICAL_ORDER = ['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'FEE']
const INFLOWS = new Set(['SELL', 'DIVIDEND', 'DEPOSIT'])
const OUTFLOWS = new Set(['BUY', 'FEE'])

export const txTone = (type) => TONES[type] || 'zinc'

export function txPrice(t) {
  if (t.price == null) return UNKNOWN
  return t.currency ? fmtMoney(t.price, t.currency) : fmtNum(t.price, 2)
}

export function txTotal(t) {
  if (t.total_eur == null) return UNKNOWN
  const magnitude = Math.abs(Number(t.total_eur))
  if (INFLOWS.has(t.type)) return fmtEur(magnitude, { sign: true })
  if (OUTFLOWS.has(t.type)) return fmtEur(-magnitude)
  return fmtEur(magnitude)
}

export const txTotalClass = (t) => (INFLOWS.has(t.type) ? 'text-emerald-400' : 'text-zinc-100')

export function txTypes(rows) {
  const present = new Set(rows.map((r) => r.type))
  const known = CANONICAL_ORDER.filter((type) => present.has(type))
  const unknown = [...present].filter((type) => !CANONICAL_ORDER.includes(type)).sort()
  return ['All', ...known, ...unknown]
}
