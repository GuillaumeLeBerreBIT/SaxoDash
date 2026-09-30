import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { LATEST_TIME_VIEW } from '../../lib/timeWindow'
import { usePaneViews } from './usePaneViews'

const FRESH = { yScale: 1, yShift: 0, timeView: LATEST_TIME_VIEW }
const nvda = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }
const amd = { symbol: 'AMD', uic: 7, assetType: 'Stock' }
const tsla = { symbol: 'TSLA', uic: 9, assetType: 'Stock' }

const renderViews = (slots = [nvda, amd], range = '6M') =>
  renderHook((props) => usePaneViews(props.slots, props.range), { initialProps: { slots, range } })

describe('usePaneViews', () => {
  it('gives every pane a fresh view', () => {
    const { result } = renderViews()
    expect(result.current(0)).toMatchObject(FRESH)
    expect(result.current(1)).toMatchObject(FRESH)
  })

  it('keeps each pane view separate', () => {
    const { result } = renderViews()
    act(() => result.current(1).setYShift(12))
    act(() => result.current(1).setYScale(2))
    expect(result.current(0)).toMatchObject(FRESH)
    expect(result.current(1)).toMatchObject({ yScale: 2, yShift: 12 })
  })

  it('accepts updater functions, as the chart canvas passes them', () => {
    const { result } = renderViews()
    act(() => result.current(0).setTimeView((view) => ({ ...view, offset: view.offset + 5 })))
    expect(result.current(0).timeView).toEqual({ offset: 5, barCount: null })
  })

  it('resets one pane without touching the others', () => {
    const { result } = renderViews()
    act(() => result.current(0).setYScale(3))
    act(() => result.current(1).setYScale(2))
    act(() => result.current(1).resetView())
    expect(result.current(0).yScale).toBe(3)
    expect(result.current(1)).toMatchObject(FRESH)
  })

  it('resets every pane when the range changes', () => {
    const { result, rerender } = renderViews()
    act(() => result.current(0).setYShift(4))
    act(() => result.current(1).setYScale(2))
    rerender({ slots: [nvda, amd], range: '1Y' })
    expect(result.current(0)).toMatchObject(FRESH)
    expect(result.current(1)).toMatchObject(FRESH)
  })

  it('resets only the pane whose symbol changed', () => {
    const { result, rerender } = renderViews()
    act(() => result.current(0).setYScale(2))
    act(() => result.current(1).setYScale(3))
    rerender({ slots: [nvda, tsla], range: '6M' })
    expect(result.current(0).yScale).toBe(2)
    expect(result.current(1)).toMatchObject(FRESH)
  })

  it('keeps a view when the same content is passed again', () => {
    const { result, rerender } = renderViews()
    act(() => result.current(1).setYScale(3))
    rerender({ slots: [{ ...nvda }, { ...amd }], range: '6M' })
    expect(result.current(1).yScale).toBe(3)
  })

  it('keeps the views of panes that survive a change in pane count', () => {
    const { result, rerender } = renderViews()
    act(() => result.current(0).setYScale(2))
    rerender({ slots: [nvda, amd, null, null], range: '6M' })
    expect(result.current(0).yScale).toBe(2)
    expect(result.current(3)).toMatchObject(FRESH)
    rerender({ slots: [nvda], range: '6M' })
    expect(result.current(0).yScale).toBe(2)
  })
})
