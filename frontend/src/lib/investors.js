import { OTHER_SLICE, colorForRank } from './charts'
import { UNKNOWN } from './format'

const VIEW_KEY = 'saxodash:investors-top10-view'

export const CARD_LIMIT = 8
export const PAGE_SIZE = 15
export const PAGE_STEP = 25
export const TOP10_VIEWS = [['grid', 'Grid'], ['donut', 'Donut'], ['list', 'List']]
export const INVESTOR_GROUPS = [['all', 'All'], ['curated', 'Curated'], ['stale', 'Stopped filing']]
export const INVESTOR_SORTS = [['value', 'Largest value'], ['filed', 'Recently filed'], ['changes', 'Most changes'], ['positions', 'Most positions'], ['name', 'Name']]
export const COMPARING_FILTERS = new Set(['new', 'added', 'trimmed'])
export const HOLDING_FILTERS = [['all', 'All'], ['new', 'New'], ['added', 'Added'], ['trimmed', 'Trimmed'], ['options', 'Options'], ['yours', 'Yours']]

export function quarterLabel(iso) {
  if (!iso) return UNKNOWN
  const [year, month] = iso.split('-').map(Number)
  return `Q${Math.ceil(month / 3)} ${year}`
}

const SCALES = [[1e12, 'T', 2], [1e9, 'B', 1], [1e6, 'M', 0], [1e3, 'K', 0]]

export const fmtCount = (n, symbol) => (n === 0 ? '0' : `${symbol}${n}`)

const positionWord = (n) => (n === 1 ? 'position' : 'positions')

export const positionCount = (n) => `${n} ${positionWord(n)}`

export function fmtUsdCompact(value, { sign = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return UNKNOWN
  const n = Number(value)
  const abs = Math.abs(n)
  const found = SCALES.findIndex(([size]) => abs >= size)
  const bodyAt = (i) => (i === SCALES.length ? `${Math.round(abs)}` : (abs / SCALES[i][0]).toFixed(SCALES[i][2]))
  const start = found === -1 ? SCALES.length : found
  const index = Number(bodyAt(start)) >= 1000 && start > 0 ? start - 1 : start
  const body = `${bodyAt(index)}${index === SCALES.length ? '' : SCALES[index][1]}`
  const prefix = n < 0 ? '-' : sign && n > 0 ? '+' : ''
  return `${prefix}$${body}`
}

const FILED = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function fmtFiledDate(iso) {
  return iso ? FILED.format(new Date(`${iso}T00:00:00Z`)) : UNKNOWN
}

export function latestQuarter(cards) {
  const quarters = cards.map((c) => c.latest_quarter).filter(Boolean).sort()
  return quarters.length ? quarters[quarters.length - 1] : null
}

export function looksLikeTicker(query) {
  return /^[A-Za-z]{1,5}(\.[A-Za-z])?$/.test(query.trim())
}

const GROUP_TESTS = {
  all: () => true,
  curated: (c) => c.curated,
  stale: (c) => c.stale,
}

const SORT_KEYS = {
  value: (c) => -(c.total_value ?? -1),
  filed: (c) => -(c.last_filing_at ? Date.parse(c.last_filing_at) : 0),
  changes: (c) => -((c.new_count ?? 0) + (c.exited_count ?? 0)),
  positions: (c) => -(c.positions ?? -1),
}

export function visibleInvestors(cards, { group = 'all', query = '', sort = 'value', holderSlugs = new Set() }) {
  const q = query.trim().toLowerCase()
  const matches = (c) => !q || c.name.toLowerCase().includes(q) || c.firm.toLowerCase().includes(q) || holderSlugs.has(c.slug)
  const key = SORT_KEYS[sort]
  return cards
    .filter((c) => (GROUP_TESTS[group] ?? GROUP_TESTS.all)(c) && matches(c))
    .sort((a, b) => (key ? key(a) - key(b) : 0) || a.name.localeCompare(b.name))
}

const HOLDING_TESTS = {
  all: () => true,
  options: (h) => Boolean(h.put_call),
  yours: (h) => h.owned || h.watched,
}

export function filterHoldings(holdings, { filter = 'all', query = '' }) {
  const q = query.trim().toLowerCase()
  const test = HOLDING_TESTS[filter] ?? ((h) => h.change === filter)
  return holdings.filter(
    (h) => test(h) && (!q || (h.ticker ?? '').toLowerCase().includes(q) || h.issuer.toLowerCase().includes(q)),
  )
}

export const holdingLabel = (h) => h.ticker ?? h.issuer

export const topTen = (holdings) => holdings.slice(0, 10)

export function remainder(detail) {
  if (detail.positions <= 10) return null
  const shown = topTen(detail.holdings).reduce((sum, h) => sum + h.value, 0)
  return {
    count: detail.positions - 10,
    weight: Math.round((100 - detail.top10_weight) * 100) / 100,
    value: detail.total_value - shown,
  }
}

export function donutSlices(detail) {
  const slices = topTen(detail.holdings).map((h, i) => ({
    name: holdingLabel(h),
    note: h.ticker ? h.issuer : null,
    value: h.value,
    weight: h.weight,
    color: colorForRank(i),
    logo: Boolean(h.ticker),
  }))
  const rest = remainder(detail)
  return rest
    ? [...slices, { name: 'Other', note: `${rest.count} smaller ${positionWord(rest.count)}`, value: rest.value, weight: rest.weight, color: OTHER_SLICE, logo: false }]
    : slices
}

const VIEW_KEYS = new Set(TOP10_VIEWS.map(([key]) => key))

export function readTop10View() {
  try {
    const stored = localStorage.getItem(VIEW_KEY)
    return VIEW_KEYS.has(stored) ? stored : 'grid'
  } catch {
    return 'grid'
  }
}

export function writeTop10View(view) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    return
  }
}
