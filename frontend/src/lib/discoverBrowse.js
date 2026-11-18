export const SORTS = [
  { value: 'opportunity', label: 'Most quality checks passed' },
  { value: 'discount', label: 'Furthest below its usual P/E' },
  { value: 'fall', label: 'Biggest fall from 1-year high' },
]

export const VALUATION_OPTIONS = [
  { value: 'cheap', label: 'Below usual P/E' },
  { value: 'fair', label: 'Within usual P/E' },
  { value: 'expensive', label: 'Above usual P/E' },
]

export const QUALITY_OPTIONS = [
  { value: 'strong', label: 'Strong' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'weak', label: 'Weak' },
]

export const MIN_YIELD = 3
export const MIN_FALL = 25
export const RAIL_SIZE = 4
export const PAGE_SIZE = 24

export const RAILS = [
  {
    key: 'opportunities',
    title: 'Strong companies',
    sub: 'Pass the quality checks, most checks passed first. The price is not judged',
    filters: { quality: ['strong'] },
  },
  {
    key: 'fell',
    title: 'Fell hard, still strong',
    sub: `${MIN_FALL}% or more below the 1-year high while the quality checks still hold`,
    filters: { quality: ['strong'], minFall: MIN_FALL, sort: 'fall' },
  },
]

const LIST_KEYS = ['valuation', 'quality', 'sector']

export const EMPTY_FILTERS = { valuation: [], quality: [], sector: [], minYield: null, minFall: null, notHeld: false, q: '', sort: 'opportunity' }

export function filtersFromParams(params) {
  const list = (key) => (params.get(key) ? params.get(key).split(',').filter(Boolean) : [])
  const number = (key) => {
    const value = Number(params.get(key))
    return params.get(key) && Number.isFinite(value) ? value : null
  }
  const sort = params.get('sort')
  return {
    valuation: list('valuation'),
    quality: list('quality'),
    sector: list('sector'),
    minYield: number('min_yield'),
    minFall: number('min_fall'),
    notHeld: params.get('not_held') === '1',
    q: params.get('q') ?? '',
    sort: SORTS.some((option) => option.value === sort) ? sort : 'opportunity',
  }
}

export function paramsFromFilters(filters) {
  const out = {}
  for (const key of LIST_KEYS) if (filters[key]?.length) out[key] = filters[key].join(',')
  if (filters.minYield != null) out.min_yield = String(filters.minYield)
  if (filters.minFall != null) out.min_fall = String(filters.minFall)
  if (filters.notHeld) out.not_held = '1'
  if (filters.q?.trim()) out.q = filters.q
  if (filters.sort && filters.sort !== 'opportunity') out.sort = filters.sort
  return out
}

export function browseQuery(filters, { exclude = [], tickers = [], limit, offset } = {}) {
  const params = new URLSearchParams(paramsFromFilters(filters))
  if (exclude.length) params.set('exclude', exclude.join(','))
  if (tickers.length) params.set('tickers', tickers.join(','))
  if (limit != null) params.set('limit', String(limit))
  if (offset) params.set('offset', String(offset))
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function filtersActive(filters) {
  return Object.keys(paramsFromFilters({ ...filters, sort: 'opportunity' })).length > 0
}

export function toggled(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

const whole = (value) => Math.round(Math.abs(Number(value)))

export function priceLine(stock) {
  if (stock.discount_pct != null && stock.discount_pct > 0) {
    return { text: `${whole(stock.discount_pct)}% below its usual P/E range`, tone: 'neutral' }
  }
  if (stock.below_high_pct != null && stock.below_high_pct >= 10) {
    return { text: `${whole(stock.below_high_pct)}% below its 1-year high`, tone: 'neutral' }
  }
  const words = { fair: 'Within its usual P/E range', expensive: 'Above its usual P/E range' }
  return words[stock.valuation] ? { text: words[stock.valuation], tone: 'neutral' } : null
}

export function checksLine(stock) {
  if (!stock.checks_answered) return 'Too few figures to judge the business.'
  const failed = stock.failed_checks ?? []
  const passed = `${stock.checks_passed} of ${stock.checks_answered} quality checks pass`
  if (failed.length === 0) return `${passed}.`
  return `${passed}; ${failed.join(', ').toLowerCase()} ${failed.length === 1 ? 'fails' : 'fail'}.`
}
