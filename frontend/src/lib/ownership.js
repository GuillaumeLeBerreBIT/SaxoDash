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

export function fundBalance(stock) {
  if (!stock) return null
  const buying = stock.new + stock.added
  const selling = stock.trimmed + stock.sold_out
  return buying || selling ? { buying, selling } : null
}

export function balanceLabel({ buying, selling }, quarter) {
  const funds = buying === 1 ? 'fund' : 'funds'
  return `${buying} tracked ${funds} buying, ${selling} selling in ${quarterLabel(quarter)}`
}
