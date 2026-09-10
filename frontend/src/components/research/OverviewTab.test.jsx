import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import OverviewTab from './OverviewTab'

const bars = []

describe('OverviewTab fundamentals', () => {
  it('shows real metrics when fundamentals are available', () => {
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
    expect(screen.getByText('3.10T')).toBeInTheDocument()
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
})
