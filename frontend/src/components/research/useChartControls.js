import { useEffect, useState } from 'react'

import { readChartPrefs, writeChartPrefs } from '../../lib/chartPrefs'

export function useChartControls() {
  const [prefs, setPrefs] = useState(readChartPrefs)
  const [yScale, setYScale] = useState(1)
  const [yShift, setYShift] = useState(0)
  const [timeOffset, setTimeOffset] = useState(0)

  useEffect(() => {
    writeChartPrefs(prefs)
  }, [prefs])

  return {
    ...prefs,
    yScale,
    setYScale,
    yShift,
    setYShift,
    timeOffset,
    setTimeOffset,
    resetView: () => {
      setYScale(1)
      setYShift(0)
      setTimeOffset(0)
    },
    setRange: (next) => {
      setPrefs((p) => ({ ...p, range: next }))
      setTimeOffset(0)
      setYShift(0)
    },
    setType: (next) => setPrefs((p) => ({ ...p, type: next })),
    toggleOverlay: (key) => setPrefs((p) => ({ ...p, overlays: { ...p.overlays, [key]: !p.overlays[key] } })),
    togglePane: (key) => setPrefs((p) => ({ ...p, panes: { ...p.panes, [key]: !p.panes[key] } })),
  }
}
