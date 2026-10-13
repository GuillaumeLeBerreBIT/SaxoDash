const ANNUAL_YEARS = 8

export function quarterlyEpsRows(history, upcoming) {
  const reported = (history ?? []).map((event) => ({
    period: event.date.slice(0, 7),
    actual: event.eps_actual,
    estimate: event.eps_estimate,
    surprise: event.eps_surprise_pct,
    forward: false,
  }))
  const scheduled = (upcoming ?? [])
    .filter((event) => event.eps_estimate != null)
    .map((event) => ({
      period: event.date.slice(0, 7),
      actual: null,
      estimate: event.eps_estimate,
      surprise: null,
      forward: true,
    }))
  return [...reported, ...scheduled]
}

export function annualEpsRows(annual) {
  return (annual ?? [])
    .filter((year) => year.income?.eps_diluted != null)
    .slice(-ANNUAL_YEARS)
    .map((year) => ({ period: year.label, actual: year.income.eps_diluted, estimate: null, surprise: null, forward: false }))
}
