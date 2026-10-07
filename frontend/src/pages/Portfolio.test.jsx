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
    data: { portfolio_value: '31567.81', bank_total: '968435.55', bank_only_total: '1435.55', broker_cash: '967000.00', net_worth: '1000003.36' },
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

  it('heads the day column "Day %" when every quote is live or absent', () => {
    renderWithProviders(<Portfolio />)
    expect(screen.getByRole('columnheader', { name: 'Day %' })).toBeInTheDocument()
  })

  it('heads the day column "Latest session %" when a quote is not live', () => {
    queries.usePositionQuotes.mockReturnValue(new Map([[1, { uic: 1, change_pct: -1, change_basis: 'last_close' }]]))
    renderWithProviders(<Portfolio />)
    expect(screen.getByRole('columnheader', { name: 'Latest session %' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Day %' })).not.toBeInTheDocument()
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

  it('keeps name, value and P&L visible below md and hides the rest', () => {
    renderWithProviders(<Portfolio />)
    const table = screen.getByRole('table')
    for (const name of ['Name', 'Value', 'P&L']) {
      expect(within(table).getByRole('columnheader', { name })).not.toHaveClass('hidden')
    }
    for (const name of ['Qty', 'Avg', 'Price', /^(Day|Latest session) %$/, 'Weight']) {
      expect(within(table).getByRole('columnheader', { name })).toHaveClass('hidden', 'md:table-cell')
    }
    const row = within(table).getByText('MSFT').closest('tr')
    expect(within(row).getByText('US$494.36').closest('td')).toHaveClass('hidden', 'md:table-cell')
    expect(within(row).getByText('27.8%').closest('td')).toHaveClass('hidden', 'md:table-cell')
    expect(within(row).getByText('€8,773.32').closest('td')).not.toHaveClass('hidden')
  })
})
