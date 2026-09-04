import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'

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
}

describe('Portfolio holdings table', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    stub()
  })

  it('prices the instrument in its own currency, not the reporting one', () => {
    renderWithProviders(<Portfolio />)
    const row = screen.getByText('MSFT').closest('tr')

    expect(within(row).getByText('US$510.09')).toBeInTheDocument()
    expect(within(row).getByText('US$494.36')).toBeInTheDocument()
    expect(within(row).queryByText('€510.09')).not.toBeInTheDocument()
  })

  it('reports value and P&L in the reporting currency', () => {
    renderWithProviders(<Portfolio />)
    const row = screen.getByText('MSFT').closest('tr')

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
    const row = screen.getByText('MSFT').closest('tr')

    expect(within(row).getByText('2.5')).toBeInTheDocument()
  })
})
