import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { ApiError } from '../../api/client'
import { computeIndicators } from '../../lib/indicators'
import { LATEST_TIME_VIEW, resolveTimeWindow } from '../../lib/timeWindow'
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

describe('ChartCanvas panning and zoom', () => {
  const history = { total: 40, range: '1M' }
  const shown = { offset: 0, barCount: 30 }

  const setup = ({ view = shown, ...overrides } = {}) => {
    const setTimeView = vi.fn()
    const viewControls = {
      ...controls(),
      range: history.range,
      yShift: 0,
      setYShift: vi.fn(),
      timeView: view,
      setTimeView,
      ...overrides,
    }
    render(canvas({ controls: viewControls, timeWindow: resolveTimeWindow(view, history) }))
    const next = (from = view) => {
      const update = setTimeView.mock.calls.at(-1)[0]
      return typeof update === 'function' ? update(from) : update
    }
    return { setTimeView, next }
  }

  const drag = (element, dx) => {
    const step = Math.sign(dx) * 10
    fireEvent.pointerDown(element, { clientX: 300, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(element, { clientX: 300 + step, clientY: 150, pointerId: 1 })
    fireEvent.pointerMove(element, { clientX: 300 + step + dx, clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(element, { clientX: 300 + step + dx, clientY: 150, pointerId: 1 })
  }
  const timeAxis = () => screen.getByTestId('time-axis')
  const plot = () => screen.getByTestId('price-scale').closest('svg').parentElement

  it('shows fewer bars when the time axis is dragged right', () => {
    const { next } = setup()

    drag(timeAxis(), 150)

    expect(next()).toEqual({ offset: 0, barCount: Math.round(30 / Math.E) })
  })

  it('shows more bars when the time axis is dragged left, never more than were fetched', () => {
    const { next } = setup()

    drag(timeAxis(), -600)

    expect(next()).toEqual({ offset: 0, barCount: 40 })
  })

  it('keeps a panned view inside the history when zooming out', () => {
    const view = { offset: 10, barCount: 30 }
    const { next } = setup({ view })

    drag(timeAxis(), -30)

    const count = Math.round(30 * Math.exp(0.2))
    expect(next(view)).toEqual({ offset: 40 - count, barCount: count })
  })

  it('pans from where the window really is, even if the stored offset ran past the history', () => {
    const view = { offset: 999, barCount: 30 }
    const { next } = setup({ view })

    drag(plot(), -3 * ((760 - 62) / 30))

    expect(next(view).offset).toBe(7)
  })

  it('returns to the range and the latest bars on a double-click of the time axis', () => {
    const { setTimeView } = setup({ view: { offset: 3, barCount: 12 } })

    fireEvent.doubleClick(timeAxis())

    expect(setTimeView).toHaveBeenLastCalledWith(LATEST_TIME_VIEW)
  })

  it('resets zoom and shift from the price axis', () => {
    const setYScale = vi.fn()
    const setYShift = vi.fn()
    setup({ setYScale, setYShift, yScale: 3, yShift: 0.4 })

    fireEvent.doubleClick(screen.getByTestId('price-scale'))

    expect(setYScale).toHaveBeenCalledWith(1)
    expect(setYShift).toHaveBeenCalledWith(0)
  })
})
