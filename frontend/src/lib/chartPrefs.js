import { CHART_TYPES } from './chartOptions'
import { INTERVALS } from './research'

const KEY = 'saxodash:chart-prefs'
const CHART_TYPE_KEYS = new Set(CHART_TYPES.map(([key]) => key))

export const DEFAULT_CHART_PREFS = {
  range: '6M',
  type: 'candles',
  overlays: { ma20: true, ma50: true, ma200: false, ema9: false, bb: false, vwap: false },
  panes: { volume: true, rsi: false, macd: false },
}

function sanitizeToggles(raw, defaults) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      typeof source[key] === 'boolean' ? source[key] : fallback,
    ]),
  )
}

export function sanitizeChartPrefs(raw, defaults = DEFAULT_CHART_PREFS) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    range: INTERVALS.includes(source.range) ? source.range : defaults.range,
    type: CHART_TYPE_KEYS.has(source.type) ? source.type : defaults.type,
    overlays: sanitizeToggles(source.overlays, defaults.overlays),
    panes: sanitizeToggles(source.panes, defaults.panes),
  }
}

export function readChartPrefs() {
  try {
    return sanitizeChartPrefs(JSON.parse(localStorage.getItem(KEY)))
  } catch {
    return sanitizeChartPrefs(null)
  }
}

export function writeChartPrefs({ range, type, overlays, panes }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ range, type, overlays, panes }))
    return true
  } catch {
    return false
  }
}
