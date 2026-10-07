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
  history_days: 400,
  inputs_reliable: true,
  projection_inputs: { expected_return: 9.5, volatility: 12.345 },
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

const performance = {
  periods: [
    { label: '1 month', portfolio_pct: 4.2, benchmark_pct: 2.1, alpha_pct: 2.1, annualised: false },
  ],
  calendar_years: [
    { year: 2026, portfolio_pct: 9.5, benchmark_pct: 7.2, partial: true },
  ],
  benchmark: { key: 'world', name: 'World Index' },
}

const positions = [
  { ticker: 'NVDA', cost: '1000', pnl: '600' },
  { ticker: 'AAPL', cost: '1000', pnl: '-100' },
]

function stubPortfolioSummary(totalValue = 10000) {
  queries.usePortfolioSummary.mockReturnValue({ data: { total_value: totalValue }, isLoading: false, error: null })
}

function stubHappyPath() {
  queries.useRiskMetrics.mockReturnValue({ data: summary, isLoading: false, error: null })
  queries.usePerformance.mockReturnValue({ data: performance, isLoading: false, error: null })
  queries.usePositions.mockReturnValue({ data: positions, isLoading: false, error: null })
  stubPortfolioSummary()
}

const shortHistory = {
  has_data: true,
  history_days: 8,
  data_quality: 'low',
  sample_size: 8,
  volatility: null,
  sharpe: null,
  sortino: null,
  expected_return: null,
  max_drawdown: -1.2,
  current_drawdown: -0.4,
  positive_months_pct: null,
  best_month: null,
  worst_month: null,
  needs_days: { expected_return: 357, volatility: 22, sharpe: 357, sortino: 357, monthly_stats: 23 },
  benchmark: {
    has_data: true, name: 'World', beta: null, tracking_error: null, information_ratio: null, jensen_alpha: null,
    needs_days: { tracking_error: 22, beta: 82, information_ratio: 357, jensen_alpha: 357 },
  },
  drawdown_series: [],
  monthly_returns: [],
  risk_free_annual: 0.03,
  available_benchmarks: [{ key: 'world', name: 'World' }],
}

function mockRisk(data) {
  queries.useRiskMetrics.mockReturnValue({ data, isLoading: false, error: null })
  queries.usePerformance.mockReturnValue({ data: performance, isLoading: false, error: null })
  queries.usePositions.mockReturnValue({ data: positions, isLoading: false, error: null })
  stubPortfolioSummary()
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

  it('shows the top summary row', () => {
    stubHappyPath()
    renderWithProviders(<Analytics />)

    expect(screen.getByText('Avg. return (ann.)')).toBeInTheDocument()
    expect(screen.getByText(/deposits count as gains/i)).toBeInTheDocument()
  })

  it('does not show a low-confidence caveat once a full year of history exists', () => {
    stubHappyPath()
    renderWithProviders(<Analytics />)
    expect(screen.queryByText(/based on.*days/i)).not.toBeInTheDocument()
  })

  it('flags a low-confidence caveat with the actual day count while history is short', () => {
    queries.useRiskMetrics.mockReturnValue({
      data: { ...summary, data_quality: 'low', sample_size: 24 },
      isLoading: false, error: null,
    })
    queries.usePerformance.mockReturnValue({ data: performance, isLoading: false, error: null })
    queries.usePositions.mockReturnValue({ data: positions, isLoading: false, error: null })
    stubPortfolioSummary()
    renderWithProviders(<Analytics />)

    expect(screen.getByText(/based on 24 days/i)).toBeInTheDocument()
  })

  it('does not show a permanently-empty Money-weighted (XIRR) stat', () => {
    // The app doesn't sync deposit history, so this could never have a real
    // value - a stat row that can only ever show "—" doesn't earn a place.
    stubHappyPath()
    renderWithProviders(<Analytics />)

    expect(screen.queryByText('Money-weighted (XIRR)')).not.toBeInTheDocument()
  })

  it('opens on the Performance tab, with the returns table and calendar years', () => {
    stubHappyPath()
    renderWithProviders(<Analytics />)

    expect(screen.getByText('Returns vs World Index')).toBeInTheDocument()
    expect(screen.getByText('Calendar-year returns')).toBeInTheDocument()
  })

  it('shows attribution once positions are available', () => {
    stubHappyPath()
    renderWithProviders(<Analytics />)
    expect(screen.getByText('Return attribution')).toBeInTheDocument()
  })

  it('explains what the risk tiles mean behind an inline toggle, not a tooltip', async () => {
    // A hover tooltip was tried first and rejected - 8 definitions is more
    // text than InfoTip's small floating box reads well, tooltip or not
    // (its opening lines get pushed off the top of the viewport when the
    // trigger sits this high on the page). An inline expand/collapse avoids
    // needing to fight the viewport for space at all.
    stubHappyPath()
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Risk' }))
    expect(screen.queryByText(/counts only downside swings/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'What do these mean?' }))
    expect(screen.getByText(/counts only downside swings/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Hide what these mean' }))
    expect(screen.queryByText(/counts only downside swings/)).not.toBeInTheDocument()
  })

  it('renders the risk metrics on the Risk tab', async () => {
    stubHappyPath()
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Risk' }))

    // The top summary row already shows these headline figures once; the
    // Risk tab's own tiles repeat them in more detail, so at least 2.
    expect(screen.getAllByText('12.3%').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('-8.5%').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Sortino ratio')).toBeInTheDocument()
  })

  it('renders benchmark-relative metrics against the default World Index', async () => {
    stubHappyPath()
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Risk' }))

    expect(screen.getByText('0.95')).toBeInTheDocument() // beta
    // The benchmark name now names the whole group once, not a per-tile hint.
    expect(screen.getByText('Vs. benchmark (World Index)')).toBeInTheDocument()
  })

  it('shows a reason instead of dashes-as-zero when the benchmark is unusable', async () => {
    queries.useRiskMetrics.mockReturnValue({
      data: { ...summary, benchmark: disconnectedBenchmark }, isLoading: false, error: null,
    })
    queries.usePerformance.mockReturnValue({ data: performance, isLoading: false, error: null })
    queries.usePositions.mockReturnValue({ data: positions, isLoading: false, error: null })
    stubPortfolioSummary()
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Risk' }))

    expect(screen.getByText('Saxo is not connected.')).toBeInTheDocument()
  })

  it('explains blank benchmark columns on the Performance tab', () => {
    queries.useRiskMetrics.mockReturnValue({ data: summary, isLoading: false, error: null })
    queries.usePerformance.mockReturnValue({
      data: { ...performance, benchmark: { key: 'world', name: 'World Index', reason: 'Saxo is not connected.' } },
      isLoading: false, error: null,
    })
    queries.usePositions.mockReturnValue({ data: positions, isLoading: false, error: null })
    stubPortfolioSummary()
    renderWithProviders(<Analytics />)

    expect(screen.getByText(/World Index columns are blank — Saxo is not connected\./)).toBeInTheDocument()
  })

  it('refetches with the newly selected benchmark when a pill is clicked', async () => {
    stubHappyPath()
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'S&P 500' }))

    expect(queries.useRiskMetrics).toHaveBeenLastCalledWith('sp500')
    expect(queries.usePerformance).toHaveBeenLastCalledWith('sp500')
  })

  it('switches to the Projection tab and renders it from the portfolio value', async () => {
    stubHappyPath()
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Projection' }))

    expect(screen.getByText('Invested by then')).toBeInTheDocument()
    expect(screen.getByText('Median outcome')).toBeInTheDocument()
  })

  it('shows a placeholder on the Projection tab while the portfolio value is still loading', async () => {
    queries.useRiskMetrics.mockReturnValue({ data: summary, isLoading: false, error: null })
    queries.usePerformance.mockReturnValue({ data: performance, isLoading: false, error: null })
    queries.usePositions.mockReturnValue({ data: positions, isLoading: false, error: null })
    queries.usePortfolioSummary.mockReturnValue({ data: undefined, isLoading: true, error: null })
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Projection' }))

    expect(screen.getByText(/loading portfolio value/i)).toBeInTheDocument()
  })

  it('says so on the Projection tab when its inputs come from under a year of history', async () => {
    const thin = {
      ...summary,
      expected_return: null,
      volatility: null,
      history_days: 8,
      inputs_reliable: false,
      projection_inputs: { expected_return: 9.5, volatility: 12.345 },
    }
    queries.useRiskMetrics.mockReturnValue({ data: thin, isLoading: false, error: null })
    queries.usePerformance.mockReturnValue({ data: performance, isLoading: false, error: null })
    queries.usePositions.mockReturnValue({ data: positions, isLoading: false, error: null })
    stubPortfolioSummary()
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Projection' }))

    expect(screen.getByText(/only 8 days of history/i)).toBeInTheDocument()
    expect(screen.getByText('Median outcome')).toBeInTheDocument()
  })

  it('does not caveat the Projection tab once the inputs are reliable', async () => {
    stubHappyPath()
    renderWithProviders(<Analytics />)

    await userEvent.click(screen.getByRole('button', { name: 'Projection' }))

    expect(screen.queryByText(/of history, so the range/i)).not.toBeInTheDocument()
  })

  it('shows dashes and a needs-days hint instead of a bare unit when history is short', async () => {
    mockRisk(shortHistory)
    renderWithProviders(<Analytics />)
    await userEvent.click(screen.getByRole('button', { name: 'Risk' }))
    expect(screen.queryByText('—%')).not.toBeInTheDocument()
    expect(screen.getAllByText('needs 22 more days').length).toBeGreaterThan(0)
    expect(screen.getAllByText('needs 23 more days')).toHaveLength(3)
  })

  it('shows no Sharpe badge and a dash for average return when they are null', () => {
    mockRisk(shortHistory)
    renderWithProviders(<Analytics />)
    expect(screen.queryByText(/Sharpe —/)).not.toBeInTheDocument()
    expect(screen.getByText('needs 357 more days')).toBeInTheDocument()
  })

  it('names the history length in the placeholder', () => {
    mockRisk({ has_data: false, history_days: 1 })
    renderWithProviders(<Analytics />)
    expect(screen.getByText(/at least two days of portfolio value \(1 so far\)/)).toBeInTheDocument()
  })
})
