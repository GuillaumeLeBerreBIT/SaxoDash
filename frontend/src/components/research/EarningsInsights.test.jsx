import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import EarningsInsights from './EarningsInsights'

function row(period, eps, revPerShare, operating = null) {
  return { period, eps, revenue_per_share: revPerShare, gross_margin: null, net_margin: null, operating_margin: operating }
}

// The margin YoY comparison reads index 9 (latest) against index 5
// (latest - 4), so operating_margin is set at exactly those two indices.
const TRENDS = [
  row('2024-Q1', 1.0, 8.0), row('2024-Q2', 1.0, 8.0), row('2024-Q3', 1.0, 8.0), row('2024-Q4', 1.0, 8.0),
  row('2025-Q1', 1.1, 10.0), row('2025-Q2', 1.1, 10.0, 27), row('2025-Q3', 1.1, 10.0), row('2025-Q4', 1.1, 10.0),
  row('2026-Q1', 1.3, 11.0), row('2026-Q2', 1.6, 12.5, 31),
]

describe('EarningsInsights', () => {
  it('renders derived sentences when quarterly_trends is available', () => {
    render(<EarningsInsights fundamentals={{ data: { available: true, quarterly_trends: TRENDS }, isLoading: false }} />)
    expect(screen.getByText(/accelerated|decelerated|held steady/)).toBeInTheDocument()
  })

  it('shows a not-enough-history line when quarterly_trends is absent', () => {
    render(<EarningsInsights fundamentals={{ data: { available: true }, isLoading: false }} />)
    expect(screen.getByText(/Not enough quarterly history/)).toBeInTheDocument()
  })

  it('defers to FundamentalsGate when fundamentals are unavailable', () => {
    render(<EarningsInsights fundamentals={{ data: { available: false, reason: 'no coverage' }, isLoading: false }} />)
    expect(screen.getByText(/no coverage/)).toBeInTheDocument()
  })
})
