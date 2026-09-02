import { useState } from 'react'

/** The chart's own view state: range, drawing style, overlays and panes.
 *
 *  Six pieces of state that only ever travel together. Bundling them here
 *  keeps the page from declaring six useStates it does not otherwise care
 *  about, and lets ChartPanel take one `controls` prop instead of twelve.
 */
export function useChartControls({ range = '3M', type = 'candles' } = {}) {
  const [state, setState] = useState({
    range,
    type,
    overlays: { ma20: true, ma50: true, ema9: false, bb: false, vwap: false },
    panes: { volume: true, rsi: false, macd: false },
  })

  return {
    ...state,
    setRange: (next) => setState((s) => ({ ...s, range: next })),
    setType: (next) => setState((s) => ({ ...s, type: next })),
    toggleOverlay: (key) =>
      setState((s) => ({ ...s, overlays: { ...s.overlays, [key]: !s.overlays[key] } })),
    togglePane: (key) => setState((s) => ({ ...s, panes: { ...s.panes, [key]: !s.panes[key] } })),
  }
}
