import { useState } from 'react'

const KEY = 'saxodash:research-price-options'
const DEFAULTS = { showPrevious: true, showVolume: false }

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    return {
      showPrevious: typeof saved?.showPrevious === 'boolean' ? saved.showPrevious : DEFAULTS.showPrevious,
      showVolume: typeof saved?.showVolume === 'boolean' ? saved.showVolume : DEFAULTS.showVolume,
    }
  } catch {
    return DEFAULTS
  }
}

function write(options) {
  try {
    localStorage.setItem(KEY, JSON.stringify(options))
  } catch {
    return
  }
}

export function usePriceChartOptions() {
  const [options, setOptions] = useState(read)
  const update = (patch) => {
    const next = { ...options, ...patch }
    write(next)
    setOptions(next)
  }
  return {
    ...options,
    setShowPrevious: (showPrevious) => update({ showPrevious }),
    setShowVolume: (showVolume) => update({ showVolume }),
  }
}
