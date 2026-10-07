const ISO = /^(\d{4})-(\d{2})-(\d{2})$/

export const DATE_PRESETS = ['30D', 'YTD', '1Y']

const DEFAULT_FILTERS = { search: '', type: 'All', account: '', from: '', to: '' }

function validDate(value) {
  if (typeof value !== 'string') return ''
  const match = ISO.exec(value)
  if (!match) return ''
  const [, y, m, d] = match.map(Number)
  const parsed = new Date(Date.UTC(y, m - 1, d))
  const same = parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d
  return same ? value : ''
}

function toIso(date) {
  return date.toISOString().slice(0, 10)
}

export function filterByDateRange(rows, { from, to } = {}) {
  const lower = validDate(from)
  const upper = validDate(to)
  if (!lower && !upper) return rows
  return rows.filter((r) => (!lower || r.date >= lower) && (!upper || r.date <= upper))
}

export function accountsOf(rows) {
  return [...new Set(rows.map((r) => r.account).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export function rangeForPreset(preset, today) {
  const [y, m, d] = today.split('-').map(Number)
  if (preset === 'YTD') return { from: `${y}-01-01`, to: today }
  if (preset === '1Y') {
    const from = new Date(Date.UTC(y - 1, m - 1, d))
    if (from.getUTCMonth() !== (m - 1 + 12) % 12) from.setUTCDate(0)
    return { from: toIso(from), to: today }
  }
  const from = new Date(Date.UTC(y, m - 1, d - 29))
  return { from: toIso(from), to: today }
}

export function readFilters(searchParams) {
  return {
    search: searchParams.get('q') ?? DEFAULT_FILTERS.search,
    type: searchParams.get('type') || DEFAULT_FILTERS.type,
    account: searchParams.get('account') ?? DEFAULT_FILTERS.account,
    from: validDate(searchParams.get('from')),
    to: validDate(searchParams.get('to')),
  }
}

export function writeFilters(filters) {
  const params = new URLSearchParams()
  if (filters.search) params.set('q', filters.search)
  if (filters.type && filters.type !== DEFAULT_FILTERS.type) params.set('type', filters.type)
  if (filters.account) params.set('account', filters.account)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  return params
}
