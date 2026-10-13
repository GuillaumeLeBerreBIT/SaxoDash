import { fmtNum } from './format'
import { quarterLabel } from './investors'

const FILING_CURRENCY = 'USD'

export function ownershipTicker({ ticker, currency } = {}) {
  if (!ticker) return null
  if (currency && currency !== FILING_CURRENCY) return null
  return ticker.toUpperCase()
}

export function ownershipTickers(positions = []) {
  return [...new Set(positions.map(ownershipTicker).filter(Boolean))].sort()
}

export function sharesHeld(stock) {
  return stock && stock.shares > 0 ? stock.shares : null
}

export function sharesChange(stock) {
  if (!stock || !stock.shares_change) return null
  return {
    direction: stock.shares_change > 0 ? 'up' : 'down',
    shares: Math.abs(stock.shares_change),
    pct: stock.shares_change_pct,
  }
}

const COMPACT_UNITS = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']]

export function fmtSharesCompact(shares) {
  const size = Math.abs(shares)
  const unit = COMPACT_UNITS.find(([scale]) => Math.round((size / scale) * 10) >= 10)
  if (!unit) return fmtNum(shares)
  return `${Number((shares / unit[0]).toFixed(1))}${unit[1]}`
}

export const heldLabel = (shares, quarter) =>
  `Tracked funds hold ${fmtNum(shares)} shares at the end of ${quarterLabel(quarter)}`

export const changeLabel = ({ direction, shares }, quarter) =>
  `Tracked funds net ${direction === 'up' ? 'bought' : 'sold'} ${fmtNum(shares)} shares in ${quarterLabel(quarter)}`
