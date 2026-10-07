import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'

import { renderWithProviders } from '../test/renderWithProviders'
import Dashboard from './Dashboard'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const idle = { data: undefined, isLoading: false, error: null }

const insights = {
  as_of: '2026-09-09', stale: false,
  value: { net_worth: '10000.00', portfolio: '9000.00', bank: '1000.00', bank_only: '1000.00', broker_cash: '0.00' },
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
    data: {
      total_value: '13131.00',
      total_pnl_pct: 112.3,
      allocation: [{ ticker: 'NVDA', value: '13131.00', color: '#76b900' }],
    },
  })
  queries.useTransactions.mockReturnValue({ ...idle, data: [] })
  queries.useNetWorthHistory.mockReturnValue({ ...idle, data: [] })
  queries.useSpendingSummary.mockReturnValue({
    ...idle,
    data: over.spending ?? { categories: [{ category: 'GROCERIES', amount: '50.00' }], total: '50.00', transfers: '0.00' },
  })
  queries.useBudgetProgress.mockReturnValue({
    data: over.budgetProgress ?? [],
    isLoading: false,
    error: null,
  })
  queries.usePositionQuotes.mockReturnValue(new Map())
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

  it("folds this month's spending into the hero figure instead of a standalone card", () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByText('Spent MTD')).toBeInTheDocument()
    expect(screen.getByText('€50.00')).toBeInTheDocument()
  })

  it('shows a portfolio glance strip instead of a second holdings table', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByText('Portfolio value')).toBeInTheDocument()
    expect(screen.getByText('€13,131.00')).toBeInTheDocument()
    expect(screen.getByText('Top holding')).toBeInTheDocument()
    expect(screen.getByText('100.0% of portfolio')).toBeInTheDocument()
    expect(screen.getByText('Holdings')).toBeInTheDocument()
    // The old top-5 holdings table and allocation donut are gone - Portfolio owns that view now.
    expect(screen.queryByText('Largest 5 by value')).not.toBeInTheDocument()
    expect(screen.queryByText('Allocation')).not.toBeInTheDocument()
  })

  it('says the percentage beside Portfolio value is since purchase', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByText(/since purchase/, { selector: 'span.text-emerald-400, span.text-red-400, span.text-zinc-500' })).toBeInTheDocument()
  })

  it('renders a dash, not null or 0.00%, when the portfolio percentage is absent', () => {
    queries.usePortfolioSummary.mockReturnValue({
      ...idle,
      data: { total_value: '13131.00', total_pnl_pct: null, allocation: [] },
    })
    renderWithProviders(<Dashboard />)

    const row = screen.getByText('Portfolio value').closest('div').parentElement
    expect(within(row).getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/since purchase/)).toBeNull()
    expect(screen.queryByText(/null|0\.00%/)).toBeNull()
  })

  it('no longer renders a Contributors chart (superseded by Analytics\' Attribution)', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.queryByText('Contributors')).not.toBeInTheDocument()
  })

  it('scopes the spending summary query to the current month', () => {
    renderWithProviders(<Dashboard />)
    expect(queries.useSpendingSummary).toHaveBeenCalledWith(
      expect.stringMatching(/^\?date_from=\d{4}-\d{2}-01$/)
    )
  })

  it('renders skeletons while insights load', () => {
    queries.usePortfolioInsights.mockReturnValue({ ...idle, data: undefined })
    const { container } = renderWithProviders(<Dashboard />)
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('adds an over-budget category to the attention band alongside portfolio items', () => {
    stub({
      budgetProgress: [{ category: 'GROCERIES', limit: '100.00', spent: '142.00', pct: 142 }],
    })
    renderWithProviders(<Dashboard />)
    expect(screen.getByText(/NVDA alone is 60%/)).toBeInTheDocument()
    expect(screen.getByText(/Groceries is over budget/)).toBeInTheDocument()
  })

  it('maps where the capital sits and what is moving it', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByText('Allocation & movement')).toBeInTheDocument()
  })

  it('shows recent trades with instrument-currency price, signed euro total and fractional qty', () => {
    queries.useTransactions.mockReturnValue({
      ...idle,
      data: [{
        id: 1, date: '2026-09-01', type: 'BUY', instrument: 'Advanced Micro Devices', ticker: 'AMD',
        qty: '2.5000', price: '150.00', total: '375.00', account: 'Saxo',
        currency: 'USD', fx_rate: '0.86', total_eur: '322.50',
      }],
    })
    renderWithProviders(<Dashboard />)

    const line = screen.getByText('AMD', { selector: 'span.font-medium' }).closest('tr')
    expect(within(line).getByText('2.5')).toBeInTheDocument()
    expect(within(line).getByText('US$150.00')).toBeInTheDocument()
    expect(within(line).getByText('-€322.50')).toBeInTheDocument()
    expect(within(line).getByText('01 Sep 2026')).toBeInTheDocument()
  })
})

describe('Dashboard recent transactions on mobile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stub()
    queries.useTransactions.mockReturnValue({
      ...idle,
      data: [{
        id: 1, date: '2026-09-01', type: 'BUY', instrument: 'Advanced Micro Devices', ticker: 'AMD',
        qty: '2.5000', price: '150.00', total: '375.00', account: 'Saxo',
        currency: 'USD', fx_rate: '0.86', total_eur: '322.50',
      }],
    })
  })

  it('titles the truncated instrument cell with its full name and ticker', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByTitle('Advanced Micro Devices (AMD)')).toHaveClass('truncate')
  })

  it('keeps date, name and total visible below md and hides the rest', () => {
    renderWithProviders(<Dashboard />)
    const table = screen.getByRole('table')
    for (const name of ['Date', 'Name', 'Total']) {
      expect(within(table).getByRole('columnheader', { name })).not.toHaveClass('hidden')
    }
    for (const name of ['Type', 'Qty', 'Price']) {
      const header = within(table).getByRole('columnheader', { name })
      expect(header).toHaveClass('hidden', 'md:table-cell')
    }
    const line = within(table).getByText('AMD', { selector: 'span.font-medium' }).closest('tr')
    expect(within(line).getByText('2.5').closest('td')).toHaveClass('hidden', 'md:table-cell')
    expect(within(line).getByText('US$150.00').closest('td')).toHaveClass('hidden', 'md:table-cell')
    expect(within(line).getByText('BUY', { selector: 'span.md\\:hidden' })).toBeInTheDocument()
  })
})
