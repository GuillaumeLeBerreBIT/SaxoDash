import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../test/renderWithProviders'
import Analytics from './Analytics'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const summary = {
  has_data: true,
  volatility: 12.345,
  sharpe: 1.2,
  sortino: 1.8,
  expected_return: 9.5,
  max_drawdown: -8.5,
  current_drawdown: -1.2,
  positive_months_pct: 66.7,
  best_month: { year: 2026, month: 3, pct: 5.1 },
  worst_month: { year: 2026, month: 1, pct: -4.2 },
  drawdown_series: [
    { date: '2026-01-01', dd: 0 },
    { date: '2026-01-02', dd: -1.2 },
  ],
  monthly_returns: [
    { year: 2026, month: 2, pct: 5.1 },
    { year: 2026, month: 3, pct: -4.2 },
  ],
  benchmark: {
    key: 'world', name: 'World Index', reason: null, has_data: true,
    expected_return: 7.2, beta: 0.95, tracking_error: 3.1, information_ratio: 0.4, jensen_alpha: 1.1,
  },
  available_benchmarks: [
    { key: 'world', name: 'World Index' },
    { key: 'sp500', name: 'S&P 500' },
    { key: 'nasdaq100', name: 'NASDAQ 100' },
  ],
}

const disconnectedBenchmark = {
  key: 'world', name: 'World Index', reason: 'Saxo is not connected.', has_data: false,
  expected_return: null, beta: null, tracking_error: null, information_ratio: null, jensen_alpha: null,
}

function stubPortfolioSummary(totalValue = 10000) {
  queries.usePortfolioSummary.mockReturnValue({ data: { total_value: totalValue }, isLoading: false, error: null })
}

describe('Analytics', () => {
  it('shows a loading state while the summary is in flight', () => {
    queries.useRiskMetrics.mockReturnValue({ data: undefined, isLoading: true, error: null })
    stubPortfolioSummary()
    renderWithProviders(<Analytics />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('reports insufficient history rather than showing zeros', () => {
    queries.useRiskMetrics.mockReturnValue({
      data: { has_data: false }, isLoading: false, error: null,
    })
    stubPortfolioSummary()
    renderWithProviders(<Analytics />)
    expect(screen.getByText(/not enough history/i)).toBeInTheDocument()
    expect(screen.queryByText('0.0%')).not.toBeInTheDocument()
  })

  it('renders the risk metrics once history is available', () => {
    queries.useRiskMetrics.mockReturnValue({ data: summary, isLoading: false, error: null })
    stubPortfolioSummary()
    renderWithProviders(<Analytics />)

    expect(screen.getByText('12.3%')).toBeInTheDocument()
    expect(screen.getByText('1.20')).toBeInTheDocument()
    expect(screen.getByText('-8.5%')).toBeInTheDocument()
  })

  it('renders benchmark-relative metrics against the default World Index', () => {
    queries.useRiskMetrics.mockReturnValue({ data: summary, isLoading: false, error: null })
    stubPortfolioSummary()
    renderWithProviders(<Analytics />)

    expect(screen.getByText('0.95')).toBeInTheDocument() // beta
    expect(screen.getByText('vs World Index')).toBeInTheDocument()
  })

  it('shows a reason instead of dashes-as-zero when the benchmark is unusable', () => {
    queries.useRiskMetrics.mockReturnValue({
      data: { ...summary, benchmark: disconnectedBenchmark }, isLoading: false, error: null,
    })
    stubPortfolioSummary()
    renderWithProviders(<Analytics />)

    expect(screen.getByText('Saxo is not connected.')).toBeInTheDocument()
  })

  it('refetches with the newly selected benchmark when a pill is clicked', async () => {
    queries.useRiskMetrics.mockReturnValue({ data: summary, isLoading: false, error: null })
    stubPortfolioSummary()
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'S&P 500' }))

    expect(queries.useRiskMetrics).toHaveBeenLastCalledWith('sp500')
  })

  it('switches to the Projection tab and renders it from the portfolio value', async () => {
    queries.useRiskMetrics.mockReturnValue({ data: summary, isLoading: false, error: null })
    stubPortfolioSummary(10000)
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Projection' }))

    expect(screen.getByText('Invested by then')).toBeInTheDocument()
    expect(screen.getByText('Median outcome')).toBeInTheDocument()
  })

  it('shows a placeholder on the Projection tab while the portfolio value is still loading', async () => {
    queries.useRiskMetrics.mockReturnValue({ data: summary, isLoading: false, error: null })
    queries.usePortfolioSummary.mockReturnValue({ data: undefined, isLoading: true, error: null })
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Projection' }))

    expect(screen.getByText(/loading portfolio value/i)).toBeInTheDocument()
  })
})
