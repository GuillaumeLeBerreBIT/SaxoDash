const DAY_MS = 86_400_000

function dayOfYear(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / DAY_MS)
}

const startsInJanuary = (rows) => rows[0].date.slice(5, 7) === '01'

export function seasonalSeries(bars) {
  const byYear = new Map()
  for (const bar of bars) {
    const year = Number(bar.date.slice(0, 4))
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year).push(bar)
  }

  return [...byYear.entries()]
    .filter(([, rows]) => startsInJanuary(rows) && rows[0].close > 0)
    .map(([year, rows]) => ({
      year,
      points: rows.map((bar) => ({ day: dayOfYear(bar.date), pct: (bar.close / rows[0].close - 1) * 100 })),
    }))
}
