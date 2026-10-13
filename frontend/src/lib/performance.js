export function toGainersLosersData(positions) {
  return positions
    .map((p) => ({ ticker: p.ticker, pnlPct: Number(p.pnl_pct) }))
    .sort((a, b) => b.pnlPct - a.pnlPct)
}

export const RETURN_WINDOWS = [
  { key: '1W', days: 7 },
  { key: '1M', months: 1 },
  { key: '3M', months: 3 },
  { key: '6M', months: 6 },
  { key: 'YTD', yearStart: true },
  { key: '1Y', months: 12 },
]

const toIso = (date) => date.toISOString().slice(0, 10)

function startDate(latestIso, { days, months, yearStart }) {
  const [year, month, day] = latestIso.split('-').map(Number)
  if (yearStart) return `${year - 1}-12-31`
  if (days) return toIso(new Date(Date.UTC(year, month - 1, day - days)))
  const target = new Date(Date.UTC(year, month - 1 - months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return toIso(target)
}

function closeOnOrBefore(bars, iso) {
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    if (bars[i].date <= iso) return bars[i].close
  }
  return null
}

export function trailingReturns(bars) {
  const latest = bars[bars.length - 1]
  return RETURN_WINDOWS.map(({ key, ...shift }) => {
    if (!latest) return { key, pct: null }
    const start = closeOnOrBefore(bars, startDate(latest.date, shift))
    return { key, pct: start ? (latest.close / start - 1) * 100 : null }
  })
}
