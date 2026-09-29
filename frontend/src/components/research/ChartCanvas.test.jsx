import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

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
})
