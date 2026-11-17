const THIRD = 1 / 3

function levelsOf({ price, cheapBelow, expensiveAbove }) {
  if (price == null || cheapBelow == null || expensiveAbove == null) return null
  const p = Number(price)
  const low = Number(cheapBelow)
  const high = Number(expensiveAbove)
  if (![p, low, high].every(Number.isFinite) || low <= 0 || high <= low) return null
  return { p, low, high }
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
