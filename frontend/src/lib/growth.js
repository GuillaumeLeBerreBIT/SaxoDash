export const GROWTH_RANGES = [
  { value: '1M', label: '1M', days: 30 },
  { value: '3M', label: '3M', days: 91 },
  { value: 'ALL', label: 'Since start', days: null },
]

const DAY = 86_400_000

export function growthFor(rows, range) {
  if (!rows?.length) return []
  const days = GROWTH_RANGES.find((option) => option.value === range)?.days
  if (!days) return rows
  const end = new Date(`${rows[rows.length - 1].date}T00:00:00`).getTime()
  const cut = rows.filter((row) => new Date(`${row.date}T00:00:00`).getTime() >= end - days * DAY)
  const first = cut[0]
  const baseBench = cut.find((row) => row.benchmark != null)?.benchmark
  return cut.map((row) => ({
    date: row.date,
    portfolio: (row.portfolio / first.portfolio) * 100,
    benchmark: row.benchmark == null || baseBench == null ? null : (row.benchmark / baseBench) * 100,
  }))
}

export function lastPct(rows, key) {
  const last = rows?.[rows.length - 1]?.[key]
  return last == null ? null : last - 100
}
