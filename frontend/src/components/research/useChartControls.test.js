import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { DEFAULT_CHART_PREFS, writeChartPrefs } from '../../lib/chartPrefs'
import { useChartControls } from './useChartControls'

const stored = () => JSON.parse(localStorage.getItem('saxodash:chart-prefs'))

beforeEach(() => localStorage.clear())

describe('useChartControls', () => {
  it('starts from the defaults when nothing is stored', () => {
    const { result } = renderHook(() => useChartControls())
    expect(result.current.range).toBe(DEFAULT_CHART_PREFS.range)
    expect(result.current.overlays).toEqual(DEFAULT_CHART_PREFS.overlays)
    expect(result.current.yScale).toBe(1)
  })

  it('starts from what was stored', () => {
    writeChartPrefs({ ...DEFAULT_CHART_PREFS, range: '1Y', type: 'area' })
    const { result } = renderHook(() => useChartControls())
    expect(result.current.range).toBe('1Y')
    expect(result.current.type).toBe('area')
  })

  it('persists range, type, overlay and pane changes', () => {
    const { result } = renderHook(() => useChartControls())
    act(() => result.current.setRange('3M'))
    act(() => result.current.setType('bars'))
    act(() => result.current.toggleOverlay('bb'))
    act(() => result.current.togglePane('macd'))
    expect(stored()).toMatchObject({ range: '3M', type: 'bars' })
    expect(stored().overlays.bb).toBe(true)
    expect(stored().panes.macd).toBe(true)
  })

  it('keeps yScale in memory only', () => {
    const { result } = renderHook(() => useChartControls())
    act(() => result.current.setYScale(2.5))
    expect(result.current.yScale).toBe(2.5)
    expect(stored() ?? {}).not.toHaveProperty('yScale')

    const again = renderHook(() => useChartControls())
    expect(again.result.current.yScale).toBe(1)
  })

  it('starts unpanned and keeps the pan in memory only', () => {
    const { result } = renderHook(() => useChartControls())
    expect(result.current.timeOffset).toBe(0)
    expect(result.current.yShift).toBe(0)

    act(() => result.current.setTimeOffset(12))
    act(() => result.current.setYShift(0.3))
    expect(result.current.timeOffset).toBe(12)
    expect(stored() ?? {}).not.toHaveProperty('timeOffset')
    expect(stored() ?? {}).not.toHaveProperty('yShift')
  })

  it('snaps back to the latest bars when a range is picked', () => {
    const { result } = renderHook(() => useChartControls())
    act(() => result.current.setTimeOffset(12))
    act(() => result.current.setYShift(0.3))
    act(() => result.current.setRange('6M'))

    expect(result.current.timeOffset).toBe(0)
    expect(result.current.yShift).toBe(0)
  })

  it('resets zoom and pan together for a new symbol', () => {
    const { result } = renderHook(() => useChartControls())
    act(() => result.current.setYScale(3))
    act(() => result.current.setTimeOffset(12))
    act(() => result.current.setYShift(0.3))
    act(() => result.current.resetView())

    expect(result.current).toMatchObject({ yScale: 1, timeOffset: 0, yShift: 0 })
  })
})
