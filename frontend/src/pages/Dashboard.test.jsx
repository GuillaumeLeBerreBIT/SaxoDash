import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../test/renderWithProviders'
import Dashboard from './Dashboard'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const idle = { data: undefined, isLoading: false, error: null }

const insights = {
  as_of: '2026-09-09', stale: false,
  value: { net_worth: '10000.00', portfolio: '9000.00', bank: '1000.00' },
  change: {
    day: { abs: '50.00', pct: 0.56 }, week: null, month: null,
    ytd: { abs: '800.00', pct: 9 }, all_time: { abs: '2000.00', pct: 25 },
  },
  spark: [{ date: '2026-09-08', value: 9900 }, { date: '2026-09-09', value: 10000 }],
  concentration: { top1: { ticker: 'NVDA', pct: 60 }, top3_pct: 100, hhi: 0.46, positions: 1 },
  sector_exposure: [{ name: 'Technology', pct: 100, value: '9000.00' }],
  currency_exposure: [{ currency: 'USD', pct: 100, value: '9000.00' }],
  movers: {
    best: [{ ticker: 'NVDA', name: 'NVIDIA', pnl_pct: 112.3, pnl: '6949.50', value: '13131.00' }],
    worst: [],
  },
  contributors: [{ ticker: 'NVDA', pnl: '6949.50', contribution_pp: 42.1, share_of_gain_pct: 100 }],
  attention: [{ kind: 'single_name', severity: 'warn', text: 'NVDA alone is 60% of the portfolio.' }],
  upcoming_earnings: [],
}

const positions = [{
  ticker: 'NVDA', name: 'NVIDIA', color: '#76b900', currency: 'USD', price_source: 'live',
  current_price: '875.40', value: '13131.00', pnl: '6949.50', weight: '100.0',
}]

function stub(over = {}) {
  queries.usePortfolioInsights.mockReturnValue({ ...idle, data: over.insights ?? insights })
  queries.usePositions.mockReturnValue({ ...idle, data: positions })
  queries.usePortfolioSummary.mockReturnValue({
    ...idle,
    data: { total_value: '13131.00', allocation: [{ ticker: 'NVDA', value: '13131.00', color: '#76b900' }] },
  })
  queries.useTransactions.mockReturnValue({ ...idle, data: [] })
  queries.useNetWorthHistory.mockReturnValue({ ...idle, data: [] })
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stub()
  })

  it('leads with the net-worth hero and a delta', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByText('€10,000.00')).toBeInTheDocument()
    expect(screen.getByText(/\+0\.56%/)).toBeInTheDocument()
  })

  it('shows an attention chip', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByText(/NVDA alone is 60%/)).toBeInTheDocument()
  })

  it('shows movers with a linked ticker', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getAllByRole('link', { name: /NVDA/ }).length).toBeGreaterThan(0)
  })

  it('renders skeletons while insights load', () => {
    queries.usePortfolioInsights.mockReturnValue({ ...idle, data: undefined })
    const { container } = renderWithProviders(<Dashboard />)
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })
})
