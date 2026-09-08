import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import EarningsTab from './EarningsTab'

const AVAILABLE = {
  available: true,
  next: {
    date: '2999-01-15', session: 'amc',
    eps_estimate: 2.1, revenue_estimate: 120_000_000_000,
  },
  history: [
    { date: '2026-03-31', eps_actual: 1.5, eps_estimate: 1.45, eps_surprise_pct: 3.4,
      revenue_actual: 90_000_000_000, revenue_estimate: 89_000_000_000 },
    { date: '2026-06-30', eps_actual: 1.6, eps_estimate: 1.7, eps_surprise_pct: -5.9,
      revenue_actual: 95_000_000_000, revenue_estimate: 96_000_000_000 },
  ],
}

describe('EarningsTab', () => {
  it('shows the next earnings date and estimates', () => {
    render(<EarningsTab symbol="AAPL" earnings={{ data: AVAILABLE, isLoading: false }} />)
    expect(screen.getByText('Next earnings')).toBeInTheDocument()
    expect(screen.getByText('2999-01-15')).toBeInTheDocument()
    expect(screen.getByText('After close')).toBeInTheDocument()
  })

  it('renders the EPS and revenue history charts', () => {
    render(<EarningsTab symbol="AAPL" earnings={{ data: AVAILABLE, isLoading: false }} />)
    expect(screen.getByText('EPS: actual vs. estimate')).toBeInTheDocument()
    expect(screen.getByText('Revenue: actual vs. estimate')).toBeInTheDocument()
  })

  it('shows the surprise trend', () => {
    render(<EarningsTab symbol="AAPL" earnings={{ data: AVAILABLE, isLoading: false }} />)
    expect(screen.getByText('EPS surprise')).toBeInTheDocument()
  })

  it('falls back to the reason when earnings are unavailable', () => {
    render(<EarningsTab symbol="AAPL" earnings={{ data: { available: false, reason: 'no coverage' }, isLoading: false }} />)
    expect(screen.getByText(/no coverage/)).toBeInTheDocument()
    expect(screen.queryByText('Next earnings')).not.toBeInTheDocument()
  })

  it('says when no earnings date is scheduled', () => {
    render(<EarningsTab symbol="AAPL" earnings={{ data: { ...AVAILABLE, next: null }, isLoading: false }} />)
    expect(screen.getByText(/No scheduled earnings date/)).toBeInTheDocument()
  })
}
)
