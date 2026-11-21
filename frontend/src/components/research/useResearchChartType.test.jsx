import { describe, expect, it, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useResearchChartType } from './useResearchChartType'

describe('useResearchChartType', () => {
  beforeEach(() => localStorage.clear())

  it('opens on a line chart when nothing is saved', () => {
    const { result } = renderHook(() => useResearchChartType())
    expect(result.current[0]).toBe('line')
  })

  it('remembers the chosen type for the next visit', () => {
    const { result } = renderHook(() => useResearchChartType())
    act(() => result.current[1]('candles'))
    expect(result.current[0]).toBe('candles')
    expect(renderHook(() => useResearchChartType()).result.current[0]).toBe('candles')
  })

  it('ignores a saved value it does not know', () => {
    localStorage.setItem('saxodash:research-chart-type', 'area')
    const { result } = renderHook(() => useResearchChartType())
    expect(result.current[0]).toBe('line')
  })

  it('keeps the shared Charts page preference untouched', () => {
    localStorage.setItem('saxodash:chart-prefs', JSON.stringify({ type: 'bars' }))
    const { result } = renderHook(() => useResearchChartType())
    act(() => result.current[1]('candles'))
    expect(JSON.parse(localStorage.getItem('saxodash:chart-prefs')).type).toBe('bars')
  })
})
