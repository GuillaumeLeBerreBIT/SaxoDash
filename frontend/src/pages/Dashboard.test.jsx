import { describe, expect, it, vi, beforeEach } from 'vitest'
import { expectValidHeadingOutline } from '../test/headingOutline'
import { screen, within } from '@testing-library/react'

import { renderWithProviders } from '../test/renderWithProviders'
import Dashboard from './Dashboard'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const idle = { data: undefined, isLoading: false, error: null }

const panel = (name) => screen.getByRole('heading', { name }).closest('.sd-panel')

const insights = {
  as_of: '2026-09-09', stale: false,
  value: { net_worth: '10000.00', portfolio: '9000.00', broker_cash: '1000.00' },
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
  ticker: 'NVDA', name: 'NVIDIA', currency: 'USD', price_source: 'live', uic: 1, asset_type: 'Stock',
  current_price: '875.40', value: '13131.00', pnl: '6949.50', pnl_pct: 112.3, weight: '100.0',
}]

const smallPositions = [
  { ticker: 'AAA', name: 'Alpha', currency: 'USD', uic: 2, asset_type: 'Stock', value: '500.00', pnl: '10.00', pnl_pct: 2, weight: '15.0' },
  { ticker: 'BBB', name: 'Beta', currency: 'USD', uic: 3, asset_type: 'Stock', value: '400.00', pnl: '5.00', pnl_pct: 1, weight: '12.0' },
]

const small = { positions: smallPositions, summary: { total_value: '900.00', total_pnl: '15.00', total_pnl_pct: 1.7 } }

const ownership = {
  quarter: '2026-06-30',
  stocks: { NVDA: { owners: 40, shares: 900_000_000, shares_change: 4_200_000, shares_change_pct: 0.5 } },
}

const performance = {
  history_days: 400,
  periods: [
    { label: '1 month', portfolio_pct: 1.2, benchmark_pct: 0.8, alpha_pct: 0.4, annualised: false, needs_days: 0 },
    { label: 'Since inception', portfolio_pct: 18.4, benchmark_pct: 12.1, alpha_pct: 6.3, annualised: false, needs_days: 0 },
  ],
  calendar_years: [],
  benchmark: { key: 'sp500', name: 'S&P 500', reason: null },
}

function stub(over = {}) {
  queries.usePortfolioInsights.mockReturnValue({ ...idle, data: over.insights ?? insights })
  queries.usePositions.mockReturnValue({ ...idle, data: over.positions ?? positions })
  queries.usePortfolioSummary.mockReturnValue({
    ...idle,
    data: over.summary ?? {
      total_value: '13131.00',
      total_pnl: '6949.50',
      total_pnl_pct: 112.3,
      allocation: [{ ticker: 'NVDA', value: '13131.00' }],
    },
  })
  queries.usePerformance.mockReturnValue({ ...idle, data: over.performance ?? performance })
  queries.useOwnershipSummary.mockReturnValue({ ...idle, data: over.ownership ?? ownership })
  queries.useTransactions.mockReturnValue({ ...idle, data: [] })
  queries.useNetWorthHistory.mockReturnValue({ ...idle, data: [] })
  queries.usePositionQuotes.mockReturnValue(over.quotes ?? new Map())
  queries.useInvestorHub.mockReturnValue({ ...idle, data: over.hub ?? { shelves: [] } })
  queries.useVerdictSummary.mockReturnValue({ ...idle, data: over.verdicts ?? {} })
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stub()
  })

  it('has exactly one h1 and no skipped heading level', () => {
    const { container } = renderWithProviders(<Dashboard />)
    expectValidHeadingOutline(container)
  })

  it('renders skeletons while insights load', () => {
    queries.usePortfolioInsights.mockReturnValue({ ...idle, isLoading: true })
    renderWithProviders(<Dashboard />)
    expect(screen.queryByTestId('brief-hero')).toBeNull()
  })

  it('opens on how many things need a look, the portfolio value and today\'s move', () => {
    stub({ quotes: new Map([[1, { change_pct: 10 }]]) })
    renderWithProviders(<Dashboard />)
    const hero = screen.getByTestId('brief-hero')
    expect(screen.getByTestId('brief-headline')).toHaveTextContent('One thing to look at in your portfolio today.')
    expect(hero).toHaveTextContent('€13,131.00')
    expect(within(hero).getByText(/^▲ €1,194 today/)).toHaveClass('text-up')
    expect(within(hero).getByText(/^▲ €6,950 since purchase/)).toBeInTheDocument()
  })

  it('lists what to look at, each with a plain sentence and a way into Research', () => {
    stub({ verdicts: { NVDA: { action: 'trim', uic: 1 } } })
    renderWithProviders(<Dashboard />)
    const list = screen.getByTestId('brief-items')
    expect(list).toHaveTextContent('NVIDIA is 100.0% of your portfolio')
    expect(list).toHaveTextContent('Trim')
    expect(within(list).getByRole('link', { name: 'NVIDIA is 100.0% of your portfolio' })).toHaveAttribute('href', expect.stringContaining('/research?symbol=NVDA'))
    expect(within(list).getByRole('link', { name: 'Open NVDA chart' })).toHaveAttribute('href', expect.stringContaining('/charts?symbol=NVDA'))
  })

  it('says nothing needs doing when every holding is fine', () => {
    stub({ ...small, verdicts: { AAA: { action: 'hold', uic: 2 }, BBB: { action: 'hold', uic: 3 } } })
    renderWithProviders(<Dashboard />)
    expect(screen.getByTestId('brief-headline')).toHaveTextContent('Nothing in your portfolio needs you today.')
    expect(screen.getByText(/Nothing to do today/)).toBeInTheDocument()
  })

  it('gives no all-clear while the verdicts are still loading', () => {
    stub(small)
    queries.useVerdictSummary.mockReturnValue({ data: undefined, isLoading: true })
    renderWithProviders(<Dashboard />)
    expect(screen.getByTestId('brief-headline')).toHaveTextContent('Checking your holdings.')
    expect(screen.queryByText(/Nothing to do today/)).toBeNull()
    expect(panel('What to look at')).toHaveTextContent('Still checking your holdings against the quality rules.')
  })

  it('gives no all-clear when the verdicts failed to load', () => {
    stub(small)
    queries.useVerdictSummary.mockReturnValue({ data: undefined, isLoading: false })
    renderWithProviders(<Dashboard />)
    expect(screen.getByTestId('brief-headline')).toHaveTextContent('Not every holding could be checked today.')
    expect(screen.queryByText(/Nothing to do today/)).toBeNull()
    expect(panel('What to look at')).toHaveTextContent('Two holdings could not be checked')
  })

  it('does not count a holding with no verdict as passing', () => {
    stub({ ...small, verdicts: { AAA: { action: 'hold', uic: 2 } } })
    renderWithProviders(<Dashboard />)
    expect(screen.queryByText(/Nothing to do today/)).toBeNull()
    expect(panel('What to look at')).toHaveTextContent('One holding could not be checked')
  })

  it('keeps the dashboard when only the recent transactions fail', () => {
    stub()
    queries.useTransactions.mockReturnValue({ ...idle, error: new Error('boom') })
    renderWithProviders(<Dashboard />)
    expect(screen.getByTestId('brief-hero')).toBeInTheDocument()
    expect(panel('Recent transactions')).toHaveTextContent('Recent transactions could not be loaded')
  })

  it('adds what tracked funds bought among your holdings', () => {
    stub({ hub: { shelves: [{ key: 'convergent-buys', items: [{ ticker: 'NVDA', bought: 19 }] }] } })
    renderWithProviders(<Dashboard />)
    expect(screen.getByTestId('brief-items')).toHaveTextContent('19 tracked funds bought NVIDIA last quarter')
  })

  it('lists the holdings, largest first, with the action word', () => {
    stub({ positions: smallPositions, summary: { total_value: '900.00', total_pnl: '15.00', total_pnl_pct: 1.7 }, verdicts: { AAA: { action: 'add', uic: 2 } } })
    renderWithProviders(<Dashboard />)
    const holdings = panel('Your holdings')
    const tickers = within(holdings).getAllByText(/^(AAA|BBB)$/).map((node) => node.textContent)
    expect(tickers).toEqual(['AAA', 'BBB'])
    expect(within(holdings).getByText('Passes quality screen')).toHaveClass('text-ink-3')
    expect(within(holdings).getByRole('link', { name: 'Open AAA chart' })).toHaveAttribute('href', expect.stringContaining('/charts?symbol=AAA'))
  })

  it('keeps the data notes in one quiet line at the bottom', () => {
    renderWithProviders(<Dashboard />)
    expect(screen.getByTestId('overview-notes')).toHaveTextContent('NVDA alone is 60% of the portfolio. As of 09 Sep 2026. Rules, not advice.')
  })

  it('shows the net share change tracked funds made in each held ticker', () => {
    renderWithProviders(<Dashboard />)
    const smart = panel('Smart money')
    expect(within(smart).getByText('13F · Q2 2026 · net shares, tracked funds')).toBeInTheDocument()
    const row = within(smart).getByText('NVDA').closest('a')
    expect(row).toHaveTextContent('▲ +4.2M')
    expect(queries.useOwnershipSummary).toHaveBeenCalledWith(['NVDA'])
  })

  it('shows a dash in Smart money for a ticker with no ownership entry', () => {
    stub({ ownership: { quarter: '2026-06-30', stocks: { NVDA: null } } })
    renderWithProviders(<Dashboard />)
    const row = within(panel('Smart money')).getByText('NVDA').closest('a')
    expect(row).toHaveTextContent('—')
    expect(row).not.toHaveTextContent(/\b0\b/)
  })

  it('compares the return since inception with the S&P 500', () => {
    renderWithProviders(<Dashboard />)
    const vs = panel('Vs the US 500')
    expect(within(vs).getByText('▲ 18.4%')).toBeInTheDocument()
    expect(within(vs).getByText('▲ 12.1%')).toBeInTheDocument()
    expect(within(vs).getByText('▲ 6.3%')).toBeInTheDocument()
    expect(queries.usePerformance).toHaveBeenCalledWith('sp500')
  })

  it('renders dashes in Vs the US 500 when the benchmark is unavailable', () => {
    stub({
      performance: {
        ...performance,
        periods: [{ label: 'Since inception', portfolio_pct: 18.4, benchmark_pct: null, alpha_pct: null, annualised: false, needs_days: 0 }],
        benchmark: { key: 'sp500', name: 'S&P 500', reason: 'Saxo is not connected' },
      },
    })
    renderWithProviders(<Dashboard />)
    const vs = panel('Vs the US 500')
    expect(within(vs).getAllByText('—')).toHaveLength(2)
    expect(within(vs).getByText(/Saxo is not connected/)).toBeInTheDocument()
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
    const table = screen.getByRole('table', { name: 'Recent transactions' })
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
