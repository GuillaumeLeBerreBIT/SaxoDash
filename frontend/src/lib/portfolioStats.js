import { fmtPct } from './format'

export function needsDaysNote(days) {
  if (days == null || days <= 0) return null
  return days === 1 ? 'needs 1 more day' : `needs ${days} more days`
}

export function pctOrDash(value, decimals = 1) {
  return fmtPct(value, { sign: false, decimals })
}

export function drawdownDomain(series, minSpan = 5) {
  const lowest = series.reduce((low, point) => Math.min(low, point.dd), 0)
  return [Math.floor(Math.min(lowest, -minSpan)), 0]
}

export function yearTicks(rows, maxLabels = 11) {
  const years = rows.map((row) => row.month).filter((month) => month % 12 === 0)
  if (years.length <= maxLabels) return years
  const step = [2, 5, 10].find((n) => Math.ceil(years.length / n) <= maxLabels) ?? 10
  return years.filter((month) => (month / 12) % step === 0)
}
