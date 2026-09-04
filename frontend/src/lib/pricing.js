/** How a position's price was arrived at, in the words the UI shows.
 *
 *  The backend records which rung of the price ladder answered. A mark that
 *  isn't live is worth disclosing rather than passing off as a live tick.
 */
export const PRICE_BASIS = {
  live: {
    label: 'Live',
    tone: 'emerald',
    note: 'Live price from Saxo',
  },
  derived: {
    label: 'Derived',
    tone: 'amber',
    note: "Marked from Saxo's profit/loss — this account has no live price feed",
  },
  cost: {
    label: 'At cost',
    tone: 'red',
    note: 'Could not be priced; showing what you paid',
  },
}

// Weakest first, so a book is only as good as its worst-priced position.
const BY_CONFIDENCE = ['cost', 'derived', 'live']

export function priceBasis(source) {
  return PRICE_BASIS[source] ?? PRICE_BASIS.live
}

export function weakestPriceBasis(positions) {
  const sources = new Set(positions.map((p) => p.price_source).filter(Boolean))
  const weakest = BY_CONFIDENCE.find((source) => sources.has(source))
  return weakest ? priceBasis(weakest) : null
}

/** The oldest mark in the book — how stale the prices are as a whole. */
export function oldestPricedAt(positions) {
  const stamps = positions.map((p) => p.priced_at).filter(Boolean).sort()
  return stamps[0] ?? null
}

/** A stamp you can judge staleness from.
 *
 *  HH:MM alone made a sync from last Tuesday read as "09:15" - indistinguishable
 *  from nine minutes ago, which is the exact blind spot SyncRun exists to close.
 *  Anything not from today carries its date.
 */
export function fmtClock(iso, now = new Date()) {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null

  const time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (at.toDateString() === now.toDateString()) return time

  const days = Math.floor((now - at) / 86_400_000)
  if (days <= 6) {
    return `${at.toLocaleDateString([], { weekday: 'short' })} ${time}`
  }
  return `${at.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`
}
