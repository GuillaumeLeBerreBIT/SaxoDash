import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import SymbolBar from './SymbolBar'

const instrument = { uic: 1, exact: true }
const details = { currency: 'USD', exchange: 'NASDAQ', description: 'NVIDIA Corp' }
const bars = [{ close: 97 }, { close: 99 }, { close: 100 }]

const renderBar = (props = {}) =>
  render(
    <SymbolBar
      symbol="NVDA"
      instrument={instrument}
      details={details}
      position={null}
      bars={bars}
      watchlists={[]}
      onToggleList={vi.fn()}
      {...props}
    />,
  )

describe('SymbolBar', () => {
  it('calls a live quote move today', () => {
    renderBar({ quote: { price: 100, change_pct: 2.36, change_basis: 'live' } })
    expect(screen.getByText('+2.36% today')).toBeInTheDocument()
  })

  it('never calls a last-close quote move today', () => {
    renderBar({ quote: { price: 100, change_pct: 2.36, change_basis: 'last_close' } })
    expect(screen.getByText('+2.36% latest session')).toBeInTheDocument()
    expect(screen.queryByText(/today/)).not.toBeInTheDocument()
  })

  it('captions the bar-derived move today when the newest bar is undated', () => {
    renderBar({ quote: null })
    expect(screen.getByText('+1.01% today')).toBeInTheDocument()
  })

  it('captions the bar-derived move as the latest session when the newest bar is old', () => {
    renderBar({
      quote: null,
      bars: [{ date: '2020-01-01', close: 99 }, { date: '2020-01-02', close: 100 }],
    })
    expect(screen.getByText('+1.01% latest session')).toBeInTheDocument()
  })
})
