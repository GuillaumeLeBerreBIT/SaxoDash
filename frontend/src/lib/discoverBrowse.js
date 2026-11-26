import { fmtPct } from './format'
import { POSITION_LABEL } from './verdicts'

export const SORTS = [
  { value: 'checks', label: 'Most quality checks passed' },
  { value: 'opportunity', label: 'Portfolio action' },
  { value: 'funds', label: 'Most tracked buyers' },
  { value: 'fall', label: 'Biggest fall from 1-year high' },
]

export const VALUATION_OPTIONS = [
  { value: 'cheap', label: POSITION_LABEL.cheap },
  { value: 'fair', label: POSITION_LABEL.fair },
  { value: 'expensive', label: POSITION_LABEL.expensive },
]

export const QUALITY_OPTIONS = [
  { value: 'strong', label: 'Strong' },
  { value: 'incomplete', label: 'Incomplete' },
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

export const EMPTY_FILTERS = { valuation: [], quality: [], sector: [], minYield: null, minFall: null, notHeld: false, q: '', sort: 'checks' }

export function defaultSort(screen) {
  if (screen === 'pullbacks') return 'fall'
  if (screen === 'fund-buying') return 'funds'
  return 'checks'
}

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
    sort: SORTS.some((option) => option.value === sort) ? sort : defaultSort(params.get('screen')),
  }
}

export function paramsFromFilters(filters) {
  const out = {}
  for (const key of LIST_KEYS) if (filters[key]?.length) out[key] = filters[key].join(',')
  if (filters.minYield != null) out.min_yield = String(filters.minYield)
  if (filters.minFall != null) out.min_fall = String(filters.minFall)
  if (filters.notHeld) out.not_held = '1'
  if (filters.q?.trim()) out.q = filters.q
  if (filters.sort && filters.sort !== 'checks') out.sort = filters.sort
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
  return Object.keys(paramsFromFilters({ ...filters, sort: 'checks' })).length > 0
}

export function toggled(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function priceLine(stock) {
  if (POSITION_LABEL[stock.valuation]) return POSITION_LABEL[stock.valuation]
  if (stock.below_high_pct >= 10) return `${Math.round(stock.below_high_pct)}% below its 1-year high`
  return null
}

export function fallLine(stock) {
  if (stock.below_high_pct == null || stock.below_high_pct <= 0) return null
  return `${Math.round(stock.below_high_pct)}% below its 1-year high`
}

const pairs = new Intl.ListFormat('en', { type: 'conjunction' })

function checkNames(labels = []) {
  return pairs.format(labels.slice(0, 2).map(label => label.toLowerCase()))
}

export function qualityCount(stock) {
  if (!stock.checks_answered || stock.checks_passed == null) return null
  return `${stock.checks_passed} of ${stock.checks_answered} quality checks passed`
}

export function checksLine(stock) {
  const passed = checkNames(stock.passed_checks)
  const failures = stock.failed_checks ?? []
  const failed = checkNames(failures)
  const evidence = []
  if (Number.isFinite(stock.revenue_growth_5y)) {
    const rate = fmtPct(stock.revenue_growth_5y, { sign: false, decimals: 1 })
    evidence.push(`Five-year revenue growth was ${rate} a year.`)
  } else if (passed) {
    evidence.push(`Passes on ${passed}.`)
  }
  if (failures.length === 1) evidence.push(`Misses the ${failed} check.`)
  else if (failures.length === 2) evidence.push(`Misses checks for ${failed}.`)
  else if (failures.length > 2) evidence.push(`Misses ${failures.length} checks, including ${failed}.`)
  if (evidence.length) return evidence.join(' ')
  return stock.checks_answered ? `${stock.checks_passed} of ${stock.checks_answered} quality checks pass.` : 'Too few figures to judge the business.'
}
