/** Recently-viewed Research symbols, newest first, for the ⌘K palette and the
 *  Research recent-chip strip. localStorage-backed and best-effort: a private
 *  window or disabled storage just means the feature is empty, never an error. */
const KEY = 'saxodash:recent-symbols'
const CAP = 8

export function readRecentSymbols() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? []
  } catch {
    return []
  }
}

export function pushRecentSymbol(symbol) {
  if (!symbol) return
  try {
    const next = [symbol, ...readRecentSymbols().filter((s) => s !== symbol)].slice(0, CAP)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable - the feature degrades to empty */
  }
}
