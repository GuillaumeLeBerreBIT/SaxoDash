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
    expect(result.current.view(0)).toMatchObject(FRESH)
    expect(result.current.view(1)).toMatchObject(FRESH)
  })

  it('keeps each pane view separate', () => {
    const { result } = renderViews()
    act(() => result.current.view(1).setYShift(12))
    act(() => result.current.view(1).setYScale(2))
    expect(result.current.view(0)).toMatchObject(FRESH)
    expect(result.current.view(1)).toMatchObject({ yScale: 2, yShift: 12 })
  })

  it('accepts updater functions, as the chart canvas passes them', () => {
    const { result } = renderViews()
    act(() => result.current.view(0).setTimeView((view) => ({ ...view, offset: view.offset + 5 })))
    expect(result.current.view(0).timeView).toEqual({ offset: 5, barCount: null })
  })

  it('resets one pane without touching the others', () => {
    const { result } = renderViews()
    act(() => result.current.view(0).setYScale(3))
    act(() => result.current.view(1).setYScale(2))
    act(() => result.current.view(1).resetView())
    expect(result.current.view(0).yScale).toBe(3)
    expect(result.current.view(1)).toMatchObject(FRESH)
  })

  it('clears pan but keeps zoom when the range changes', () => {
    const { result, rerender } = renderViews()
    act(() => result.current.view(0).setYScale(2))
    act(() => result.current.view(0).setYShift(4))
    act(() => result.current.view(1).setTimeView({ offset: 5, barCount: null }))
    rerender({ slots: [nvda, amd], range: '1Y' })
    expect(result.current.view(0)).toMatchObject({ yScale: 2, yShift: 0, timeView: LATEST_TIME_VIEW })
    expect(result.current.view(1)).toMatchObject({ yScale: 1, yShift: 0, timeView: LATEST_TIME_VIEW })
  })

  it('resets only the pane whose symbol changed', () => {
    const { result, rerender } = renderViews()
    act(() => result.current.view(0).setYScale(2))
    act(() => result.current.view(1).setYScale(3))
    rerender({ slots: [nvda, tsla], range: '6M' })
    expect(result.current.view(0).yScale).toBe(2)
    expect(result.current.view(1)).toMatchObject(FRESH)
  })

  it('keeps a view when the same content is passed again', () => {
    const { result, rerender } = renderViews()
    act(() => result.current.view(1).setYScale(3))
    rerender({ slots: [{ ...nvda }, { ...amd }], range: '6M' })
    expect(result.current.view(1).yScale).toBe(3)
  })

  it('keeps the views of panes that survive a change in pane count', () => {
    const { result, rerender } = renderViews()
    act(() => result.current.view(0).setYScale(2))
    rerender({ slots: [nvda, amd, null, null], range: '6M' })
    expect(result.current.view(0).yScale).toBe(2)
    expect(result.current.view(3)).toMatchObject(FRESH)
    rerender({ slots: [nvda], range: '6M' })
    expect(result.current.view(0).yScale).toBe(2)
  })

  it('applies per-pane rules when range and content both change', () => {
    const { result, rerender } = renderViews()
    act(() => result.current.view(0).setYScale(2))
    act(() => result.current.view(1).setYScale(2))
    rerender({ slots: [nvda, tsla], range: '1Y' })
    expect(result.current.view(0)).toMatchObject({ yScale: 2, yShift: 0, timeView: LATEST_TIME_VIEW })
    expect(result.current.view(1)).toMatchObject(FRESH)
  })
})

describe('usePaneViews rangePicked', () => {
  it('clears pan and time-zoom on every pane, keeping each yScale, even when the range value is unchanged', () => {
    const { result } = renderViews()
    act(() => result.current.view(0).setYScale(2))
    act(() => result.current.view(0).setYShift(6))
    act(() => result.current.view(1).setYScale(3))
    act(() => result.current.view(1).setTimeView({ offset: 8, barCount: 40 }))

    act(() => result.current.rangePicked())

    expect(result.current.view(0)).toMatchObject({ yScale: 2, yShift: 0, timeView: LATEST_TIME_VIEW })
    expect(result.current.view(1)).toMatchObject({ yScale: 3, yShift: 0, timeView: LATEST_TIME_VIEW })
  })
})

const datesA = { from: '2026-03-01', to: '2026-03-31' }
const datesB = { from: '2026-02-01', to: '2026-02-28' }

const renderLinked = (slots = [nvda, amd, null], linked = true) =>
  renderHook((props) => usePaneViews(props.slots, '6M', props.linked), { initialProps: { slots, linked } })

describe('usePaneViews linking', () => {
  it('starts every pane without a followed window', () => {
    const { result } = renderLinked()
    expect(result.current.view(0).followDates).toBeNull()
    expect(result.current.view(1).followDates).toBeNull()
  })

  it('hands the leader window to the other filled panes', () => {
    const { result } = renderLinked()
    act(() => result.current.view(0).commitTimeView({ offset: 5, barCount: 20 }, datesA))
    expect(result.current.view(0)).toMatchObject({ timeView: { offset: 5, barCount: 20 }, followDates: null })
    expect(result.current.view(1).followDates).toEqual(datesA)
    expect(result.current.view(2).followDates).toBeNull()
  })

  it('leaves the others alone when not linked', () => {
    const { result } = renderLinked([nvda, amd], false)
    act(() => result.current.view(0).commitTimeView({ offset: 5, barCount: 20 }, datesA))
    expect(result.current.view(0).timeView).toEqual({ offset: 5, barCount: 20 })
    expect(result.current.view(1).followDates).toBeNull()
  })

  it('lets a follower take over as leader', () => {
    const { result } = renderLinked([nvda, amd])
    act(() => result.current.view(0).commitTimeView({ offset: 5, barCount: 20 }, datesA))
    act(() => result.current.view(1).commitTimeView({ offset: 40, barCount: 15 }, datesB))
    expect(result.current.view(1)).toMatchObject({ timeView: { offset: 40, barCount: 15 }, followDates: null })
    expect(result.current.view(0).followDates).toEqual(datesB)
  })

  it('clears every followed window on a range pick', () => {
    const { result } = renderLinked([nvda, amd])
    act(() => result.current.view(0).commitTimeView({ offset: 5, barCount: 20 }, datesA))
    act(() => result.current.rangePicked())
    expect(result.current.view(0).timeView).toEqual(LATEST_TIME_VIEW)
    expect(result.current.view(1).followDates).toBeNull()
  })

  it('aligns the others to the window a pane last reported', () => {
    const { result } = renderLinked([nvda, amd, tsla])
    act(() => result.current.view(0).reportWindow(datesA))
    act(() => result.current.alignTo(0))
    expect(result.current.view(0).followDates).toBeNull()
    expect(result.current.view(1).followDates).toEqual(datesA)
    expect(result.current.view(2).followDates).toEqual(datesA)
  })

  it('aligns nothing when the pane has reported no window', () => {
    const { result } = renderLinked([nvda, amd])
    act(() => result.current.alignTo(0))
    expect(result.current.view(1).followDates).toBeNull()
  })

  it('forgets an earlier linked window when aligning to a pane that shows nothing', () => {
    const { result, rerender } = renderLinked([nvda, amd, null])
    act(() => result.current.view(0).commitTimeView({ offset: 5, barCount: 20 }, datesA))
    act(() => result.current.alignTo(2))
    rerender({ slots: [nvda, amd, tsla], linked: true })
    expect(result.current.view(2).followDates).toBeNull()
  })

  it('does not align empty panes', () => {
    const { result } = renderLinked([nvda, null])
    act(() => result.current.view(0).reportWindow(datesA))
    act(() => result.current.alignTo(0))
    expect(result.current.view(1).followDates).toBeNull()
  })

  it('gives a pane that receives a new symbol the current linked window', () => {
    const { result, rerender } = renderLinked([nvda, amd])
    act(() => result.current.view(0).commitTimeView({ offset: 5, barCount: 20 }, datesA))
    rerender({ slots: [nvda, tsla], linked: true })
    expect(result.current.view(1).followDates).toEqual(datesA)
    expect(result.current.view(0).timeView).toEqual({ offset: 5, barCount: 20 })
  })

  it('gives a pane that receives a new symbol a fresh view when not linked', () => {
    const { result, rerender } = renderLinked([nvda, amd], false)
    rerender({ slots: [nvda, tsla], linked: false })
    expect(result.current.view(1)).toMatchObject({ timeView: LATEST_TIME_VIEW, followDates: null })
  })
})
