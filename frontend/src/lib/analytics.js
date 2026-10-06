import { UNKNOWN, fmtNum } from './format'

export function needsDaysNote(days) {
  if (days == null || days <= 0) return null
  return days === 1 ? 'needs 1 more day' : `needs ${days} more days`
}

export function pctOrDash(value, decimals = 1) {
  return value == null ? UNKNOWN : `${fmtNum(value, decimals)}%`
}

export function drawdownDomain(series, minSpan = 5) {
  const lowest = series.reduce((low, point) => Math.min(low, point.dd), 0)
  return [Math.floor(Math.min(lowest, -minSpan)), 0]
}

export function yearTicks(rows) {
  return rows.map((row) => row.month).filter((month) => month % 12 === 0)
}
