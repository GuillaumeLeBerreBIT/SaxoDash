/** "Changed since you last looked" for watchlist rows. localStorage-backed
 *  and best-effort, same pattern as recentSymbols.js: a private window or
 *  disabled storage just means no badge, never an error. */
const KEY = 'saxodash:last-look'

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {}
  } catch {
    return {}
  }
}

export function recordLook(symbol, price) {
  if (!symbol || price == null) return
  try {
    const all = readAll()
    all[symbol] = { price, viewedAt: Date.now() }
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable - the feature degrades to no badge */
  }
}

export function changeSinceLastLook(symbol, currentPrice) {
  if (currentPrice == null) return null
  const record = readAll()[symbol]
  if (!record?.price) return null
  return ((currentPrice - record.price) / record.price) * 100
}
