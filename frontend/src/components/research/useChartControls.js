import { useEffect, useState } from 'react'

import { readChartPrefs, writeChartPrefs } from '../../lib/chartPrefs'

export function useChartControls() {
  const [prefs, setPrefs] = useState(readChartPrefs)
  const [yScale, setYScale] = useState(1)

  useEffect(() => {
    writeChartPrefs(prefs)
  }, [prefs])

  return {
    ...prefs,
    yScale,
    setYScale,
    setRange: (next) => setPrefs((p) => ({ ...p, range: next })),
    setType: (next) => setPrefs((p) => ({ ...p, type: next })),
    toggleOverlay: (key) => setPrefs((p) => ({ ...p, overlays: { ...p.overlays, [key]: !p.overlays[key] } })),
    togglePane: (key) => setPrefs((p) => ({ ...p, panes: { ...p.panes, [key]: !p.panes[key] } })),
  }
}
