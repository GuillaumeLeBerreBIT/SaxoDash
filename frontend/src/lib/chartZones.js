import { indexForDate } from './trendLines'

export function toZoneShape(raw) {
  return {
    id: raw.id,
    start: raw.start_bar_date,
    end: raw.end_bar_date,
    low: Number(raw.low_price),
    high: Number(raw.high_price),
    label: raw.label ?? '',
  }
}

export function resolveZones(zones, { allBars, windowStart, windowLength }) {
  const edgeIndex = windowStart + windowLength - 1
  const resolved = []

  for (const zone of zones) {
    const first = indexForDate(allBars, zone.start)
    const last = indexForDate(allBars, zone.end)
    if (first == null || last == null) continue

    const from = Math.max(Math.min(first, last), windowStart)
    const to = Math.min(Math.max(first, last), edgeIndex)
    if (from > to) continue

    resolved.push({
      id: zone.id,
      label: zone.label,
      low: zone.low,
      high: zone.high,
      x1: from - windowStart,
      x2: to - windowStart,
    })
  }

  return resolved
}

export function zoneFromPoints(start, end) {
  const [early, late] = start.barDate <= end.barDate ? [start, end] : [end, start]
  const [low, high] = start.price <= end.price ? [start.price, end.price] : [end.price, start.price]
  return { startBarDate: early.barDate, endBarDate: late.barDate, low, high }
}
