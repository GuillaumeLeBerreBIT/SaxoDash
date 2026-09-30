import { useState } from 'react'

import { LATEST_TIME_VIEW } from '../../lib/timeWindow'

const FRESH_VIEW = { yScale: 1, yShift: 0, timeView: LATEST_TIME_VIEW }
const freshViews = (count) => Array.from({ length: count }, () => FRESH_VIEW)
const resolve = (next, current) => (typeof next === 'function' ? next(current) : next)
const slotKey = (slot) => (slot ? `${slot.symbol}:${slot.uic}:${slot.assetType}` : '')

export function usePaneViews(slots, range) {
  const keys = slots.map(slotKey)
  const [views, setViews] = useState(() => freshViews(keys.length))
  const [seen, setSeen] = useState({ range, keys })

  if (seen.range !== range) {
    const previous = seen.keys
    setSeen({ range, keys })
    setViews((current) =>
      keys.map((key, index) => (key !== '' && key === previous[index] ? { ...(current[index] ?? FRESH_VIEW), yShift: 0, timeView: LATEST_TIME_VIEW } : FRESH_VIEW)),
    )
  } else if (seen.keys.join('|') !== keys.join('|')) {
    const previous = seen.keys
    setSeen({ range, keys })
    setViews((current) =>
      keys.map((key, index) => (key !== '' && key === previous[index] ? (current[index] ?? FRESH_VIEW) : FRESH_VIEW)),
    )
  }

  const update = (index, change) =>
    setViews((current) => current.map((view, i) => (i === index ? { ...view, ...change(view) } : view)))

  const view = (index) => ({
    ...(views[index] ?? FRESH_VIEW),
    setYScale: (next) => update(index, (v) => ({ yScale: resolve(next, v.yScale) })),
    setYShift: (next) => update(index, (v) => ({ yShift: resolve(next, v.yShift) })),
    setTimeView: (next) => update(index, (v) => ({ timeView: resolve(next, v.timeView) })),
    resetView: () => update(index, () => FRESH_VIEW),
  })

  const rangePicked = () =>
    setViews((current) => current.map((v) => ({ ...(v ?? FRESH_VIEW), yShift: 0, timeView: LATEST_TIME_VIEW })))

  return { view, rangePicked }
}
