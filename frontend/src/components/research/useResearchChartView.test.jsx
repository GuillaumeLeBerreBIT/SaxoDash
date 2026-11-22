import { describe, expect, it, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useResearchChartView } from './useResearchChartView'

describe('useResearchChartView', () => {
  beforeEach(() => localStorage.clear())

  it('opens on the price view when nothing is saved', () => {
    const { result } = renderHook(() => useResearchChartView())
    expect(result.current[0]).toBe('price')
  })

  it('remembers the chosen view for the next visit', () => {
    const { result } = renderHook(() => useResearchChartView())
    act(() => result.current[1]('advanced'))
    expect(result.current[0]).toBe('advanced')
    expect(renderHook(() => useResearchChartView()).result.current[0]).toBe('advanced')
  })

  it('ignores a saved value it does not know', () => {
    localStorage.setItem('saxodash:research-chart-view', 'candles')
    const { result } = renderHook(() => useResearchChartView())
    expect(result.current[0]).toBe('price')
  })

  it('keeps the shared Charts page preference untouched', () => {
    localStorage.setItem('saxodash:chart-prefs', JSON.stringify({ type: 'bars' }))
    const { result } = renderHook(() => useResearchChartView())
    act(() => result.current[1]('advanced'))
    expect(JSON.parse(localStorage.getItem('saxodash:chart-prefs')).type).toBe('bars')
  })
})
