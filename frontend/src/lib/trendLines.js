export function indexForDate(bars, date) {
  const index = bars.findIndex((bar) => bar.date === date)
  return index === -1 ? null : index
}

export function toTrendLineShape(raw) {
  return {
    id: raw.id,
    start: { barDate: raw.start_bar_date, price: Number(raw.start_price) },
    end: { barDate: raw.end_bar_date, price: Number(raw.end_price) },
    label: raw.label ?? '',
  }
}

export function resolveTrendLines(lines, { allBars, windowStart, windowLength }) {
  const resolved = []

  for (const line of lines) {
    const i1 = indexForDate(allBars, line.start.barDate)
    const i2 = indexForDate(allBars, line.end.barDate)
    if (i1 == null || i2 == null || i1 === i2) continue

    const [iEarly, iLate] = i1 < i2 ? [i1, i2] : [i2, i1]
    const [pEarly, pLate] = i1 < i2 ? [line.start.price, line.end.price] : [line.end.price, line.start.price]

    const edgeIndexFull = windowStart + windowLength - 1
    if (iEarly > edgeIndexFull) continue

    const slope = (pLate - pEarly) / (iLate - iEarly)
    const startIndexFull = Math.max(iEarly, windowStart)
    const startPrice = pEarly + slope * (startIndexFull - iEarly)
    const edgePrice = pEarly + slope * (edgeIndexFull - iEarly)

    resolved.push({
      id: line.id,
      label: line.label,
      x1: startIndexFull - windowStart,
      y1: startPrice,
      x2: edgeIndexFull - windowStart,
      y2: edgePrice,
    })
  }

  return resolved
}
