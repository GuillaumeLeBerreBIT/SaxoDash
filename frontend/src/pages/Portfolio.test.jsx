import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

import { renderWithProviders } from '../test/renderWithProviders'
import Portfolio from './Portfolio'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const idle = { data: undefined, isLoading: false, error: null }

// A USD position in a EUR-reporting account, priced off Saxo's P/L - the exact
// shape that produced the net worth overstatement.
const msft = {
  ticker: 'MSFT',
  name: 'Microsoft Corp.',
  type: 'STOCK',
  color: '#00a4ef',
  sector: 'Technology',
  qty: '20.0000',
  avg_cost: '494.36',
  current_price: '510.09',
  currency: 'USD',
  fx_rate: '0.85997800',
  price_source: 'derived',
  priced_at: '2026-09-03T21:13:24Z',
  value: '8773.32',
  pnl: '270.55',
  pnl_pct: '3.18',
  weight: '27.79',
}

function stub(positions = [msft]) {
  queries.usePositions.mockReturnValue({ ...idle, data: positions })
  queries.usePositionQuotes.mockReturnValue(new Map())
  queries.usePortfolioSummary.mockReturnValue({
    ...idle,
    data: {
      total_value: '31567.81', total_cost: '31573.70',
      total_pnl: '-5.89', total_pnl_pct: '-0.02', allocation: [],
    },
  })
  queries.useNetWorth.mockReturnValue({
    ...idle,
    data: { portfolio_value: '31567.81', bank_total: '968435.55', net_worth: '1000003.36' },
  })
  queries.useSaxoStatus.mockReturnValue({ ...idle, data: { connected: true } })
  queries.useNetWorthHistory.mockReturnValue({ ...idle, data: [] })
  queries.useInstrumentSearch.mockReturnValue({ ...idle, data: [] })
}

describe('Portfolio holdings table', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    stub()
  })

  it('prices the instrument in its own currency, not the reporting one', () => {
    renderWithProviders(<Portfolio />)
    const row = within(screen.getByRole('table')).getByText('MSFT').closest('tr')

    expect(within(row).getByText('US$510.09')).toBeInTheDocument()
    expect(within(row).getByText('US$494.36')).toBeInTheDocument()
    expect(within(row).queryByText('€510.09')).not.toBeInTheDocument()
  })

  it('reports value and P&L in the reporting currency', () => {
    renderWithProviders(<Portfolio />)
    const row = within(screen.getByRole('table')).getByText('MSFT').closest('tr')

    expect(within(row).getByText('€8,773.32')).toBeInTheDocument()
    expect(within(row).getByText('+€270.55')).toBeInTheDocument()
  })

  it('discloses that the mark is not a live price', () => {
    renderWithProviders(<Portfolio />)

    expect(screen.getByText('Derived')).toBeInTheDocument()
    expect(screen.getAllByTitle(/no live price feed/i).length).toBeGreaterThan(0)
  })

  it('says nothing about provenance when every price is live', () => {
    stub([{ ...msft, price_source: 'live' }])
    renderWithProviders(<Portfolio />)

    expect(screen.queryByText('Derived')).not.toBeInTheDocument()
    expect(screen.queryByText('At cost')).not.toBeInTheDocument()
  })

  it('keeps a fractional holding from rounding away', () => {
    stub([{ ...msft, qty: '2.5000' }])
    renderWithProviders(<Portfolio />)
    const row = within(screen.getByRole('table')).getByText('MSFT').closest('tr')

    expect(within(row).getByText('2.5')).toBeInTheDocument()
  })

  it('links each holding name to its research page', () => {
    renderWithProviders(<Portfolio />)
    const link = screen.getByRole('link', { name: /MSFT/ })
    expect(link).toHaveAttribute('href', '/research?symbol=MSFT')
  })

  it('offers a general instrument search to find any stock or ETF, not just holdings', () => {
    renderWithProviders(<Portfolio />)
    expect(screen.getByRole('textbox', { name: /search instruments/i })).toBeInTheDocument()
  })

  it('folds total cost/P&L into the one stat strip instead of a second Overview card', () => {
    renderWithProviders(<Portfolio />)
    expect(screen.queryByText('Overview')).not.toBeInTheDocument()
    expect(screen.getByText('Total P&L')).toBeInTheDocument()
    expect(screen.getByText('-€5.89')).toBeInTheDocument()
    expect(screen.getByText('€31,573.70 invested')).toBeInTheDocument()
  })

  it('charts sector breakdown as a donut, the same pattern as holdings allocation', () => {
    renderWithProviders(<Portfolio />)
    const sectorCard = screen.getByText('Sector breakdown').closest('.flex-1.flex.flex-col')
    expect(within(sectorCard).getByText('Technology')).toBeInTheDocument()
    expect(within(sectorCard).getByText('€8,773.32')).toBeInTheDocument()
    expect(within(sectorCard).getByText('100.0%')).toBeInTheDocument()
  })

  it('shows the holding logo, keyed on the ticker symbol', () => {
    const { container } = renderWithProviders(<Portfolio />)

    expect(container.querySelector('img')).toHaveAttribute(
      'src', 'https://api.elbstream.com/logos/symbol/MSFT',
    )
  })

  it('falls back to the color swatch when the logo fails to load', () => {
    const { container } = renderWithProviders(<Portfolio />)

    fireEvent.error(container.querySelector('img'))

    expect(container.querySelector('img')).not.toBeInTheDocument()
  })

  describe('when every position is unpriced (e.g. no market-data entitlement)', () => {
    const unpriced = { ...msft, current_price: '0.00', value: '0.00', pnl: '-9887.20', weight: '0.00' }

    it('shows an empty state for sector breakdown instead of NaN% or a blank donut', () => {
      stub([unpriced])
      renderWithProviders(<Portfolio />)
      const sectorCard = screen.getByText('Sector breakdown').closest('.flex-1.flex.flex-col')
      expect(within(sectorCard).getByText('No priced holdings yet')).toBeInTheDocument()
      expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
    })

    it('shows an empty state instead of a blank allocation donut', () => {
      stub([unpriced])
      renderWithProviders(<Portfolio />)
      // Both Holdings allocation and Sector breakdown fall back to the same
      // EmptyState title when there's nothing priced to chart - distinguished
      // by their hint text.
      expect(screen.getAllByText('No priced holdings yet')).toHaveLength(2)
      expect(screen.getByText('Allocation needs a value per holding to chart.')).toBeInTheDocument()
      expect(screen.getByText('Sector weight needs a value per holding to chart.')).toBeInTheDocument()
    })
  })
})
