import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import ValuationTab from './ValuationTab'

const AVAILABLE = {
  available: true,
  pe_ratio: 32.1,
  ps_ratio: 8.4,
  pb_ratio: 48.2,
  peg_ratio: 2.57,
  roe: 147.2,
  net_margin: 26.3,
  gross_margin: 46.2,
  recommendation: { strong_buy: 12, buy: 20, hold: 8, sell: 1, strong_sell: 0, period: '2026-09-01' },
  eps_history: [
    { period: '2026-03-31', actual: 1.52, estimate: 1.5, surprise_percent: 1.33 },
    { period: '2026-06-30', actual: 1.65, estimate: 1.58, surprise_percent: 4.43 },
  ],
  beta: 1.24,
  forward_pe: 28.5,
  ev_ebitda: 22.3,
  ev_revenue: 9.1,
  current_ratio: 0.98,
  roa: 30.2,
  roi: 65.4,
  dividend_growth_5y: 5.1,
  price_return_1m: 2.4,
  price_return_ytd: 18.7,
  price_return_1y: 31.2,
}

describe('ValuationTab', () => {
  it('shows in-app ratios when fundamentals are available', () => {
    render(<ValuationTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)

    expect(screen.getByText('32.10')).toBeInTheDocument()
    expect(screen.getByText('2.57')).toBeInTheDocument()
  })

  it('shows the analyst recommendation counts', () => {
    render(<ValuationTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)

    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText(/Buy/)).toBeInTheDocument()
  })

  it('shows the extended ratios computed from data already fetched', () => {
    render(<ValuationTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)

    expect(screen.getByText('1.24')).toBeInTheDocument()
    expect(screen.getByText('22.30')).toBeInTheDocument()
  })

  it('shows market cap, dividend yield and 52W range in the ratios grid', () => {
    render(
      <ValuationTab
        fundamentals={{
          data: { ...AVAILABLE, market_cap: 3_100_000, dividend_yield: 0.44, week52_low: 150, week52_high: 260 },
          isLoading: false,
        }}
      />,
    )

    expect(screen.getByText('3.10T')).toBeInTheDocument()
    expect(screen.getByText('150.00 – 260.00')).toBeInTheDocument()
  })

  it('shows a valuation verdict next to the ratios', () => {
    render(<ValuationTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)

    expect(screen.getByText(/expensive vs. growth/)).toBeInTheDocument()
  })

  it('shows an unavailable message instead of ratios when data is missing', () => {
    render(<ValuationTab fundamentals={{ data: { available: false, reason: 'no coverage' }, isLoading: false }} />)

    expect(screen.getByText(/no coverage/)).toBeInTheDocument()
    expect(screen.queryByText('32.10')).not.toBeInTheDocument()
  })

  it('does not repeat the EPS actual-vs-estimate chart already on the Earnings tab', () => {
    render(<ValuationTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)
    expect(screen.queryByText('EPS: actual vs. estimate')).not.toBeInTheDocument()
  })

  it('shows the next earnings date when the earnings feed has one', () => {
    render(
      <ValuationTab
        fundamentals={{ data: AVAILABLE, isLoading: false }}
        earnings={{ data: { available: true, next: { date: '2099-02-01', eps_estimate: 2.4 } } }}
      />,
    )
    expect(screen.getByText('Next earnings')).toBeInTheDocument()
    expect(screen.getByText('2099-02-01')).toBeInTheDocument()
  })

  it('omits the next earnings card when the earnings feed is absent', () => {
    render(<ValuationTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)
    expect(screen.queryByText('Next earnings')).not.toBeInTheDocument()
  })

  it('shows P/E against its own multi-year range when history is available', () => {
    render(
      <ValuationTab
        fundamentals={{
          data: { ...AVAILABLE, valuation_history: { pe: { latest: 32.1, min: 12, median: 22, max: 35, n: 7 } } },
          isLoading: false,
        }}
      />,
    )
    expect(screen.getByText(/median 22/)).toBeInTheDocument()
    expect(screen.getByText(/over 7 yrs/)).toBeInTheDocument()
  })

  it('omits the history context when valuation_history is absent', () => {
    render(<ValuationTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)
    expect(screen.queryByText(/over \d+ yrs/)).not.toBeInTheDocument()
  })
})
