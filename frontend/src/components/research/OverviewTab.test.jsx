import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import OverviewTab from './OverviewTab'

const bars = []

const risingBars = (count) =>
  Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(2026, 9, 9) - (count - 1 - index) * 86_400_000)
    const close = 100 + index
    return { date: day.toISOString().slice(0, 10), open: close, high: close, low: close, close, volume: 1000 }
  })

const renderOverview = (props = {}) =>
  render(
    <OverviewTab
      symbol="AAPL"
      position={null}
      details={null}
      detailsLoading={false}
      bars={bars}
      allBars={[]}
      range="1M"
      fundamentals={{ data: { available: false }, isLoading: false }}
      {...props}
    />,
  )

describe('OverviewTab fundamentals', () => {
  it('shows real metrics when fundamentals are available', () => {
    // Market cap / dividend yield / 52W range moved to the Valuation tab's
    // Ratios grid (they were the only place those fields showed, so folding
    // them there kept the data rather than dropping it) - Overview's own
    // read of the fundamentals is the Investment Snapshot, tested below.
    render(
      <OverviewTab
        symbol="AAPL"
        position={null}
        details={null}
        detailsLoading={false}
        bars={bars}
        range="1M"
        fundamentals={{
          data: { available: true, name: 'Apple Inc', pe_ratio: 32.1, market_cap: 3_100_000, dividend_yield: 0.44 },
          isLoading: false,
        }}
      />
    )

    expect(screen.getAllByText('32.10').length).toBeGreaterThan(0)
  })

  it('renders the investment snapshot from the same fundamentals', () => {
    render(
      <OverviewTab
        symbol="AAPL"
        position={null}
        details={null}
        detailsLoading={false}
        bars={bars}
        range="1M"
        fundamentals={{
          data: {
            available: true, name: 'Apple Inc', pe_ratio: 32.1, market_cap: 3_100_000,
            dividend_yield: 0.44, revenue_growth_ttm_yoy: 12, net_margin: 25, roe: 30,
          },
          isLoading: false,
        }}
      />
    )

    expect(screen.getByText('Investment snapshot')).toBeInTheDocument()
    expect(screen.getByText('Growth')).toBeInTheDocument()
  })

  it('shows instrument reference data as a compact strip, omitting missing fields', () => {
    render(
      <OverviewTab
        symbol="AAPL"
        position={null}
        details={{ symbol: 'AAPL', exchange_name: 'Nasdaq', currency: 'USD', isin: 'US0378331005', uic: 211 }}
        detailsLoading={false}
        bars={bars}
        range="1M"
        fundamentals={{ data: { available: false, reason: 'x' }, isLoading: false }}
      />
    )

    expect(screen.getByText('US0378331005')).toBeInTheDocument()
    expect(screen.getByText('Nasdaq')).toBeInTheDocument()
    expect(screen.queryByText(/reference data from Saxo/)).not.toBeInTheDocument()
  })

  it('shows an unavailable message when Finnhub has no data for this symbol', () => {
    render(
      <OverviewTab
        symbol="AAPL"
        position={null}
        details={null}
        detailsLoading={false}
        bars={bars}
        range="1M"
        fundamentals={{ data: { available: false, reason: 'FINNHUB_API_KEY is not set.' }, isLoading: false }}
      />
    )

    expect(screen.getAllByText(/FINNHUB_API_KEY is not set/).length).toBeGreaterThan(0)
  })

  it('hides the Investment Snapshot for an ETF, but keeps the Thesis & risks notes', () => {
    render(
      <OverviewTab
        symbol="SPY"
        position={null}
        details={null}
        detailsLoading={false}
        bars={bars}
        range="1M"
        fundamentals={{ data: { available: false, reason: 'Not a company' }, isLoading: false }}
        isEtf
      />
    )

    // An ETF will never get fundamentals - showing "unavailable" implies a
    // gap that might fill in later, which is misleading here.
    expect(screen.queryByText('Investment snapshot')).not.toBeInTheDocument()
    // Freeform notes aren't fundamentals-derived, so they still make sense.
    expect(screen.getByText('Thesis & risks')).toBeInTheDocument()
    expect(screen.getByText('Business')).toBeInTheDocument()
  })

  it('discloses the price basis only when the mark is not live', () => {
    const position = { qty: 1, avg_cost: 100, currency: 'USD', value: 100, pnl: 0, pnl_pct: 0 }
    const props = { symbol: 'AAPL', details: null, detailsLoading: false, bars, range: '1M', fundamentals: { data: null, isLoading: false } }
    const { rerender } = render(<OverviewTab {...props} position={{ ...position, price_source: 'live' }} />)
    expect(screen.queryByText(/Live price from Saxo/)).not.toBeInTheDocument()

    rerender(<OverviewTab {...props} position={{ ...position, price_source: 'derived' }} />)
    expect(screen.getByText(/Marked from Saxo's profit\/loss/)).toBeInTheDocument()
  })

  it('explains why an ETF has no fundamentals snapshot', () => {
    render(
      <OverviewTab symbol="SPY" position={null} details={null} detailsLoading={false} bars={bars} range="1M" isEtf />
    )
    expect(screen.getByText(/This is an ETF/)).toBeInTheDocument()
  })
})

describe('OverviewTab company view', () => {
  it('opens the company view with the key facts', () => {
    renderOverview({ fundamentals: { data: { available: true, market_cap: 4_976_177, country: 'US' }, isLoading: false } })

    expect(screen.getByText('Market cap')).toBeInTheDocument()
    expect(screen.getByText('Country')).toBeInTheDocument()
  })

  it('shows trailing performance from the full price history', () => {
    renderOverview({ allBars: risingBars(300) })

    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
    expect(screen.getByText('1Y')).toBeInTheDocument()
  })

  it('shows ownership, capital structure and the analyst rating when the data is there', () => {
    renderOverview({
      fundamentals: {
        isLoading: false,
        data: {
          available: true,
          shares_outstanding: 1000,
          free_float: 800,
          market_cap: 4_000_000,
          enterprise_value: 4_050_000,
          recommendation: { strong_buy: 5, buy: 5, hold: 2, sell: 0, strong_sell: 0, period: '2026-09-01' },
          recommendation_history: [],
        },
      },
    })

    expect(screen.getByText('Ownership')).toBeInTheDocument()
    expect(screen.getByText('Capital structure')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /analyst rating/i })).toBeInTheDocument()
  })

  it('shows none of the company cards for an ETF', () => {
    renderOverview({
      isEtf: true,
      allBars: risingBars(300),
      fundamentals: { isLoading: false, data: { available: true, market_cap: 100, shares_outstanding: 10, free_float: 8 } },
    })

    expect(screen.queryByText('Ownership')).not.toBeInTheDocument()
    expect(screen.queryByText('Market cap')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Performance' })).toBeInTheDocument()
  })

  it('shows none of the company cards while fundamentals are unavailable', () => {
    renderOverview({ fundamentals: { isLoading: false, data: { available: false } } })

    expect(screen.queryByText('Ownership')).not.toBeInTheDocument()
    expect(screen.queryByText('Capital structure')).not.toBeInTheDocument()
  })
})

