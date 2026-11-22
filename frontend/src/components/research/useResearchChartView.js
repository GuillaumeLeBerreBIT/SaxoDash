import { useState } from 'react'

const KEY = 'saxodash:research-chart-view'
const VIEWS = ['price', 'advanced']
const DEFAULT_VIEW = 'price'

function readView() {
  try {
    const saved = localStorage.getItem(KEY)
    return VIEWS.includes(saved) ? saved : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

function writeView(next) {
  try {
    localStorage.setItem(KEY, next)
  } catch {
    return false
  }
  return true
}

export function useResearchChartView() {
  const [view, setViewState] = useState(readView)
  const setView = (next) => {
    if (!VIEWS.includes(next)) return
    writeView(next)
    setViewState(next)
  }
  return [view, setView]
}
