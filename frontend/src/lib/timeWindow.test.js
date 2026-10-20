import { describe, expect, it } from 'vitest'

import { WIDEST_RANGE_COUNT } from './research'
import {
  LATEST_TIME_VIEW,
  FUTURE_SLOTS,
  MIN_VISIBLE_BARS,
  barIndexAtOrAfter,
  barIndexAtOrBefore,
  futureSessionDates,
  matchBarByDate,
  panTimeView,
  resolveTimeViewChange,
  resolveTimeWindow,
  rightMargin,
  slotsForBars,
  timeViewForDates,
  windowToDates,
  zoomTimeView,
} from './timeWindow'

const history = { total: 1200, range: '1M' }

describe('resolveTimeWindow', () => {
  it('shows the whole range followed by empty future slots when not panned or zoomed', () => {
    expect(resolveTimeWindow(LATEST_TIME_VIEW, history)).toEqual({
      start: 1178,
      end: 1200,
      pad: 7,
      slots: 29,
      offset: 0,
      total: 1200,
      maxOffset: 1178,
      zoomed: false,
    })
  })

  it('fills the future slots with real bars as it pans back, keeping the width', () => {
    expect(resolveTimeWindow({ offset: 3, barCount: null }, history)).toMatchObject({ start: 1175, end: 1200, pad: 4, slots: 29 })
    expect(resolveTimeWindow({ offset: 100, barCount: null }, history)).toMatchObject({ start: 1078, end: 1107, pad: 0 })
  })

  it('stops at the oldest bar and never pans past the margin', () => {
    expect(resolveTimeWindow({ offset: 5000, barCount: null }, history)).toMatchObject({ start: 0, end: 29, offset: 1178 })
    expect(resolveTimeWindow({ offset: -3, barCount: null }, history)).toMatchObject({ start: 1178, pad: 7, offset: 0 })
  })

  it('shows the zoomed number of slots instead of the range', () => {
    expect(resolveTimeWindow({ offset: 50, barCount: 100 }, history)).toMatchObject({
      start: 1061,
      end: 1161,
      slots: 100,
      zoomed: true,
    })
  })

  it('cannot move when everything fetched is already shown', () => {
    expect(resolveTimeWindow({ offset: 40, barCount: null }, { total: 1200, range: 'ALL' })).toMatchObject({
      start: 0,
      end: 1200,
      pad: 11,
      maxOffset: 0,
    })
    expect(resolveTimeWindow({ offset: 4, barCount: 5000 }, { total: 10, range: '1M' })).toMatchObject({
      start: 0,
      end: 10,
      pad: 3,
      offset: 0,
    })
  })

  it('survives no bars', () => {
    expect(resolveTimeWindow({ offset: 3, barCount: 9 }, { total: 0, range: '1M' })).toMatchObject({
      start: 0,
      end: 0,
      pad: 0,
      offset: 0,
      maxOffset: 0,
    })
  })

  it('falls back to the widest range for an unknown key', () => {
    const window = resolveTimeWindow(LATEST_TIME_VIEW, { total: 5000, range: 'nonsense' })
    expect(window.end - window.start).toBe(WIDEST_RANGE_COUNT)
  })
})

describe('the right margin', () => {
  it('is about fifteen calendar days of weekdays, at most a quarter of the width', () => {
    expect(rightMargin(5)).toBe(1)
    expect(rightMargin(29)).toBe(7)
    expect(rightMargin(77)).toBe(FUTURE_SLOTS)
    expect(rightMargin(1211)).toBe(FUTURE_SLOTS)
  })

  it('adds to a bar count so that many bars still show', () => {
    for (const bars of [5, 7, 22, 66, 130, 252, 1200]) {
      const slots = slotsForBars(bars)
      expect(slots - rightMargin(slots)).toBe(bars)
    }
  })
})

describe('panTimeView', () => {
  it('keeps the offset between the latest and the oldest bar', () => {
    expect(panTimeView(LATEST_TIME_VIEW, history, 40)).toEqual({ offset: 40, barCount: null })
    expect(panTimeView(LATEST_TIME_VIEW, history, 9999)).toEqual({ offset: 1178, barCount: null })
    expect(panTimeView({ offset: 10, barCount: 50 }, history, -5)).toEqual({ offset: 0, barCount: 50 })
  })

  it('moves relative to where the window really is', () => {
    const stale = { offset: 9999, barCount: null }
    expect(panTimeView(stale, history, (current) => current - 3)).toEqual({ offset: 1175, barCount: null })
  })
})

describe('zoomTimeView', () => {
  it('keeps a readable minimum and never exceeds what was fetched', () => {
    expect(zoomTimeView(LATEST_TIME_VIEW, history, 2).barCount).toBe(MIN_VISIBLE_BARS)
    expect(zoomTimeView(LATEST_TIME_VIEW, history, 5000).barCount).toBe(1211)
    expect(zoomTimeView(LATEST_TIME_VIEW, { total: 3, range: '1M' }, 2).barCount).toBe(4)
  })

  it('pulls a panned window back inside the history when zooming out', () => {
    expect(zoomTimeView({ offset: 1150, barCount: null }, history, 100)).toEqual({ offset: 1111, barCount: 100 })
  })

  it('keeps the pan when it still fits', () => {
    expect(zoomTimeView({ offset: 30, barCount: null }, history, 100)).toEqual({ offset: 30, barCount: 100 })
  })
})

const day = (n) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10)
const barsOn = (days) => days.map((n) => ({ date: day(n) }))
const run = (from, to) => barsOn(Array.from({ length: to - from + 1 }, (_, i) => from + i))

describe('windowToDates', () => {
  it('names the first and last visible bar', () => {
    const window = resolveTimeWindow({ offset: 10, barCount: 20 }, { total: 100, range: '1M' })
    expect(windowToDates(window, run(0, 99))).toEqual({ from: day(75), to: day(94), pad: 0 })
  })

  it('carries the empty slots after the latest bar', () => {
    const window = resolveTimeWindow(LATEST_TIME_VIEW, { total: 100, range: '1M' })
    expect(windowToDates(window, run(0, 99))).toEqual({ from: day(78), to: day(99), pad: 7 })
  })

  it('has no dates when there are no bars', () => {
    const window = resolveTimeWindow(LATEST_TIME_VIEW, { total: 0, range: '1M' })
    expect(windowToDates(window, [])).toBeNull()
  })
})

describe('barIndexAtOrBefore and barIndexAtOrAfter', () => {
  const bars = barsOn([0, 1, 2, 4, 5])

  it('finds an exact date', () => {
    expect(barIndexAtOrBefore(bars, day(2))).toBe(2)
    expect(barIndexAtOrAfter(bars, day(2))).toBe(2)
  })

  it('falls back across a missing day', () => {
    expect(barIndexAtOrBefore(bars, day(3))).toBe(2)
    expect(barIndexAtOrAfter(bars, day(3))).toBe(3)
  })

  it('answers -1 outside the data', () => {
    expect(barIndexAtOrBefore(bars, day(-5))).toBe(-1)
    expect(barIndexAtOrAfter(bars, day(50))).toBe(-1)
    expect(barIndexAtOrBefore([], day(1))).toBe(-1)
    expect(barIndexAtOrAfter([], day(1))).toBe(-1)
  })
})

describe('timeViewForDates', () => {
  const dates = { from: day(70), to: day(89) }

  it('round-trips a window on the same calendar', () => {
    expect(timeViewForDates(dates, run(0, 99))).toEqual({ offset: 15, barCount: 20 })
  })

  it('round-trips the empty slots after the latest bar', () => {
    expect(timeViewForDates({ from: day(78), to: day(99), pad: 7 }, run(0, 99))).toEqual({ offset: 0, barCount: 29 })
  })

  it('follows a symbol that ends earlier', () => {
    expect(timeViewForDates(dates, run(0, 89))).toEqual({ offset: 5, barCount: 20 })
  })

  it('counts bars, not days, across a missing day', () => {
    const holiday = barsOn(Array.from({ length: 100 }, (_, i) => i).filter((n) => n !== 75))
    expect(timeViewForDates(dates, holiday)).toEqual({ offset: 14, barCount: 19 })
  })

  it('shows what a shorter history has when the window starts before its first bar', () => {
    expect(timeViewForDates(dates, run(80, 99))).toEqual({ offset: 12, barCount: 10 })
  })

  it('clamps to the oldest bars when the window ends before the data starts', () => {
    expect(timeViewForDates({ from: day(10), to: day(20) }, run(80, 99))).toEqual({ offset: 20, barCount: null })
  })

  it('clamps to the latest bars when the window starts after the data ends', () => {
    expect(timeViewForDates({ from: day(70), to: day(90) }, run(0, 50))).toEqual(LATEST_TIME_VIEW)
  })

  it('never shows fewer than the minimum number of bars', () => {
    expect(timeViewForDates({ from: day(10), to: day(11) }, run(0, 99))).toEqual({
      offset: 89,
      barCount: MIN_VISIBLE_BARS,
    })
  })

  it('never asks for more bars than exist', () => {
    expect(timeViewForDates({ from: day(0), to: day(99) }, run(0, 9))).toEqual({ offset: 2, barCount: 10 })
  })

  it('shows the latest view when there are no bars', () => {
    expect(timeViewForDates(dates, [])).toEqual(LATEST_TIME_VIEW)
  })
})

describe('matchBarByDate', () => {
  const bars = barsOn([0, 1, 2, 4, 5])

  it('matches an exact day', () => {
    expect(matchBarByDate(bars, day(2))).toEqual({ index: 2, exact: true })
  })

  it('matches the previous bar when the day is missing and says so', () => {
    expect(matchBarByDate(bars, day(3))).toEqual({ index: 2, exact: false })
  })

  it('draws nothing outside the visible bars', () => {
    expect(matchBarByDate(bars, day(-1))).toBeNull()
    expect(matchBarByDate(bars, day(6))).toBeNull()
  })

  it('draws nothing without a date or without bars', () => {
    expect(matchBarByDate(bars, null)).toBeNull()
    expect(matchBarByDate([], day(1))).toBeNull()
  })
})

describe('resolveTimeViewChange', () => {
  const bars = run(0, 99)
  const context = { bars, range: '1M' }

  it('commits a value as given, with the dates of its window', () => {
    expect(resolveTimeViewChange({ offset: 10, barCount: 20 }, LATEST_TIME_VIEW, context)).toEqual({
      timeView: { offset: 10, barCount: 20 },
      dates: { from: day(75), to: day(94), pad: 0 },
    })
  })

  it('hands an updater the view the pane is displaying, not a stored one', () => {
    const displayed = { offset: 30, barCount: 20 }
    const result = resolveTimeViewChange((view) => ({ ...view, offset: view.offset + 5 }), displayed, context)
    expect(result.timeView).toEqual({ offset: 35, barCount: 20 })
    expect(result.dates).toEqual({ from: day(50), to: day(69), pad: 0 })
  })

  it('has no dates when the pane has no bars', () => {
    expect(resolveTimeViewChange(LATEST_TIME_VIEW, LATEST_TIME_VIEW, { bars: [], range: '1M' }).dates).toBeNull()
  })
})

describe('futureSessionDates', () => {
  it('lists the weekdays after a date, skipping the weekend', () => {
    expect(futureSessionDates('2026-10-15', 4)).toEqual(['2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21'])
  })

  it('lists nothing without a date or a count', () => {
    expect(futureSessionDates(null, 3)).toEqual([])
    expect(futureSessionDates('2026-10-15', 0)).toEqual([])
    expect(futureSessionDates('2026-07-35', 3)).toEqual([])
  })
})
