import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import SnapshotSection from './SnapshotSection'

const data = {
  available: true,
  revenue_growth_ttm_yoy: 22, eps_growth_ttm_yoy: 30, revenue_growth_5y: 12,
  roe: 25, net_margin: 15, gross_margin: 60, operating_margin_ttm: 30,
  current_ratio: 2, debt_to_equity: 0.4, interest_coverage: 40, quick_ratio: 1.8,
  pe_ratio: 40, forward_pe: 30, peg_ratio: 0.8, ev_ebitda: 22,
  price_return_1m: 3, price_return_ytd: 12, price_return_1y: 25, beta: 1.2,
  valuation_history: { pe: { min: 15, median: 25, max: 30, n: 6, latest: 40 } },
}

describe('SnapshotSection', () => {
  it('renders all five groups with a verdict each', () => {
    render(<SnapshotSection fundamentals={{ data, isLoading: false }} />)
    for (const label of ['Growth', 'Profitability', 'Financial health', 'Valuation', 'Momentum']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Revenue growing fast; EPS outpacing revenue')).toBeInTheDocument()
    expect(screen.getByText(/P\/E above its 6-yr range/)).toBeInTheDocument()
  })

  it('shows an em dash for a missing metric but still renders the group', () => {
    render(<SnapshotSection fundamentals={{ data: { available: true, roe: 25, net_margin: 15 }, isLoading: false }} />)
    expect(screen.getByText('Profitability')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('defers to FundamentalsGate when unavailable', () => {
    render(<SnapshotSection fundamentals={{ data: { available: false, reason: 'no coverage' }, isLoading: false }} />)
    expect(screen.getByText(/no coverage/)).toBeInTheDocument()
  })
})
