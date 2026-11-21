import { useState } from 'react'

const KEY = 'saxodash:research-chart-type'
const TYPES = ['line', 'candles']
const DEFAULT_TYPE = 'line'

function readType() {
  try {
    const saved = localStorage.getItem(KEY)
    return TYPES.includes(saved) ? saved : DEFAULT_TYPE
  } catch {
    return DEFAULT_TYPE
  }
}

function writeType(next) {
  try {
    localStorage.setItem(KEY, next)
  } catch {
    return false
  }
  return true
}

export function useResearchChartType() {
  const [type, setTypeState] = useState(readType)
  const setType = (next) => {
    if (!TYPES.includes(next)) return
    writeType(next)
    setTypeState(next)
  }
  return [type, setType]
}
