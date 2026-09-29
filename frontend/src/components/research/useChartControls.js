import { useEffect, useState } from 'react'

import { readChartPrefs, writeChartPrefs } from '../../lib/chartPrefs'
import { LATEST_TIME_VIEW } from '../../lib/timeWindow'

export function useChartControls() {
  const [prefs, setPrefs] = useState(readChartPrefs)
  const [yScale, setYScale] = useState(1)
  const [yShift, setYShift] = useState(0)
  const [timeView, setTimeView] = useState(LATEST_TIME_VIEW)

  useEffect(() => {
    writeChartPrefs(prefs)
  }, [prefs])

  return {
    ...prefs,
    yScale,
    setYScale,
    yShift,
    setYShift,
    timeView,
    setTimeView,
    resetView: () => {
      setYScale(1)
      setYShift(0)
      setTimeView(LATEST_TIME_VIEW)
    },
    setRange: (next) => {
      setPrefs((p) => ({ ...p, range: next }))
      setYShift(0)
      setTimeView(LATEST_TIME_VIEW)
    },
    setType: (next) => setPrefs((p) => ({ ...p, type: next })),
    toggleOverlay: (key) => setPrefs((p) => ({ ...p, overlays: { ...p.overlays, [key]: !p.overlays[key] } })),
    togglePane: (key) => setPrefs((p) => ({ ...p, panes: { ...p.panes, [key]: !p.panes[key] } })),
  }
}
