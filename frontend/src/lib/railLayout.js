export const RAIL_WIDTH = { key: 'saxodash:chart-rail-width', min: 260, max: 560, initial: 300 }
export const WATCHLIST_HEIGHT = { key: 'saxodash:chart-watchlist-height', min: 160, max: 720, initial: 340 }
export const RESIZE_STEP = 16

export function clampSize(value, { min, max }) {
  return Math.round(Math.min(max, Math.max(min, value)))
}

export function readSize(key, limits) {
  try {
    const stored = Number(localStorage.getItem(key))
    return Number.isFinite(stored) && stored > 0 ? clampSize(stored, limits) : limits.initial
  } catch {
    return limits.initial
  }
}

export function writeSize(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    return
  }
}
