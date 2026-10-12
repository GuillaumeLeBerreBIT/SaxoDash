import { useRef, useState } from 'react'

import { LATEST_TIME_VIEW } from '../../lib/timeWindow'

const FRESH_VIEW = { yScale: 1, yShift: 0, timeView: LATEST_TIME_VIEW, followDates: null }
const freshViews = (count) => Array.from({ length: count }, () => FRESH_VIEW)
const resolve = (next, current) => (typeof next === 'function' ? next(current) : next)
const slotKey = (slot) => (slot ? `${slot.symbol}:${slot.uic}:${slot.assetType}` : '')

export function usePaneViews(slots, range, linked = false) {
  const keys = slots.map(slotKey)
  const [views, setViews] = useState(() => freshViews(keys.length))
  const [seen, setSeen] = useState({ range, keys })
  const [linkedDates, setLinkedDates] = useState(null)
  const windows = useRef([])

  if (seen.range !== range) {
    const previous = seen.keys
    setSeen({ range, keys })
    setLinkedDates(null)
    setViews((current) =>
      keys.map((key, index) =>
        key !== '' && key === previous[index]
          ? { ...(current[index] ?? FRESH_VIEW), yShift: 0, timeView: LATEST_TIME_VIEW, followDates: null }
          : FRESH_VIEW,
      ),
    )
  } else if (seen.keys.join('|') !== keys.join('|')) {
    const previous = seen.keys
    const arrival = linked && linkedDates ? { ...FRESH_VIEW, followDates: linkedDates } : FRESH_VIEW
    setSeen({ range, keys })
    setViews((current) =>
      keys.map((key, index) => (key !== '' && key === previous[index] ? (current[index] ?? FRESH_VIEW) : arrival)),
    )
  }

  const update = (index, change) =>
    setViews((current) => current.map((view, i) => (i === index ? { ...view, ...change(view) } : view)))

  const commitTimeView = (index, timeView, dates) => {
    setViews((current) =>
      current.map((view, i) => {
        if (i === index) return { ...view, timeView, followDates: null }
        return linked && dates && slots[i] ? { ...view, followDates: dates } : view
      }),
    )
    if (linked && dates) setLinkedDates(dates)
  }

  const alignTo = (index) => {
    const dates = windows.current[index]
    if (!dates) {
      setLinkedDates(null)
      return
    }
    setViews((current) => current.map((view, i) => (i !== index && slots[i] ? { ...view, followDates: dates } : view)))
    setLinkedDates(dates)
  }

  const view = (index) => ({
    ...(views[index] ?? FRESH_VIEW),
    setYScale: (next) => update(index, (v) => ({ yScale: resolve(next, v.yScale) })),
    setYShift: (next) => update(index, (v) => ({ yShift: resolve(next, v.yShift) })),
    setTimeView: (next) => update(index, (v) => ({ timeView: resolve(next, v.timeView), followDates: null })),
    commitTimeView: (timeView, dates) => commitTimeView(index, timeView, dates),
    reportWindow: (dates) => {
      windows.current[index] = dates
    },
    resetView: () => update(index, () => FRESH_VIEW),
  })

  const rangePicked = () => {
    setLinkedDates(null)
    setViews((current) =>
      current.map((v) => ({ ...(v ?? FRESH_VIEW), yShift: 0, timeView: LATEST_TIME_VIEW, followDates: null })),
    )
  }

  return { view, rangePicked, alignTo }
}
