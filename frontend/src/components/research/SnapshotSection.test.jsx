import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

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

const openAll = () => screen.getAllByRole('button', { expanded: false }).forEach((button) => fireEvent.click(button))

describe('SnapshotSection', () => {
  it('shows one line per group until a group is opened', () => {
    render(<SnapshotSection fundamentals={{ data, isLoading: false }} />)
    expect(screen.queryByText('ROE')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Profitability figures' }))
    expect(screen.getByText('ROE')).toBeInTheDocument()
    expect(screen.queryByText('Revenue YoY')).not.toBeInTheDocument()
  })

  it('renders all five groups with a verdict each', () => {
    render(<SnapshotSection fundamentals={{ data, isLoading: false }} />)
    for (const label of ['Growth', 'Profitability', 'Financial health', 'Valuation', 'Momentum']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('Revenue growing fast; EPS outpacing revenue')).toBeInTheDocument()
    expect(screen.getByText(/P\/E above its 6-yr range/)).toBeInTheDocument()
  })

  it('takes its price returns from the page, so it agrees with the Performance card', () => {
    const returns = [{ key: '1M', pct: 4.4 }, { key: 'YTD', pct: 31.05 }, { key: '1Y', pct: null }, { key: '3M', pct: 9 }]
    render(<SnapshotSection fundamentals={{ data, isLoading: false }} returns={returns} />)
    openAll()
    const value = (label) => screen.getByText(label).nextSibling.textContent
    expect([value('1 month'), value('YTD'), value('1 year')]).toEqual(['▲ 4.40%', '▲ 31.05%', '▲ 25.00%'])
  })

  it('draws a falling return with its arrow and the down colour', () => {
    render(<SnapshotSection fundamentals={{ data: { ...data, price_return_1y: -12.5 }, isLoading: false }} />)
    openAll()
    expect(screen.getByText('▼ 12.50%')).toHaveClass('text-down')
  })

  it('writes multiples with a times sign and interest coverage as a whole number', () => {
    render(<SnapshotSection fundamentals={{ data: { ...data, interest_coverage: 621.6 }, isLoading: false }} />)
    openAll()
    const value = (label) => screen.getByText(label).nextSibling.textContent
    expect([value('Int. coverage'), value('Debt/equity'), value('Current ratio')]).toEqual(['622×', '0.40×', '2.00×'])
  })

  it('takes its P/E phrase from the verdict when the page has one', () => {
    render(<SnapshotSection fundamentals={{ data, isLoading: false }} valuationGrade="expensive" />)
    expect(screen.getByText('Growth looks cheap vs. earnings growth; P/E high for its own history')).toBeInTheDocument()
    expect(screen.queryByText(/6-yr range/)).not.toBeInTheDocument()
  })

  it('shows an em dash for a missing metric but still renders the group', () => {
    render(<SnapshotSection fundamentals={{ data: { available: true, roe: 25, net_margin: 15 }, isLoading: false }} />)
    openAll()
    expect(screen.getByText('Profitability')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('defers to FundamentalsGate when unavailable', () => {
    render(<SnapshotSection fundamentals={{ data: { available: false, reason: 'no coverage' }, isLoading: false }} />)
    expect(screen.getByText(/no coverage/)).toBeInTheDocument()
  })
})
