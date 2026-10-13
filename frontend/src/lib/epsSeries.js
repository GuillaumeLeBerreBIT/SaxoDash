import { periodLabels } from './ratioHistory'

const ANNUAL_YEARS = 8

function fiscalQuarterLabel(event) {
  if (event.quarter == null || event.year == null) return null
  return `Q${event.quarter} FY${String(event.year % 100).padStart(2, '0')}`
}

export function quarterlyEpsRows(history, upcoming) {
  const taken = new Set()
  const labelFor = (event) => {
    const month = event.date.slice(0, 7)
    const fiscal = fiscalQuarterLabel(event)
    const label = fiscal && !taken.has(fiscal) ? fiscal : month
    taken.add(label)
    return label
  }
  const reported = (history ?? []).map((event) => ({
    period: labelFor(event),
    actual: event.eps_actual,
    estimate: event.eps_estimate,
    surprise: event.eps_surprise_pct,
    forward: false,
  }))
  const scheduled = (upcoming ?? [])
    .filter((event) => event.eps_estimate != null)
    .map((event) => ({
      period: labelFor(event),
      actual: null,
      estimate: event.eps_estimate,
      surprise: null,
      forward: true,
    }))
  return [...reported, ...scheduled]
}

export function annualEpsRows(annualEps) {
  const points = (annualEps ?? []).slice(-ANNUAL_YEARS)
  const labels = periodLabels(points)
  return points.map((point, index) => ({
    period: /^\d{4}$/.test(labels[index]) ? `FY ${labels[index]}` : labels[index],
    actual: point.eps,
    estimate: null,
    surprise: null,
    forward: false,
  }))
}
