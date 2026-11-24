import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import BrowseResults from './BrowseResults'

vi.mock('../research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const stock = {
  ticker: 'ACME', name: 'Acme Corp', uic: 7, asset_type: 'Stock', sector: 'Industrials',
  last_close: 182.4, close_date: '2026-11-20', spark: [1, 2, 3], cheap_below: 150, expensive_above: 205,
  valuation: 'fair', below_high_pct: 38.4, checks_passed: 4, checks_answered: 5,
  passed_checks: ['Profitability'], failed_checks: ['Debt'], reasons: [],
}

const pages = [{ data: { stocks: [stock], total: 1 } }]

const renderResults = (props) =>
  render(
    <MemoryRouter>
      <BrowseResults pages={pages} screen="all" layout="cards" onClear={vi.fn()} onMore={vi.fn()} {...props} />
    </MemoryRouter>,
  )

describe('BrowseResults', () => {
  it('states the fall on each card when the screen asks for it', () => {
    renderResults({ showFall: true })
    expect(screen.getByText('38% below its 1-year high')).toBeInTheDocument()
  })

  it('leaves the fall off the cards of an ordinary screen', () => {
    renderResults({ showFall: false })
    expect(screen.queryByText(/1-year high/)).not.toBeInTheDocument()
  })

  it('states the fall in the table layout when the screen asks for it', () => {
    renderResults({ layout: 'table', showFall: true })
    expect(screen.getByText('38% below its 1-year high')).toBeInTheDocument()
  })

  it('explains a pullback without a Pullbacks prefix', () => {
    renderResults({ screen: 'pullbacks', showFall: true, pages: [{ data: { stocks: [{ ...stock, reasons: [] }], total: 1 } }] })
    expect(screen.queryByText(/Pullbacks/)).not.toBeInTheDocument()
  })

  it('shows no results when there are none', () => {
    renderResults({ pages: [{ data: { stocks: [], total: 0 } }] })
    expect(screen.getByText('No matching stocks')).toBeInTheDocument()
  })
})
