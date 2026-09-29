import { describe, expect, it } from 'vitest'

import { WIDEST_RANGE_COUNT } from './research'
import { LATEST_TIME_VIEW, MIN_VISIBLE_BARS, panTimeView, resolveTimeWindow, zoomTimeView } from './timeWindow'

const history = { total: 1200, range: '1M' }

describe('resolveTimeWindow', () => {
  it('shows the newest bars of the range when not panned or zoomed', () => {
    expect(resolveTimeWindow(LATEST_TIME_VIEW, history)).toEqual({
      start: 1178,
      end: 1200,
      offset: 0,
      count: 22,
      total: 1200,
      maxOffset: 1178,
      zoomed: false,
    })
  })

  it('moves the window back by the offset', () => {
    expect(resolveTimeWindow({ offset: 100, barCount: null }, history)).toMatchObject({ start: 1078, end: 1100 })
  })

  it('stops at the oldest bar and never pans into the future', () => {
    expect(resolveTimeWindow({ offset: 5000, barCount: null }, history)).toMatchObject({ start: 0, end: 22, offset: 1178 })
    expect(resolveTimeWindow({ offset: -3, barCount: null }, history)).toMatchObject({ start: 1178, offset: 0 })
  })

  it('shows the zoomed number of bars instead of the range', () => {
    expect(resolveTimeWindow({ offset: 50, barCount: 100 }, history)).toMatchObject({
      start: 1050,
      end: 1150,
      count: 100,
      zoomed: true,
    })
  })

  it('cannot move when everything fetched is already shown', () => {
    expect(resolveTimeWindow({ offset: 40, barCount: null }, { total: 1200, range: 'ALL' })).toMatchObject({
      start: 0,
      end: 1200,
      maxOffset: 0,
    })
    expect(resolveTimeWindow({ offset: 4, barCount: 5000 }, { total: 10, range: '1M' })).toMatchObject({
      start: 0,
      end: 10,
      offset: 0,
    })
  })

  it('survives no bars', () => {
    expect(resolveTimeWindow({ offset: 3, barCount: 9 }, { total: 0, range: '1M' })).toMatchObject({
      start: 0,
      end: 0,
      offset: 0,
      maxOffset: 0,
    })
  })

  it('falls back to the widest range for an unknown key', () => {
    expect(resolveTimeWindow(LATEST_TIME_VIEW, { total: 5000, range: 'nonsense' }).count).toBe(WIDEST_RANGE_COUNT)
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
    expect(zoomTimeView(LATEST_TIME_VIEW, history, 5000).barCount).toBe(1200)
    expect(zoomTimeView(LATEST_TIME_VIEW, { total: 3, range: '1M' }, 2).barCount).toBe(3)
  })

  it('pulls a panned window back inside the history when zooming out', () => {
    expect(zoomTimeView({ offset: 1150, barCount: null }, history, 100)).toEqual({ offset: 1100, barCount: 100 })
  })

  it('keeps the pan when it still fits', () => {
    expect(zoomTimeView({ offset: 30, barCount: null }, history, 100)).toEqual({ offset: 30, barCount: 100 })
  })
})
