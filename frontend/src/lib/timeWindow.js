import { RANGE_COUNTS, WIDEST_RANGE_COUNT } from './research'

export const MIN_VISIBLE_BARS = 5
export const LATEST_TIME_VIEW = { offset: 0, barCount: null }

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

export function resolveTimeWindow(view, { total, range }) {
  const count = Math.min(total, view.barCount ?? RANGE_COUNTS[range] ?? WIDEST_RANGE_COUNT)
  const maxOffset = total - count
  const offset = clamp(Math.round(view.offset) || 0, 0, maxOffset)
  return {
    start: maxOffset - offset,
    end: total - offset,
    offset,
    count,
    total,
    maxOffset,
    zoomed: view.barCount != null,
  }
}

export function panTimeView(view, history, next) {
  const { offset, maxOffset } = resolveTimeWindow(view, history)
  const wanted = typeof next === 'function' ? next(offset) : next
  return { ...view, offset: clamp(wanted, 0, maxOffset) }
}

export function zoomTimeView(view, history, barCount) {
  const count = Math.min(history.total, Math.max(MIN_VISIBLE_BARS, Math.round(barCount)))
  const { offset } = resolveTimeWindow(view, history)
  return { offset: clamp(offset, 0, history.total - count), barCount: count }
}

export function windowToDates(window, bars) {
  const first = bars[window.start]
  const last = bars[window.end - 1]
  return first && last ? { from: first.date, to: last.date } : null
}

export function barIndexAtOrBefore(bars, date) {
  let low = 0
  let high = bars.length - 1
  let found = -1
  while (low <= high) {
    const middle = (low + high) >> 1
    if (bars[middle].date <= date) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

export function barIndexAtOrAfter(bars, date) {
  const before = barIndexAtOrBefore(bars, date)
  if (before !== -1 && bars[before].date === date) return before
  return before + 1 < bars.length ? before + 1 : -1
}

export function timeViewForDates({ from, to }, bars) {
  const total = bars.length
  if (total === 0) return LATEST_TIME_VIEW
  const last = barIndexAtOrBefore(bars, to)
  if (last === -1) return { offset: total, barCount: null }
  const first = barIndexAtOrAfter(bars, from)
  if (first === -1) return LATEST_TIME_VIEW
  const width = Math.min(total, Math.max(MIN_VISIBLE_BARS, last - first + 1))
  return { offset: clamp(total - 1 - last, 0, total - width), barCount: width }
}

export function matchBarByDate(bars, date) {
  if (date == null || bars.length === 0) return null
  if (date < bars[0].date || date > bars[bars.length - 1].date) return null
  const index = barIndexAtOrBefore(bars, date)
  return { index, exact: bars[index].date === date }
}

export function resolveTimeViewChange(next, current, { bars, range }) {
  const timeView = typeof next === 'function' ? next(current) : next
  const window = resolveTimeWindow(timeView, { total: bars.length, range })
  return { timeView, dates: windowToDates(window, bars) }
}
