const THIRD = 1 / 3

export function hasPriceRange(cheapBelow, expensiveAbove) {
  const low = Number(cheapBelow)
  const high = Number(expensiveAbove)
  return Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > low
}

function levelsOf({ price, cheapBelow, expensiveAbove }) {
  const p = Number(price)
  if (price == null || !Number.isFinite(p) || !hasPriceRange(cheapBelow, expensiveAbove)) return null
  return { p, low: Number(cheapBelow), high: Number(expensiveAbove) }
}

const clamp = (value) => Math.min(1, Math.max(0, value))

export function priceZone(input) {
  const levels = levelsOf(input)
  if (!levels) return null
  if (levels.p < levels.low) return 'cheap'
  if (levels.p > levels.high) return 'expensive'
  return 'fair'
}

export function priceBarPosition(input) {
  const levels = levelsOf(input)
  if (!levels) return null
  const { p, low, high } = levels
  if (p < low) return clamp(((p - low / 2) / (low / 2)) * THIRD)
  if (p > high) return clamp(2 * THIRD + ((p - high) / (high / 2)) * THIRD)
  return THIRD + ((p - low) / (high - low)) * THIRD
}
