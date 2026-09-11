import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders'
import MoversCard from './MoversCard'

const movers = {
  best: [{ ticker: 'NVDA', name: 'NVIDIA', pnl_pct: 112.3, pnl: '6949.50', value: '13131.00' }],
  worst: [{ ticker: 'INTC', name: 'Intel', pnl_pct: -22.1, pnl: '-540.00', value: '1900.00' }],
}

describe('MoversCard', () => {
  it('splits gainers and losers and links the tickers', () => {
    renderWithProviders(<MoversCard movers={movers} />)
    expect(screen.getByRole('link', { name: /NVDA/ })).toHaveAttribute('href', '/research?symbol=NVDA')
    expect(screen.getByText(/\+112\.3%/)).toBeInTheDocument()
    expect(screen.getByText(/-22\.1%/)).toBeInTheDocument()
  })

  it('shows an empty state with no holdings', () => {
    renderWithProviders(<MoversCard movers={{ best: [], worst: [] }} />)
    expect(screen.getByText(/No holdings/)).toBeInTheDocument()
  })
})
