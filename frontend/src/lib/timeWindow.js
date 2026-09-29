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
