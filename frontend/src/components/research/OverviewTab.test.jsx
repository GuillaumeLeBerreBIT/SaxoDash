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

    expect(screen.getByText('32.10')).toBeInTheDocument()
    expect(screen.getByText('3.10T')).toBeInTheDocument()
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

    expect(screen.getByText(/FINNHUB_API_KEY is not set/)).toBeInTheDocument()
  })
})
