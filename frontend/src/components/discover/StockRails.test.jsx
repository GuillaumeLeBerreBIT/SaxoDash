import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { RAILS } from '../../lib/discoverBrowse'
import StockRails from './StockRails'

vi.mock('../research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const stock = {
  ticker: 'ACME', name: 'Acme Corp', uic: 7, asset_type: 'Stock', sector: 'Industrials',
  last_close: 182.4, close_date: '2026-11-20', spark: [1, 2, 3], cheap_below: 150, expensive_above: 205,
  valuation: 'fair', below_high_pct: 38.4, checks_passed: 4, checks_answered: 5,
  passed_checks: ['Profitability'], failed_checks: ['Debt'],
}

vi.mock('../../api/queries', () => ({
  useBrowse: () => ({ data: { stocks: [stock], total: 1 }, isSuccess: true, isLoading: false }),
  useInvestorHub: () => ({ data: { shelves: [] } }),
}))

const renderRails = () =>
  render(
    <MemoryRouter>
      <StockRails />
    </MemoryRouter>,
  )

describe('StockRails', () => {
  it('states the fall from the 1-year high on the Fell hard rail only', () => {
    renderRails()
    const fell = screen.getByRole('region', { name: RAILS[1].title })
    expect(within(fell).getByText('38% below its 1-year high')).toBeInTheDocument()
    const strong = screen.getByRole('region', { name: RAILS[0].title })
    expect(within(strong).queryByText(/1-year high/)).not.toBeInTheDocument()
  })
})
