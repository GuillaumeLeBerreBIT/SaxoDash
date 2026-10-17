import { fmtDate, fmtNum } from './format'

const PARTY = { Democrat: 'D', Republican: 'R', Independent: 'I' }
const KIND = { purchase: 'Bought', sale: 'Sold', partial_sale: 'Sold part', exchange: 'Exchanged' }

const dollars = (value) => `$${fmtNum(value)}`
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

export function partyLabel(party, stateDistrict) {
  const letter = PARTY[party] ?? (party ? party[0] : '')
  return letter ? `${letter}-${stateDistrict}` : stateDistrict
}

export function fmtRange(low, high) {
  return high == null ? `Over ${dollars(low)}` : `${dollars(low)}–${dollars(high)}`
}

export function tradeLabel({ kind, option, exercise }) {
  const base = KIND[kind] ?? kind
  if (exercise) return `${base} (exercise)`
  return option ? `${base} (${option})` : base
}

const monthYear = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

export function basisNote(basis = {}) {
  if (!basis.trades) return 'No parsed trades yet.'
  const since = basis.since ? ` since ${basis.since.slice(0, 4)}` : ''
  const priced = basis.priced_from ? `, priced from ${monthYear(basis.priced_from)}` : ''
  const parts = [`Estimated from ${plural(basis.trades, 'disclosed trade', 'disclosed trades')}${since}${priced} at the midpoint of each reported range`]
  if (basis.paper_reports) parts.push(`${plural(basis.paper_reports, 'paper report', 'paper reports')} not included`)
  if (basis.failed_reports) parts.push(`${plural(basis.failed_reports, 'report', 'reports')} could not be read`)
  if (basis.unparsed_rows) parts.push(`${plural(basis.unparsed_rows, 'row', 'rows')} could not be read`)
  if (basis.unseen_sales) parts.push(`${plural(basis.unseen_sales, 'sale', 'sales')} of holdings not seen bought ignored`)
  if (basis.unpriced) parts.push(`${plural(basis.unpriced, 'trade', 'trades')} without a price left out`)
  return parts.join(' · ')
}

export function activity(stock) {
  if (!stock) return null
  if (stock.buyers || stock.sellers) return { buyers: stock.buyers, sellers: stock.sellers }
  return stock.holders ? { holders: stock.holders } : null
}

export function activityLabel(stock, windowDays) {
  if (!stock.buyers && !stock.sellers) {
    const verb = stock.holders === 1 ? 'holds' : 'hold'
    return `${plural(stock.holders, 'member', 'members')} of Congress ${verb} it (estimated); none traded it in reports filed in the last ${windowDays} days`
  }
  const traded = `${plural(stock.buyers, 'member', 'members')} of Congress bought and ${stock.sellers} sold in reports filed in the last ${windowDays} days`
  return stock.holders ? `${traded} · ${plural(stock.holders, 'holds', 'hold')} it (estimated)` : traded
}

export const ACTIVE_DAYS = 90
const DAY_MS = 86_400_000

export const CONGRESS_CHIPS = [
  ['all', 'All'], ['democrat', 'Democrats'], ['republican', 'Republicans'], ['active', 'Active'], ['beating', 'Beating the market'],
]
export const CONGRESS_SORTS = [['edge', 'Copy edge'], ['trades', 'Trades'], ['filed', 'Last filed'], ['name', 'Name']]

const daysSince = (iso, today) => (iso ? (today - new Date(`${iso}T00:00:00Z`)) / DAY_MS : Infinity)

const CHIP_TESTS = {
  all: () => true,
  democrat: (member) => member.party === 'Democrat',
  republican: (member) => member.party === 'Republican',
  active: (member, today) => daysSince(member.last_filed, today) <= ACTIVE_DAYS,
  beating: (member) => member.excess_cagr_pct != null && member.excess_cagr_pct > 0,
}

const SORT_KEYS = {
  edge: (member) => -(member.excess_cagr_pct ?? -Infinity),
  trades: (member) => -member.trades,
  filed: (member) => -(member.last_filed ? Date.parse(member.last_filed) : -Infinity),
  name: () => 0,
}

const byKey = (key) => (a, b) => {
  const left = key(a)
  const right = key(b)
  return left === right ? 0 : left < right ? -1 : 1
}

export function directoryMembers(members, { chip = 'all', query = '', sort = 'edge', traderSlugs = new Set(), today = new Date() }) {
  const q = query.trim().toLowerCase()
  const matches = (member) =>
    !q || member.name.toLowerCase().includes(q) || member.state_district.toLowerCase().startsWith(q) || traderSlugs.has(member.slug)
  const inChip = CHIP_TESTS[chip] ?? CHIP_TESTS.all
  const order = byKey(SORT_KEYS[sort] ?? SORT_KEYS.edge)
  return members
    .filter((member) => inChip(member, today) && matches(member))
    .sort((a, b) => order(a, b) || a.name.localeCompare(b.name))
}

export const filedLine = (lastFiled) => (lastFiled ? `Last filed ${fmtDate(lastFiled)}` : 'No filings imported')
