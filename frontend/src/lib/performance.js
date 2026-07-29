export function toGainersLosersData(positions) {
  return positions
    .map((p) => ({ ticker: p.ticker, pnlPct: Number(p.pnl_pct) }))
    .sort((a, b) => b.pnlPct - a.pnlPct)
}
