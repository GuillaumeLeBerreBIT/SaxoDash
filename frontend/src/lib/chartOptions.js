export const CHART_TYPES = [
  ['candles', 'Candles'],
  ['bars', 'Bars'],
  ['line', 'Line'],
  ['area', 'Area'],
]

export const OVERLAY_DEFS = [
  { key: 'ma20', label: 'MA 20' },
  { key: 'ma50', label: 'MA 50' },
  { key: 'ma200', label: 'MA 200' },
  { key: 'ema9', label: 'EMA 9' },
  { key: 'bb', label: 'Bollinger (20, 2)' },
  { key: 'vwap', label: 'VWAP' },
]

export const PANE_DEFS = [
  { key: 'volume', label: 'Volume' },
  { key: 'rsi', label: 'RSI (14)' },
  { key: 'macd', label: 'MACD (12, 26, 9)' },
]

export const DEFAULT_PANE_HEIGHTS = { volume: 74, rsi: 92, macd: 92 }
export const ADVANCED_PANE_HEIGHTS = { volume: 96, rsi: 120, macd: 120 }

export function activeIndicatorCount({ overlays, panes }) {
  return Object.values({ ...overlays, ...panes }).filter(Boolean).length
}
