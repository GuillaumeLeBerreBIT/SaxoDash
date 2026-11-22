export function pickedSector(sectors, requested, symbol) {
  if (!sectors?.length) return null
  const byName = sectors.find((entry) => entry.sector === requested)
  if (byName) return byName
  const holding = symbol ? sectors.find((entry) => entry.stocks.some((stock) => stock.ticker === symbol)) : null
  return holding ?? sectors[0]
}
