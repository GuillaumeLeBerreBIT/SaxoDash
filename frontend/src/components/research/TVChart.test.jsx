import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

import { computeIndicators } from '../../lib/indicators'
import { TVChart } from './TVChart'

const bars = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000 + i,
}))

const overlays = { ma20: false, ma50: false, ema9: false, bb: false, vwap: false }

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
    const bodies = container.querySelectorAll('rect[fill="#26a17b"], rect[fill="#e5484d"]')
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
