import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import StockCard from './StockCard'

vi.mock('../research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const stock = {
  ticker: 'ACME', name: 'Acme Corp', uic: 7, asset_type: 'Stock', sector: 'Industrials',
  last_close: 182.4, close_date: '2026-11-20', spark: [1, 2, 3], cheap_below: 150, expensive_above: 205,
  valuation: 'fair', below_high_pct: 38.4, checks_passed: 4, checks_answered: 5,
  passed_checks: ['Profitability'], failed_checks: ['Debt'],
}

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <StockCard stock={stock} {...props} />
    </MemoryRouter>,
  )

describe('StockCard', () => {
  it('states the fall from the 1-year high when the screen asks for it', () => {
    renderCard({ showFall: true })
    expect(screen.getByText('Within its usual P/E range')).toBeInTheDocument()
    expect(screen.getByText('38% below its 1-year high')).toBeInTheDocument()
  })

  it('leaves the fall out of an ordinary screen', () => {
    renderCard()
    expect(screen.getByText('Within its usual P/E range')).toBeInTheDocument()
    expect(screen.queryByText(/1-year high/)).not.toBeInTheDocument()
  })

  it('does not repeat a fall line the price line already states', () => {
    renderCard({ showFall: true, stock: { ...stock, valuation: 'not_judged' } })
    expect(screen.getAllByText('38% below its 1-year high')).toHaveLength(1)
  })
})
