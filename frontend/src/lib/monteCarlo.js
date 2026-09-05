// Bootstrap-free Monte Carlo: monthly returns drawn from a normal distribution
// fitted to the portfolio's own annualised return and volatility (from the
// Risk tab), not a benchmark or a guess. A fixed seed keeps the chart stable
// across re-renders instead of reshuffling on every prop change.

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gauss(random) {
  let u = 0
  let v = 0
  while (!u) u = random()
  while (!v) v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function percentile(sortedValues, p) {
  return sortedValues[Math.floor((sortedValues.length - 1) * p)]
}

/** Simulated portfolio paths under a monthly DCA contribution.
 *
 *  Returns one row every 3 months: the contributed-only reference line
 *  (`invested`) plus the P10/P25/P50/P75/P90 of the simulated ending balance.
 */
export function monteCarlo({
  start,
  monthly,
  years,
  expectedReturnPct,
  volatilityPct,
  paths = 600,
  seed = 42,
}) {
  const muAnnual = expectedReturnPct / 100
  const volAnnual = volatilityPct / 100
  const monthlyVol = volAnnual / Math.sqrt(12)
  // Geometric Brownian motion: subtract half the variance so the median path
  // matches the stated arithmetic annual return, not its lognormal mean.
  const monthlyDrift = Math.log(1 + muAnnual) / 12 - monthlyVol ** 2 / 2
  const months = years * 12
  const random = mulberry32(seed)

  const allPaths = []
  for (let p = 0; p < paths; p++) {
    let value = start
    const path = [start]
    for (let m = 1; m <= months; m++) {
      value = (value + monthly) * Math.exp(monthlyDrift + monthlyVol * gauss(random))
      path.push(value)
    }
    allPaths.push(path)
  }

  const rows = []
  for (let m = 0; m <= months; m += 3) {
    const column = allPaths.map((path) => path[m]).sort((a, b) => a - b)
    rows.push({
      month: m,
      invested: start + monthly * m,
      p10: percentile(column, 0.1),
      p25: percentile(column, 0.25),
      p50: percentile(column, 0.5),
      p75: percentile(column, 0.75),
      p90: percentile(column, 0.9),
    })
  }
  return rows
}
