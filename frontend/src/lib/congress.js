import { fmtNum } from './format'

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

export function basisNote(basis = {}) {
  if (!basis.trades) return 'No parsed trades yet.'
  const year = (basis.since ?? '2021').slice(0, 4)
  const parts = [`Estimated from ${plural(basis.trades, 'disclosed trade', 'disclosed trades')} since ${year} at the midpoint of each reported range`]
  if (basis.paper_reports) parts.push(`${plural(basis.paper_reports, 'paper report', 'paper reports')} not included`)
  if (basis.failed_reports) parts.push(`${plural(basis.failed_reports, 'report', 'reports')} could not be read`)
  if (basis.unparsed_rows) parts.push(`${plural(basis.unparsed_rows, 'row', 'rows')} could not be read`)
  if (basis.unseen_sales) parts.push(`${plural(basis.unseen_sales, 'sale', 'sales')} of holdings bought before ${year} ignored`)
  if (basis.unpriced) parts.push(`${plural(basis.unpriced, 'trade', 'trades')} without a price left out`)
  return parts.join(' · ')
}

export function activity(stock) {
  if (!stock || (!stock.buyers && !stock.sellers)) return null
  return { buyers: stock.buyers, sellers: stock.sellers }
}

export function activityLabel(stock, windowDays) {
  const traded = `${plural(stock.buyers, 'member', 'members')} of Congress bought and ${stock.sellers} sold in reports filed in the last ${windowDays} days`
  return stock.holders ? `${traded} · ${plural(stock.holders, 'holds', 'hold')} it (estimated)` : traded
}
