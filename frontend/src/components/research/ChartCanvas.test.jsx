import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { ApiError } from '../../api/client'
import { computeIndicators } from '../../lib/indicators'
import ChartCanvas from './ChartCanvas'

const bars = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000 + i,
}))

const controls = () => ({
  type: 'candles',
  overlays: { ma20: false, ma50: false, ma200: false, ema9: false, bb: false, vwap: false },
  panes: { volume: false, rsi: false, macd: false },
  yScale: 1,
  setYScale: vi.fn(),
})

const canvas = (props = {}) => (
  <ChartCanvas
    bars={bars}
    ind={computeIndicators(bars)}
    controls={controls()}
    hover={null}
    setHover={vi.fn()}
    symbol="NVDA"
    isLoading={false}
    error={null}
    {...props}
  />
)

describe('ChartCanvas legend', () => {
  it('hides the legend and shows the placeholder with one bar of history', () => {
    const oneBar = bars.slice(0, 1)
    render(canvas({ bars: oneBar, ind: computeIndicators(oneBar) }))

    expect(screen.queryByText(oneBar[0].date)).not.toBeInTheDocument()
    expect(screen.queryByText('O')).not.toBeInTheDocument()
    expect(screen.getByText(/Only one day of history so far/)).toBeInTheDocument()
  })

  it('hides the legend behind the not-connected placeholder despite cached bars', () => {
    const error = new ApiError(409, 'Saxo is not connected.')
    render(canvas({ error }))

    expect(screen.queryByText(bars[bars.length - 1].date)).not.toBeInTheDocument()
    expect(screen.queryByText('O')).not.toBeInTheDocument()
    expect(screen.getByText(/Saxo is not connected\./)).toBeInTheDocument()
  })

  it('shows the legend when there is real data and no error', () => {
    render(canvas())

    expect(screen.getByText(bars[bars.length - 1].date)).toBeInTheDocument()
    expect(screen.getByText('O')).toBeInTheDocument()
  })

  it("reads the bar's volume against its 20-session average", () => {
    render(canvas())
    expect(screen.getByText(/1\.0× 20d avg/)).toBeInTheDocument()
  })
})

describe('ChartCanvas panning', () => {
  const pannableControls = (overrides = {}) => ({
    ...controls(),
    yShift: 0,
    setYShift: vi.fn(),
    timeOffset: 0,
    setTimeOffset: vi.fn(),
    barCount: null,
    setBarCount: vi.fn(),
    ...overrides,
  })

  const dragAxis = (dx) => {
    const axis = screen.getByTestId('time-axis')
    const step = Math.sign(dx) * 10
    fireEvent.pointerDown(axis, { clientX: 300, clientY: 5, pointerId: 1 })
    fireEvent.pointerMove(axis, { clientX: 300 + step, clientY: 5, pointerId: 1 })
    fireEvent.pointerMove(axis, { clientX: 300 + step + dx, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(axis, { clientX: 300 + step + dx, clientY: 5, pointerId: 1 })
  }

  it('shows fewer bars when the time axis is dragged right', () => {
    const setBarCount = vi.fn()
    const setTimeOffset = vi.fn()
    render(canvas({ controls: pannableControls({ setBarCount, setTimeOffset }), maxTimeOffset: 100 }))

    dragAxis(150)

    expect(setBarCount).toHaveBeenLastCalledWith(Math.round(bars.length * Math.exp(-1)))
    expect(setTimeOffset).not.toHaveBeenCalled()
  })

  it('shows more bars when the time axis is dragged left, never more than were fetched', () => {
    const setBarCount = vi.fn()
    render(canvas({ controls: pannableControls({ setBarCount }), maxTimeOffset: 10 }))

    dragAxis(-600)

    expect(setBarCount).toHaveBeenLastCalledWith(bars.length + 10)
  })

  it('keeps a panned view inside the history when zooming out', () => {
    const setTimeOffset = vi.fn()
    render(
      canvas({
        controls: pannableControls({ setBarCount: vi.fn(), setTimeOffset, timeOffset: 10 }),
        maxTimeOffset: 10,
      }),
    )

    dragAxis(-30)

    const update = setTimeOffset.mock.calls.at(-1)[0]
    expect(update(10)).toBe(40 - Math.round(bars.length * Math.exp(0.2)))
  })

  it('returns to the range and the latest bars on a double-click of the time axis', () => {
    const setTimeOffset = vi.fn()
    const setBarCount = vi.fn()
    render(
      canvas({ controls: pannableControls({ setTimeOffset, setBarCount, timeOffset: 3, barCount: 12 }), maxTimeOffset: 10 }),
    )

    fireEvent.doubleClick(screen.getByTestId('time-axis'))

    expect(setTimeOffset.mock.calls.at(-1)[0](3)).toBe(0)
    expect(setBarCount).toHaveBeenLastCalledWith(null)
  })

  it('resets zoom and shift from the price axis', () => {
    const setYScale = vi.fn()
    const setYShift = vi.fn()
    render(canvas({ controls: pannableControls({ setYScale, setYShift, yScale: 3, yShift: 0.4 }) }))

    fireEvent.doubleClick(screen.getByTestId('price-scale'))

    expect(setYScale).toHaveBeenCalledWith(1)
    expect(setYShift).toHaveBeenCalledWith(0)
  })
})
