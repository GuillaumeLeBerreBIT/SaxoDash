import { fmtDate, fmtEur, fmtMoney, fmtNum, UNKNOWN } from './format'

const TONES = { BUY: 'blue', SELL: 'zinc', DIVIDEND: 'amber', DEPOSIT: 'teal', FEE: 'red' }
const CANONICAL_ORDER = ['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'FEE']
const INFLOWS = new Set(['SELL', 'DIVIDEND', 'DEPOSIT'])
const OUTFLOWS = new Set(['BUY', 'FEE'])

export const txTone = (type) => TONES[type] || 'zinc'

export function txPrice(t) {
  if (t.price == null) return UNKNOWN
  return t.currency ? fmtMoney(t.price, t.currency) : fmtNum(t.price, 2)
}

export function txSignedTotal(t) {
  if (t.total_eur == null) return null
  const magnitude = Math.abs(Number(t.total_eur))
  if (INFLOWS.has(t.type)) return magnitude
  if (OUTFLOWS.has(t.type)) return -magnitude
  return magnitude
}

export function txTotal(t) {
  const signed = txSignedTotal(t)
  if (signed === null) return UNKNOWN
  if (INFLOWS.has(t.type)) return fmtEur(signed, { sign: true })
  return fmtEur(signed)
}

export const txTotalClass = (t) =>
  t.total_eur != null && INFLOWS.has(t.type) ? 'text-up' : 'text-ink'

export function txTypes(rows) {
  const present = new Set(rows.map((r) => r.type))
  const known = CANONICAL_ORDER.filter((type) => present.has(type))
  const unknown = [...present].filter((type) => !CANONICAL_ORDER.includes(type)).sort()
  return ['All', ...known, ...unknown]
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function txDayLabel(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ''))
  if (!match) return fmtDate(date)
  const weekday = WEEKDAYS[new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getDay()]
  return `${weekday} ${fmtDate(date)}`
}

export function txDayGroups(rows) {
  const groups = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.date === row.date) last.rows.push(row)
    else groups.push({ date: row.date, rows: [row] })
  }
  return groups
}

function euroSum(rows) {
  if (rows.length === 0 || rows.some((t) => t.total_eur == null)) return null
  return rows.reduce((sum, t) => sum + Math.abs(Number(t.total_eur)), 0)
}

export function txDaySummary(rows) {
  const parts = [
    ['bought', euroSum(rows.filter((t) => t.type === 'BUY'))],
    ['sold', euroSum(rows.filter((t) => t.type === 'SELL'))],
  ]
    .filter(([, amount]) => amount != null)
    .map(([verb, amount]) => `${verb} ${fmtEur(amount)}`)
  if (parts.length === 0) return null
  const text = parts.join(' · ')
  return text[0].toUpperCase() + text.slice(1)
}

export function txDaySummaries(rows) {
  const byDate = new Map()
  rows.forEach((t) => byDate.set(t.date, [...(byDate.get(t.date) ?? []), t]))
  return new Map([...byDate].map(([date, dayRows]) => [date, txDaySummary(dayRows)]))
}
