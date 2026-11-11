import { describe, expect, it, vi, beforeEach } from 'vitest'
import { expectValidHeadingOutline } from '../test/headingOutline'
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
    data: { portfolio_value: '31567.81', bank_total: '968435.55', bank_only_total: '1435.55', broker_cash: '967000.00', net_worth: '1000003.36' },
  })
  queries.useSaxoStatus.mockReturnValue({ ...idle, data: { connected: true } })
  queries.useNetWorthHistory.mockReturnValue({ ...idle, data: [] })
  queries.useInstrumentSearch.mockReturnValue({ ...idle, data: [] })
  queries.useOwnershipSummary.mockReturnValue(idle)
  queries.useCongressOwnershipSummary.mockReturnValue(idle)
  queries.useVerdictSummary.mockReturnValue(idle)
}

describe('Portfolio holdings table', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    stub()
  })

  it('has exactly one h1 and no skipped heading level', () => {
    const { container } = renderWithProviders(<Portfolio />)
    expectValidHeadingOutline(container)
  })

  it('adds a Verdict column after Weight, asked for in one request and dashed for a foreign listing', () => {
    const asml = { ...msft, ticker: 'ASML', name: 'ASML Holding', currency: 'EUR' }
    stub([msft, asml])
    queries.useVerdictSummary.mockReturnValue({
      ...idle,
      data: { MSFT: { action: 'hold', reason: 'Fairly priced.' } },
    })

    renderWithProviders(<Portfolio />)

    expect(queries.useVerdictSummary).toHaveBeenCalledWith(['MSFT'])
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers.indexOf('Verdict')).toBe(headers.indexOf('Weight') + 1)
    expect(screen.getByRole('columnheader', { name: 'Verdict' })).not.toHaveAttribute('aria-sort')
    expect(screen.getByText('Hold')).toBeInTheDocument()
    expect(screen.getByTitle('Fairly priced.')).toBeInTheDocument()
    const asmlRow = screen.getByText('ASML Holding').closest('tr')
    expect(within(asmlRow).getByText('—', { selector: 'span[title="No verdict for this one"]' })).toBeInTheDocument()
  })

  it('dashes a position whose verdict was computed for another listing', () => {
    stub([{ ...msft, uic: 1000 }])
    queries.useVerdictSummary.mockReturnValue({
      ...idle,
      data: { MSFT: { action: 'hold', reason: 'Other listing.', uic: 2000 } },
    })

    renderWithProviders(<Portfolio />)

    const row = screen.getByText('Microsoft Corp.').closest('tr')
    expect(within(row).getByTitle('No verdict for this one')).toBeInTheDocument()
    expect(within(row).queryByText('Hold')).not.toBeInTheDocument()
  })

  it('shows the verdict when the position and the verdict share a uic', () => {
    stub([{ ...msft, uic: 1000 }])
    queries.useVerdictSummary.mockReturnValue({
      ...idle,
      data: { MSFT: { action: 'hold', reason: 'Fairly priced.', uic: 1000 } },
    })

    renderWithProviders(<Portfolio />)

    expect(screen.getByText('Hold')).toBeInTheDocument()
  })

  it('does not ask about an ETF and dashes its row', () => {
    const ivv = { ...msft, ticker: 'IVV', name: 'iShares Core S&P 500', type: 'ETF' }
    stub([msft, ivv])
    queries.useVerdictSummary.mockReturnValue({ ...idle, data: { MSFT: { action: 'hold', reason: 'Fairly priced.' } } })

    renderWithProviders(<Portfolio />)

    expect(queries.useVerdictSummary).toHaveBeenCalledWith(['MSFT'])
    const row = screen.getByText('iShares Core S&P 500').closest('tr')
    expect(within(row).getByTitle('No verdict for this one')).toBeInTheDocument()
  })

  it('leaves the Verdict cell blank while the summary is loading', () => {
    renderWithProviders(<Portfolio />)

    const row = screen.getByText('Microsoft Corp.').closest('tr')
    expect(within(row).queryByTitle('No verdict for this one')).not.toBeInTheDocument()
  })

  it('shows the shares tracked funds hold and their net change, skipping non-USD holdings', () => {
    const asml = { ...msft, ticker: 'ASML', name: 'ASML Holding', currency: 'EUR' }
    const flat = { ...msft, ticker: 'AAPL', name: 'Apple Inc.' }
    stub([msft, asml, flat])
    queries.useOwnershipSummary.mockReturnValue({
      ...idle,
      data: {
        quarter: '2026-06-30',
        stocks: {
          MSFT: { owners: 34, shares: 212_000_000, shares_change: -4_200_000, shares_change_pct: -1.9 },
          AAPL: { owners: 21, shares: 8_000_000, shares_change: 0, shares_change_pct: 0.0 },
        },
      },
    })

    renderWithProviders(<Portfolio />)

    expect(queries.useOwnershipSummary).toHaveBeenCalledWith(['AAPL', 'MSFT'])
    expect(screen.getByRole('columnheader', { name: 'Fund shares' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Fund change' })).toBeInTheDocument()
    const held = screen.getByRole('link', { name: 'Tracked funds hold 212,000,000 shares at the end of Q2 2026' })
    expect(held).toHaveAttribute('href', '/research?symbol=MSFT&tab=funds')
    const change = screen.getByRole('link', { name: 'Tracked funds net sold 4,200,000 shares in Q2 2026' })
    expect(change.textContent).toBe('▼\u00a0-4.2M-1.9%')
    expect(screen.getByRole('link', { name: 'Tracked funds hold 8,000,000 shares at the end of Q2 2026' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /net (bought|sold) 0 shares/ })).not.toBeInTheDocument()
  })

  it('shows House buyers and sellers per holding, linking to the Congress tab', () => {
    stub([msft])
    queries.useCongressOwnershipSummary.mockReturnValue({
      ...idle,
      data: { window_days: 90, stocks: { MSFT: { holders: 1, buyers: 2, sellers: 1 } } },
    })

    renderWithProviders(<Portfolio />)

    expect(queries.useCongressOwnershipSummary).toHaveBeenCalledWith(['MSFT'])
    expect(screen.getByRole('columnheader', { name: 'Congress' })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /2 members of Congress bought and 1 sold/ })
    expect(link).toHaveAttribute('href', '/research?symbol=MSFT&tab=congress')
  })

  it('keeps one h1 and no skipped level while loading', () => {
    queries.usePortfolioSummary.mockReturnValue({ ...idle, isLoading: true })
    const { container } = renderWithProviders(<Portfolio />)
    expectValidHeadingOutline(container)
  })

  it('keeps one h1 and no skipped level while in error', () => {
    queries.usePortfolioSummary.mockReturnValue({ ...idle, error: new Error('x'), refetch: vi.fn() })
    const { container } = renderWithProviders(<Portfolio />)
    expectValidHeadingOutline(container)
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

  it('shows only external banks as the bank balance and notes the Saxo cash separately', () => {
    renderWithProviders(<Portfolio />)

    const bank = screen.getByText('Bank balance').closest('div')
    expect(within(bank.parentElement).getByText('€1,435.55')).toBeInTheDocument()
    expect(screen.getByText(/\+ €967,000\.00 cash at Saxo, included in net worth/)).toBeInTheDocument()
  })

  it('says the percentage is since purchase', () => {
    renderWithProviders(<Portfolio />)
    expect(screen.getAllByText(/since purchase/).length).toBeGreaterThan(0)
  })

  it('discloses that the mark is not a live price', () => {
    renderWithProviders(<Portfolio />)

    expect(screen.getByText('Derived')).toBeInTheDocument()
    expect(screen.getAllByTitle(/no live price feed/i).length).toBeGreaterThan(0)
  })

  it('flags an estimated price in the below-md name cell', () => {
    renderWithProviders(<Portfolio />)
    const row = within(screen.getByRole('table')).getByText('MSFT').closest('tr')
    const cue = within(row).getByText('est.')
    expect(cue).toHaveClass('md:hidden')
    expect(cue).toHaveAttribute('title', expect.stringMatching(/no live price feed/i))
  })

  it('shows no estimate cue for a live price', () => {
    stub([{ ...msft, price_source: 'live' }])
    renderWithProviders(<Portfolio />)
    expect(screen.queryByText('est.')).not.toBeInTheDocument()
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

  it('heads the day column "Today" when every quote is live or absent', () => {
    renderWithProviders(<Portfolio />)
    expect(screen.getByRole('columnheader', { name: 'Today' })).toBeInTheDocument()
  })

  it('heads the day column "Latest session" when a quote is not live', () => {
    queries.usePositionQuotes.mockReturnValue(new Map([[1, { uic: 1, change_pct: -1, change_basis: 'last_close' }]]))
    renderWithProviders(<Portfolio />)
    expect(screen.getByRole('columnheader', { name: 'Latest session' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Today' })).not.toBeInTheDocument()
  })

  it('titles the truncated holding name with its full text', () => {
    stub()
    renderWithProviders(<Portfolio />)
    expect(screen.getByTitle('Microsoft Corp.')).toHaveClass('truncate')
  })

  it('links each holding name to its research page', () => {
    renderWithProviders(<Portfolio />)
    const link = screen.getByRole('link', { name: /MSFT/ })
    expect(link).toHaveAttribute('href', '/research?symbol=MSFT')
  })

  it('flags a holding with no thesis written yet', () => {
    stub([{ ...msft, has_thesis: false }])
    renderWithProviders(<Portfolio />)
    expect(screen.getByTitle(/no thesis written yet/i)).toBeInTheDocument()
  })

  it('says nothing extra once a thesis exists', () => {
    stub([{ ...msft, has_thesis: true }])
    renderWithProviders(<Portfolio />)
    expect(screen.queryByTitle(/no thesis written yet/i)).not.toBeInTheDocument()
  })

  it('offers a general instrument search to find any stock or ETF, not just holdings', () => {
    renderWithProviders(<Portfolio />)
    expect(screen.getByRole('textbox', { name: /search instruments/i })).toBeInTheDocument()
  })

  it('folds total cost/P&L into the one stat strip instead of a second Overview card', () => {
    renderWithProviders(<Portfolio />)
    expect(screen.queryByText('Overview')).not.toBeInTheDocument()
    expect(screen.getByText('Total P&L')).toBeInTheDocument()
    expect(screen.getAllByText('-€5.89')).toHaveLength(2)
    expect(screen.getByText('€31,573.70 invested')).toBeInTheDocument()
  })

  it('charts sector breakdown as a donut, the same pattern as holdings allocation', () => {
    renderWithProviders(<Portfolio />)
    const sectorCard = screen.getByRole('heading', { name: 'Sectors' }).closest('.sd-panel')
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
      const sectorCard = screen.getByRole('heading', { name: 'Sectors' }).closest('.sd-panel')
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

describe('Portfolio total row', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    stub()
  })

  const totalRow = () => screen.getByText(/^Total \(\d+ holdings?\)/).closest('tr')

  it('takes value and P&L from the summary, not from summing rows', () => {
    renderWithProviders(<Portfolio />)

    expect(within(totalRow()).getByText('€31,567.81')).toBeInTheDocument()
    expect(within(totalRow()).getByText('-€5.89')).toBeInTheDocument()
  })

  it('does not add up quantities across different instruments', () => {
    renderWithProviders(<Portfolio />)

    expect(within(totalRow()).queryByText('20')).toBeNull()
  })

  it('renders a dash, not null or 0.00%, when the percentage is absent', () => {
    queries.usePortfolioSummary.mockReturnValue({
      ...idle,
      data: { total_value: '31567.81', total_cost: '31573.70', total_pnl: '-5.89', total_pnl_pct: null, allocation: [] },
    })
    renderWithProviders(<Portfolio />)

    const row = screen.getByText('Investment portfolio').closest('div').parentElement
    expect(within(row).getByText('—')).toBeInTheDocument()
    expect(screen.queryByText(/since purchase/)).toBeNull()
    expect(screen.queryByText(/null|0\.00%/)).toBeNull()
  })

  it('shows a dash for P&L when the summary has none', () => {
    queries.usePortfolioSummary.mockReturnValue({
      ...idle,
      data: { total_value: '31567.81', total_cost: null, total_pnl: null, total_pnl_pct: null, allocation: [] },
    })
    renderWithProviders(<Portfolio />)

    expect(within(totalRow()).getByText('—')).toBeInTheDocument()
  })
})

describe('Portfolio holdings on mobile', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    stub()
  })

  it('keeps instrument, value and P/L visible below md and hides the rest', () => {
    renderWithProviders(<Portfolio />)
    const table = screen.getByRole('table')
    for (const name of ['Instrument', 'Value', 'P/L']) {
      expect(within(table).getByRole('columnheader', { name })).not.toHaveClass('hidden')
    }
    for (const name of ['Qty', 'Avg cost', 'Last', /^(Today|Latest session)$/, 'Return', 'Weight']) {
      expect(within(table).getByRole('columnheader', { name })).toHaveClass('hidden', 'md:table-cell')
    }
    const row = within(table).getByText('MSFT').closest('tr')
    expect(within(row).getByText('US$494.36').closest('td')).toHaveClass('hidden', 'md:table-cell')
    expect(within(row).getByText('27.8%').closest('td')).toHaveClass('hidden', 'md:table-cell')
    expect(within(row).getByText('€8,773.32').closest('td')).not.toHaveClass('hidden')
  })

  it('retries only the failed queries and keeps the heading', () => {
    stub()
    const summaryRefetch = vi.fn()
    const positionsRefetch = vi.fn()
    queries.usePortfolioSummary.mockReturnValue({ ...idle, error: new Error('x'), refetch: summaryRefetch })
    queries.usePositions.mockReturnValue({ ...idle, data: [msft], refetch: positionsRefetch })
    renderWithProviders(<Portfolio />)
    expect(screen.getByRole('heading', { level: 1, name: 'Portfolio' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(summaryRefetch).toHaveBeenCalled()
    expect(positionsRefetch).not.toHaveBeenCalled()
  })

  it('shows a skeleton card, not bare Loading text, while loading', () => {
    stub()
    queries.usePortfolioSummary.mockReturnValue({ ...idle, isLoading: true })
    renderWithProviders(<Portfolio />)
    expect(screen.getByRole('status', { name: 'Loading portfolio' })).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })
})

describe('Portfolio sortable holdings', () => {
  const make = (ticker, name, value, pnl, qty = '1', weight = '10') => ({
    ...msft, ticker, name, value, pnl, qty, weight, uic: ticker,
  })
  const rows = [
    make('AAA', 'Zeta Corp', '300.00', '10.00', '5', '30'),
    make('BBB', 'Alpha Inc', '100.00', null, '50', '10'),
    make('CCC', 'Mid Ltd', '200.00', '-20.00', '1', '20'),
  ]

  const order = () =>
    within(screen.getByRole('table'))
      .getAllByRole('link')
      .map((link) => ['AAA', 'BBB', 'CCC'].find((ticker) => link.textContent.includes(ticker)))
      .filter(Boolean)
  const header = (name) => within(screen.getByRole('table')).getByRole('columnheader', { name })
  const click = (name) => fireEvent.click(within(header(name)).getByRole('button'))

  beforeEach(() => {
    vi.resetAllMocks()
    stub(rows)
  })

  it('sorts Value ascending, then descending, then restores the default order', () => {
    renderWithProviders(<Portfolio />)
    expect(order()).toEqual(['AAA', 'BBB', 'CCC'])
    click('Value')
    expect(order()).toEqual(['BBB', 'CCC', 'AAA'])
    click('Value')
    expect(order()).toEqual(['AAA', 'CCC', 'BBB'])
    click('Value')
    expect(order()).toEqual(['AAA', 'BBB', 'CCC'])
  })

  it('keeps a row without P&L last in both directions', () => {
    renderWithProviders(<Portfolio />)
    click('P/L')
    expect(order()).toEqual(['CCC', 'AAA', 'BBB'])
    click('P/L')
    expect(order()).toEqual(['AAA', 'CCC', 'BBB'])
  })

  it('sorts Instrument by the ticker, not the company name', () => {
    stub([
      make('CCC', 'Alpha Inc', '100.00', '1.00'),
      make('AAA', 'Zeta Corp', '200.00', '2.00'),
      make('BBB', 'Mid Ltd', '300.00', '3.00'),
    ])
    renderWithProviders(<Portfolio />)
    click('Instrument')
    expect(order()).toEqual(['AAA', 'BBB', 'CCC'])
    click('Instrument')
    expect(order()).toEqual(['CCC', 'BBB', 'AAA'])
  })

  it('leaves the total row unchanged by a sort', () => {
    renderWithProviders(<Portfolio />)
    const totalText = () => screen.getByText(/^Total \(/).closest('tr').textContent
    const before = totalText()
    click('Value')
    expect(totalText()).toBe(before)
  })

  it('sorts Qty and Weight numerically', () => {
    renderWithProviders(<Portfolio />)
    click('Qty')
    expect(order()).toEqual(['CCC', 'AAA', 'BBB'])
    click('Weight')
    expect(order()).toEqual(['BBB', 'CCC', 'AAA'])
  })

  it('marks only the active header with aria-sort', () => {
    renderWithProviders(<Portfolio />)
    click('Value')
    expect(header('Value')).toHaveAttribute('aria-sort', 'ascending')
    expect(header('Instrument')).toHaveAttribute('aria-sort', 'none')
    expect(header('P/L')).toHaveAttribute('aria-sort', 'none')
    click('Value')
    expect(header('Value')).toHaveAttribute('aria-sort', 'descending')
  })

  it('leaves Avg cost and Last unsortable', () => {
    renderWithProviders(<Portfolio />)
    expect(within(header('Avg cost')).queryByRole('button')).not.toBeInTheDocument()
    expect(within(header('Last')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps the sticky header classes on sortable headers', () => {
    renderWithProviders(<Portfolio />)
    expect(header('Value')).toHaveClass('sticky', 'top-0', 'z-10', 'bg-pane')
    expect(header('Instrument')).toHaveClass('sticky', 'top-0', 'z-10', 'bg-pane')
  })
})

describe('Portfolio redesign', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    stub()
  })

  const trade = (overrides) => ({
    id: 1, date: '2026-09-01', type: 'BUY', instrument: 'NVIDIA', ticker: 'NVDA',
    qty: '10.0000', price: '150.00', total: '1500.00', account: 'Saxo',
    currency: 'USD', fx_rate: '0.86', total_eur: '1290.00', ...overrides,
  })

  it('view=transactions shows the trades grouped by day', () => {
    queries.useTransactions.mockReturnValue({
      data: [
        trade({ id: 1, date: '2026-09-02', instrument: 'Bravo', total_eur: '200.00' }),
        trade({ id: 2, date: '2026-09-02', instrument: 'Delta', type: 'SELL', total_eur: '50.00' }),
        trade({ id: 3, date: '2026-09-01', instrument: 'Alpha', total_eur: '100.00' }),
      ],
      isLoading: false,
      error: null,
    })
    renderWithProviders(<Portfolio />, { route: '/portfolio?view=transactions' })

    expect(screen.getByRole('button', { name: 'Transactions' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('table', { name: 'Positions' })).not.toBeInTheDocument()
    const second = screen.getByRole('rowgroup', { name: 'Trades on Wed 02 Sep 2026' })
    expect(within(second).getByText('Bravo')).toBeInTheDocument()
    expect(within(second).getByText('Delta')).toBeInTheDocument()
    expect(within(second).getByText('Bought €200.00 · sold €50.00')).toBeInTheDocument()
    const first = screen.getByRole('rowgroup', { name: 'Trades on Tue 01 Sep 2026' })
    expect(within(first).getByText('Alpha')).toBeInTheDocument()
    expect(within(first).queryByText('Bravo')).not.toBeInTheDocument()
  })

  it('shows the trades without the portfolio summary error in the transactions view', () => {
    queries.usePortfolioSummary.mockReturnValue({ ...idle, error: new Error('x'), refetch: vi.fn() })
    queries.useTransactions.mockReturnValue({ data: [trade({ instrument: 'Alpha' })], isLoading: false, error: null })
    renderWithProviders(<Portfolio />, { route: '/portfolio?view=transactions' })
    expect(within(screen.getByRole('table', { name: 'Transactions' })).getByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Could not load portfolio.')).not.toBeInTheDocument()
  })

  it('switches between positions and transactions with the view control', () => {
    queries.useTransactions.mockReturnValue({ data: [trade({})], isLoading: false, error: null })
    renderWithProviders(<Portfolio />)
    expect(screen.getByRole('button', { name: 'Positions' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Transactions' }))
    expect(screen.getByRole('rowgroup', { name: 'Trades on Tue 01 Sep 2026' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Positions' }))
    expect(screen.getByRole('table', { name: 'Positions' })).toBeInTheDocument()
  })

  it('weight above 15% renders in warning with the cap tick', () => {
    stub([msft, { ...msft, ticker: 'AAPL', name: 'Apple Inc.', weight: '9.40' }])
    renderWithProviders(<Portfolio />)
    const table = screen.getByRole('table', { name: 'Positions' })
    const heavy = within(table).getByText('27.8%')
    expect(heavy).toHaveClass('text-warn')
    expect(within(heavy.closest('td')).getByTitle('Your 15% cap')).toBeInTheDocument()
    const light = within(table).getByText('9.4%')
    expect(light).not.toHaveClass('text-warn')
    expect(within(light.closest('td')).getByTitle('Your 15% cap')).toBeInTheDocument()
  })

  it('sorting by Return toggles direction', () => {
    stub([
      { ...msft, ticker: 'AAA', uic: 'AAA', pnl_pct: '5.00' },
      { ...msft, ticker: 'BBB', uic: 'BBB', pnl_pct: '-2.00' },
      { ...msft, ticker: 'CCC', uic: 'CCC', pnl_pct: '12.00' },
    ])
    renderWithProviders(<Portfolio />)
    const table = screen.getByRole('table', { name: 'Positions' })
    const header = within(table).getByRole('columnheader', { name: 'Return' })
    const order = () =>
      within(table)
        .getAllByRole('link')
        .map((link) => ['AAA', 'BBB', 'CCC'].find((ticker) => link.textContent.includes(ticker)))
        .filter(Boolean)
    fireEvent.click(within(header).getByRole('button'))
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    expect(order()).toEqual(['BBB', 'AAA', 'CCC'])
    fireEvent.click(within(header).getByRole('button'))
    expect(header).toHaveAttribute('aria-sort', 'descending')
    expect(order()).toEqual(['CCC', 'AAA', 'BBB'])
  })

  it('Funds and Congress columns still hidden below 1440px', () => {
    renderWithProviders(<Portfolio />)
    const table = screen.getByRole('table', { name: 'Positions' })
    for (const name of ['Fund shares', 'Fund change', 'Congress']) {
      expect(within(table).getByRole('columnheader', { name })).toHaveClass('hidden', 'min-[1440px]:table-cell')
    }
  })

  it('reads concentration and currency from the positions it already has', () => {
    stub([msft, { ...msft, ticker: 'ASML', name: 'ASML Holding', currency: 'EUR', value: '1000.00', weight: '3.17' }])
    renderWithProviders(<Portfolio />)
    const concentration = screen.getByRole('heading', { name: 'Concentration' }).closest('.sd-panel')
    expect(within(concentration).getByText('MSFT')).toBeInTheDocument()
    expect(within(concentration).getByText('27.8%')).toHaveClass('text-warn')
    expect(within(concentration).getByText(/1 holding sits above the 15% cap/)).toBeInTheDocument()
    const currency = screen.getByRole('heading', { name: 'Currency' }).closest('.sd-panel')
    expect(within(currency).getByText('USD')).toBeInTheDocument()
    expect(within(currency).getByText('EUR')).toBeInTheDocument()
    expect(within(currency).getByText('€967,000.00')).toBeInTheDocument()
  })
})
