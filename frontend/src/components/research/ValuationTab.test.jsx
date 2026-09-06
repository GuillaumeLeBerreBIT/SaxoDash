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

  it('shows an unavailable message instead of ratios when data is missing', () => {
    render(<ValuationTab fundamentals={{ data: { available: false, reason: 'no coverage' }, isLoading: false }} />)

    expect(screen.getByText(/no coverage/)).toBeInTheDocument()
    expect(screen.queryByText('32.10')).not.toBeInTheDocument()
  })
})
