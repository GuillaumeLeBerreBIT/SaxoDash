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
    ...overrides,
  })

  it('pans through time when the time axis is dragged, never past the oldest bar', () => {
    const setTimeOffset = vi.fn()
    render(canvas({ controls: pannableControls({ setTimeOffset }), maxTimeOffset: 2 }))

    const axis = screen.getByTestId('time-axis')
    fireEvent.pointerDown(axis, { clientX: 100, clientY: 5, pointerId: 1 })
    fireEvent.pointerMove(axis, { clientX: 400, clientY: 5, pointerId: 1 })
    fireEvent.pointerUp(axis, { clientX: 400, clientY: 5, pointerId: 1 })

    const update = setTimeOffset.mock.calls.at(-1)[0]
    expect(update(0)).toBe(2)
  })

  it('returns to the latest bars on a double-click of the time axis', () => {
    const setTimeOffset = vi.fn()
    render(canvas({ controls: pannableControls({ setTimeOffset, timeOffset: 3 }), maxTimeOffset: 10 }))

    fireEvent.doubleClick(screen.getByTestId('time-axis'))

    expect(setTimeOffset.mock.calls.at(-1)[0](3)).toBe(0)
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
