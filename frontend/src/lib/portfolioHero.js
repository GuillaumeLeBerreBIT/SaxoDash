const KINDS = { BUY: 'buy', SELL: 'sell' }

export function dayChange(positions, quotes) {
  let amount = 0
  let previous = 0
  let covered = 0
  for (const position of positions ?? []) {
    const pct = quotes?.get(position.uic)?.change_pct
    const value = Number(position.value)
    if (pct == null || !Number.isFinite(Number(pct)) || !Number.isFinite(value)) continue
    const before = value / (1 + Number(pct) / 100)
    amount += value - before
    previous += before
    covered += 1
  }
  if (covered === 0 || previous === 0) return null
  return { amount, pct: (amount / previous) * 100, covered }
}

const dayOf = (date) => String(date).slice(0, 10)

export function tradeMarkers(history, transactions) {
  if (!history?.length || !transactions?.length) return []
  const valueOn = new Map(history.map((row) => [dayOf(row.date), Number(row.portfolio_value)]))
  const grouped = new Map()
  for (const trade of transactions) {
    const kind = KINDS[trade.type]
    const date = dayOf(trade.date)
    if (!kind || !valueOn.has(date)) continue
    const key = `${date}:${kind}`
    if (!grouped.has(key)) grouped.set(key, { date, kind, value: valueOn.get(date), tickers: [] })
    const marker = grouped.get(key)
    if (trade.ticker && !marker.tickers.includes(trade.ticker)) marker.tickers.push(trade.ticker)
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
}
