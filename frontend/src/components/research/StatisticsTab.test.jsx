import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import StatisticsTab from './StatisticsTab'

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

const renderTab = (extra) =>
  render(<StatisticsTab fundamentals={{ data: { available: true, ...extra }, isLoading: false }} />)

describe('StatisticsTab', () => {
  it('shows in-app ratios when fundamentals are available', () => {
    render(<StatisticsTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)

    expect(screen.getByText('32.10')).toBeInTheDocument()
    expect(screen.getByText('2.57')).toBeInTheDocument()
  })

  it('shows the extended ratios computed from data already fetched', () => {
    render(<StatisticsTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)

    expect(screen.getByText('1.24')).toBeInTheDocument()
    expect(screen.getByText('22.30')).toBeInTheDocument()
  })

  it('shows market cap, dividend yield and 52W range in the ratios grid', () => {
    render(
      <StatisticsTab
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
    render(<StatisticsTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)

    expect(screen.getByText(/expensive vs. growth/)).toBeInTheDocument()
  })

  it('shows an unavailable message instead of ratios when data is missing', () => {
    render(<StatisticsTab fundamentals={{ data: { available: false, reason: 'no coverage' }, isLoading: false }} />)

    expect(screen.getByText(/no coverage/)).toBeInTheDocument()
    expect(screen.queryByText('32.10')).not.toBeInTheDocument()
  })

  it('does not repeat the EPS actual-vs-estimate chart already on the Earnings tab', () => {
    render(<StatisticsTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)
    expect(screen.queryByText('EPS: actual vs. estimate')).not.toBeInTheDocument()
  })

  it('does not repeat the Next earnings card already on the Earnings tab', () => {
    render(<StatisticsTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)
    expect(screen.queryByText('Next earnings')).not.toBeInTheDocument()
  })

  it('shows P/E against its own multi-year range when history is available', () => {
    render(
      <StatisticsTab
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
    render(<StatisticsTab fundamentals={{ data: AVAILABLE, isLoading: false }} />)
    expect(screen.queryByText(/over \d+ yrs/)).not.toBeInTheDocument()
  })

  it('shows the ratios by year when the history is there', () => {
    renderTab({ ratio_history: [{ period: '2024-09-28', pe: 37.2 }, { period: '2025-09-27', pe: 33.56 }] })

    expect(screen.getByText('Ratios by year')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Current' })).toBeInTheDocument()
  })

  it('leaves the by-year card out without a history', () => {
    renderTab({})

    expect(screen.queryByText('Ratios by year')).not.toBeInTheDocument()
  })

  it('no longer shows analyst recommendations or the cash flow chart', () => {
    renderTab({
      recommendation: { strong_buy: 1, buy: 1, hold: 1, sell: 0, strong_sell: 0, period: '2026-09-01' },
      cash_flow_trend: [{ period: '2024-12-31', fcf: 1, debt: 1, cash: 1 }],
    })

    expect(screen.queryByText('Analyst recommendations')).not.toBeInTheDocument()
    expect(screen.queryByText('Cash generation & balance sheet')).not.toBeInTheDocument()
  })
})
