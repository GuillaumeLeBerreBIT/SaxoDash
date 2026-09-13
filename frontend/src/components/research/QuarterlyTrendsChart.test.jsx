import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import QuarterlyTrendsChart from './QuarterlyTrendsChart'

const trends = [
  { period: '2025-09-30', eps: 1.2, revenue_per_share: 10, gross_margin: 44, net_margin: 22, operating_margin: 28 },
  { period: '2025-12-31', eps: 1.4, revenue_per_share: 11, gross_margin: 45, net_margin: 24, operating_margin: 29 },
]

describe('QuarterlyTrendsChart', () => {
  it('renders nothing without trend data', () => {
    const { container } = render(<QuarterlyTrendsChart trends={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the margin trend card when quarters are available', () => {
    render(<QuarterlyTrendsChart trends={trends} />)
    expect(screen.getByText('Margin trend')).toBeInTheDocument()
    expect(screen.getByText('Gross margin')).toBeInTheDocument()
    expect(screen.getByText('Net margin')).toBeInTheDocument()
  })
})
