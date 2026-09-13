import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import CashFlowTrendChart from './CashFlowTrendChart'

const trend = [
  { period: '2024-09-28', fcf: 108_807_000_000, debt: 96_662_000_000, cash: 29_943_000_000 },
  { period: '2025-09-27', fcf: 98_767_000_000, debt: 90_678_000_000, cash: 35_934_000_000 },
]

describe('CashFlowTrendChart', () => {
  it('renders nothing without a trend', () => {
    const { container } = render(<CashFlowTrendChart trend={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the cash-generation card when a trend is available', () => {
    render(<CashFlowTrendChart trend={trend} />)
    expect(screen.getByText('Cash generation & balance sheet')).toBeInTheDocument()
  })
})
