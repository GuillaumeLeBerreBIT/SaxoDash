import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'

import { computeIndicators } from '../../lib/indicators'
import { DOWN, UP } from '../../lib/chartGeometry'
import { TVChart } from './TVChart'

const bars = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000 + i,
}))

const overlays = { ma20: false, ma50: false, ma200: false, ema9: false, bb: false, vwap: false }

const renderChart = (props = {}) =>
  render(
    <TVChart
      data={bars}
      ind={computeIndicators(bars)}
      type="candles"
      overlays={overlays}
      hover={null}
      setHover={vi.fn()}
      {...props}
    />,
  )

describe('TVChart', () => {
  it('draws one body per candle', () => {
    const { container } = renderChart()

    // Each candle is a wick line plus a body rect; the last-price tag adds one
    // more rect, so bodies are counted by their fill colours.
    const bodies = container.querySelectorAll(`rect[fill="${UP}"], rect[fill="${DOWN}"]`)
    expect(bodies).toHaveLength(bars.length)
  })

  it('renders nothing rather than throwing on an empty dataset', () => {
    const { container } = renderChart({ data: [], ind: computeIndicators([]) })

    expect(container.querySelector('svg')).toBeNull()
  })

  it('draws a moving average only when its overlay is on', () => {
    const off = renderChart()
    expect(off.container.querySelector('path[stroke="#f59e0b"]')).toBeNull()

    const on = renderChart({ overlays: { ...overlays, ma20: true } })
    expect(on.container.querySelector('path[stroke="#f59e0b"]')).not.toBeNull()
  })

  it('shows the crosshair only while a bar is hovered', () => {
    const idle = renderChart()
    const hovered = renderChart({ hover: 10 })

    const dashed = (c) => c.querySelectorAll('line[stroke="#71717a"]').length
    expect(dashed(idle.container)).toBe(0)
    expect(dashed(hovered.container)).toBe(2)
  })
})

describe('earnings markers', () => {
  it('draws a beat marker in the beat colour', () => {
    const { container } = renderChart({
      earningsMarkers: [{ index: 10, date: bars[10].date, sign: 1, actual: 1.1, estimate: 1.0 }],
    })
    expect(container.querySelector('polygon[fill="#34d399"]')).not.toBeNull()
  })

  it('draws a miss marker in the miss colour', () => {
    const { container } = renderChart({
      earningsMarkers: [{ index: 10, date: bars[10].date, sign: -1, actual: 0.9, estimate: 1.0 }],
    })
    expect(container.querySelector('polygon[fill="#f87171"]')).not.toBeNull()
  })

  it('renders none when no markers are given', () => {
    const { container } = renderChart()
    expect(container.querySelector('polygon[fill="#34d399"], polygon[fill="#f87171"], polygon[fill="#3b82f6"]')).toBeNull()
  })
})

describe('price-axis scaling', () => {
  it('has no scale handle unless the parent can change the scale', () => {
    const { container } = renderChart()

    expect(container.querySelector('[data-testid="price-scale"]')).toBeNull()
  })

  it('compresses the scale when the axis is dragged down', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ yScale: 1, onYScaleChange })

    const handle = getByTestId('price-scale')
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 160, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientY: 160, pointerId: 1 })

    expect(onYScaleChange).toHaveBeenCalled()
    expect(onYScaleChange.mock.calls.at(-1)[0]).toBeGreaterThan(1)
  })

  it('ignores pointer movement over the axis when no drag started', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ yScale: 1, onYScaleChange })

    fireEvent.pointerMove(getByTestId('price-scale'), { clientY: 160, pointerId: 1 })

    expect(onYScaleChange).not.toHaveBeenCalled()
  })

  it('resets the scale on a double-click of the axis', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ yScale: 4, onYScaleChange })

    fireEvent.doubleClick(getByTestId('price-scale'))

    expect(onYScaleChange).toHaveBeenCalledWith(1)
  })

  it('clips the candles to the plot area', () => {
    const { container } = renderChart({ yScale: 0.2, onYScaleChange: vi.fn() })

    const clipped = container.querySelector('g[clip-path]')
    expect(clipped).not.toBeNull()
    expect(clipped.querySelectorAll(`rect[fill="${UP}"], rect[fill="${DOWN}"]`)).toHaveLength(bars.length)
  })
})
