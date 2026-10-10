// Instrument prices are quoted in the instrument's own currency; only values,
// costs and P&L are converted to the reporting currency. Use fmtMoney with the
// position's `currency` for a price, fmtEur for anything already converted.

// An absent figure is not zero: "€0.00" is a claim, a dash is not.
export const UNKNOWN = '—'

export function fmtMoney(value, currency = 'EUR', { sign = false, decimals = 2 } = {}) {
    if (value == null || Number.isNaN(Number(value))) return UNKNOWN
    const n = Number(value)
    const formatted = new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: currency || 'EUR',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(Math.abs(n))
    const prefix = n < 0 ? '-' : sign ? '+' : ''
    return `${prefix}${formatted}`
}

export function fmtEur(value, opts = {}) {
    return fmtMoney(value, 'EUR', opts)
}

/** Whole shares stay whole; fractional ones keep only the decimals they use. */
export function fmtQty(value) {
    return new Intl.NumberFormat('en-IE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
    }).format(Number(value))
}

export function fmtPct(value, { sign = true, decimals = 2 } = {}) {
    if (value == null || Number.isNaN(Number(value))) return UNKNOWN
    const n = Number(value)
    const text = n.toFixed(decimals)
    if (Number(text) === 0) return `${(0).toFixed(decimals)}%`
    const prefix = n < 0 ? '' : sign ? '+' : ''
    return `${prefix}${text}%`
}

export function pctTone(value, decimals = 2) {
    if (value == null || Number.isNaN(Number(value))) return 'neutral'
    const n = Number(value)
    if (Number(n.toFixed(decimals)) === 0) return 'neutral'
    return n > 0 ? 'positive' : 'negative'
}

const TONE_CLASS = { positive: 'text-emerald-400', negative: 'text-red-400' }

export function pctToneClass(value, decimals = 2, neutral = 'text-zinc-500') {
    return TONE_CLASS[pctTone(value, decimals)] ?? neutral
}

export function fmtNum(value, decimals = 0) {
  if (value == null) return UNKNOWN
  return new Intl.NumberFormat('en-IE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value))
}

// Finnhub sends market cap in millions of the reporting currency; this turns
// 3105000 into '3.11T' instead of a wall of digits.
export function fmtCompact(millions) {
  if (millions == null) return '—'
  const abs = Math.abs(millions)
  if (abs >= 1_000_000) return `${(millions / 1_000_000).toFixed(2)}T`
  if (abs >= 1_000) return `${(millions / 1_000).toFixed(2)}B`
  return `${millions.toFixed(0)}M`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

function dateParts(value) {
  if (value == null || value === '') return null
  const text = String(value)
  const match = DATE_ONLY.exec(text)
  if (match) return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) }
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return { year: parsed.getFullYear(), month: parsed.getMonth(), day: parsed.getDate() }
}

const pad2 = (n) => String(n).padStart(2, '0')

export function fmtDayMonth(value) {
  const parts = dateParts(value)
  return parts ? `${pad2(parts.day)} ${MONTHS[parts.month]}` : UNKNOWN
}

export function fmtMonthYear(value) {
  const parts = dateParts(value)
  return parts ? `${MONTHS[parts.month]} ${pad2(parts.year % 100)}` : UNKNOWN
}

export function fmtDate(value) {
  const parts = dateParts(value)
  return parts ? `${pad2(parts.day)} ${MONTHS[parts.month]} ${parts.year}` : UNKNOWN
}

export function fmtDateTime(value) {
  const parts = dateParts(value)
  if (!parts) return UNKNOWN
  const at = new Date(value)
  const time = DATE_ONLY.test(String(value)) ? '' : `, ${pad2(at.getHours())}:${pad2(at.getMinutes())}`
  return `${fmtDate(value)}${time}`
}
