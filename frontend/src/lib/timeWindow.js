import { RANGE_COUNTS, WIDEST_RANGE_COUNT } from './research'

export const MIN_VISIBLE_BARS = 5
export const FUTURE_SLOTS = 11
export const LATEST_TIME_VIEW = { offset: 0, barCount: null }

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

export function rightMargin(slots) {
  return Math.min(FUTURE_SLOTS, Math.floor(slots / 4))
}

export function slotsForBars(bars) {
  return bars + Math.min(FUTURE_SLOTS, Math.floor(bars / 3))
}

export function resolveTimeWindow(view, { total, range }) {
  if (total === 0) {
    return { start: 0, end: 0, pad: 0, slots: 0, offset: 0, total, maxOffset: 0, zoomed: view.barCount != null }
  }
  const wanted = view.barCount ?? slotsForBars(Math.min(total, RANGE_COUNTS[range] ?? WIDEST_RANGE_COUNT))
  const slots = Math.min(slotsForBars(total), wanted)
  const margin = rightMargin(slots)
  const maxOffset = total + margin - slots
  const offset = clamp(Math.round(view.offset) || 0, 0, maxOffset)
  const edge = total + margin - offset
  const end = Math.min(total, edge)
  return {
    start: edge - slots,
    end,
    pad: edge - end,
    slots,
    offset,
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
  const slots = Math.min(slotsForBars(history.total), Math.max(MIN_VISIBLE_BARS, Math.round(barCount)))
  const { offset } = resolveTimeWindow(view, history)
  return { offset: clamp(offset, 0, history.total + rightMargin(slots) - slots), barCount: slots }
}

export function windowToDates(window, bars) {
  const first = bars[window.start]
  const last = bars[window.end - 1]
  return first && last ? { from: first.date, to: last.date, pad: window.pad } : null
}

export function futureSessionDates(after, count) {
  const day = new Date(`${after}T00:00:00Z`)
  if (Number.isNaN(day.getTime())) return []
  const dates = []
  while (dates.length < count) {
    day.setUTCDate(day.getUTCDate() + 1)
    const weekday = day.getUTCDay()
    if (weekday !== 0 && weekday !== 6) dates.push(day.toISOString().slice(0, 10))
  }
  return dates
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

export function timeViewForDates({ from, to, pad = 0 }, bars) {
  const total = bars.length
  if (total === 0) return LATEST_TIME_VIEW
  const last = barIndexAtOrBefore(bars, to)
  if (last === -1) return { offset: total, barCount: null }
  const first = barIndexAtOrAfter(bars, from)
  if (first === -1) return LATEST_TIME_VIEW
  const slots = Math.min(slotsForBars(total), Math.max(MIN_VISIBLE_BARS, last - first + 1 + pad))
  const margin = rightMargin(slots)
  return { offset: clamp(total + margin - (last + 1 + pad), 0, total + margin - slots), barCount: slots }
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
