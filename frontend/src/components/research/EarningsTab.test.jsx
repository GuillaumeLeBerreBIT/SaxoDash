import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import EarningsTab from './EarningsTab'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const NO_FUNDAMENTALS = { data: { available: false, reason: 'x' }, isLoading: false }

const AVAILABLE = {
  available: true,
  next: {
    date: '2999-01-15',
    session: 'amc',
    eps_estimate: 2.1,
    revenue_estimate: 120_000_000_000,
  },
  history: [
    { date: '2026-03-31', eps_actual: 1.5, eps_estimate: 1.45, eps_surprise_pct: 3.4 },
    { date: '2026-06-30', eps_actual: 1.6, eps_estimate: 1.7, eps_surprise_pct: -5.9 },
    { date: '2026-09-30', eps_actual: 1.9, eps_estimate: 1.8, eps_surprise_pct: 5.6 },
  ],
  score: { beats: 2, quarters: 3, beat_rate: 0.67, avg_surprise: 1.03, streak: 1 },
}

const renderTab = (extraEarnings = {}) =>
  render(
    <EarningsTab
      symbol="NVDA"
      earnings={{ data: { ...AVAILABLE, ...extraEarnings }, isLoading: false }}
      fundamentals={NO_FUNDAMENTALS}
    />,
  )

describe('EarningsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queries.useStatements.mockReturnValue({ data: undefined, isLoading: false })
  })

  it('shows the next earnings date and estimates', () => {
    render(<EarningsTab symbol="AAPL" earnings={{ data: AVAILABLE, isLoading: false }} fundamentals={NO_FUNDAMENTALS} />)
    expect(screen.getByText('Next earnings')).toBeInTheDocument()
    expect(screen.getByText('15 Jan 2999')).toBeInTheDocument()
    expect(screen.getByText('After close')).toBeInTheDocument()
  })

  it('renders the EPS history chart once, with no second chart echoing it', () => {
    render(<EarningsTab symbol="AAPL" earnings={{ data: AVAILABLE, isLoading: false }} fundamentals={NO_FUNDAMENTALS} />)
    expect(screen.getByText('EPS: actual vs. estimate')).toBeInTheDocument()
    expect(screen.queryByText('Revenue: actual vs. estimate')).not.toBeInTheDocument()
    expect(screen.queryByText('EPS surprise')).not.toBeInTheDocument()
  })

  it('summarises the beat record from the backend score', () => {
    render(<EarningsTab symbol="AAPL" earnings={{ data: AVAILABLE, isLoading: false }} fundamentals={NO_FUNDAMENTALS} />)
    expect(screen.getByText('Beat record')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()
    expect(screen.getByText('A consistent beat history.')).toBeInTheDocument()
  })

  it('falls back to the reason when earnings are unavailable', () => {
    render(
      <EarningsTab
        symbol="AAPL"
        earnings={{ data: { available: false, reason: 'no coverage' }, isLoading: false }}
        fundamentals={NO_FUNDAMENTALS}
      />,
    )
    expect(screen.getByText(/no coverage/)).toBeInTheDocument()
    expect(screen.queryByText('Next earnings')).not.toBeInTheDocument()
  })

  it('says when no earnings date is scheduled', () => {
    render(
      <EarningsTab
        symbol="AAPL"
        earnings={{ data: { ...AVAILABLE, next: null }, isLoading: false }}
        fundamentals={NO_FUNDAMENTALS}
      />,
    )
    expect(screen.getByText(/No scheduled earnings date/)).toBeInTheDocument()
  })

  it('shows the What changed card once fundamentals carry quarterly trends', () => {
    render(
      <EarningsTab
        symbol="AAPL"
        earnings={{ data: AVAILABLE, isLoading: false }}
        fundamentals={{ data: { available: true, quarterly_trends: null }, isLoading: false }}
      />,
    )
    expect(screen.getByText('What changed')).toBeInTheDocument()
  })

  it('labels the quarters still to come as estimates', () => {
    renderTab({ upcoming: [{ date: '2026-11-02', eps_estimate: 1.02 }] })

    expect(screen.getByText(/1 upcoming quarter, estimate only/i)).toBeInTheDocument()
  })

  it('never asks for statements, in either view', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Annual' }))

    expect(queries.useStatements).not.toHaveBeenCalled()
  })

  it('shows the split-adjusted annual EPS from fundamentals', async () => {
    render(
      <EarningsTab
        symbol="NVDA"
        earnings={{ data: AVAILABLE, isLoading: false }}
        fundamentals={{
          isLoading: false,
          data: {
            available: true,
            annual_eps: [
              { period: '2024-01-28', eps: 1.19 },
              { period: '2025-01-26', eps: 2.94 },
            ],
          },
        }}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Annual' }))

    expect(screen.getByText('Diluted EPS by fiscal year')).toBeInTheDocument()
    expect(screen.getByText('Adjusted for splits, from Finnhub')).toBeInTheDocument()
  })

  it('shows a skeleton while fundamentals load', async () => {
    render(
      <EarningsTab
        symbol="NVDA"
        earnings={{ data: AVAILABLE, isLoading: false }}
        fundamentals={{ isLoading: true, data: undefined }}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Annual' }))

    expect(screen.queryByText(/annual EPS is unavailable/i)).not.toBeInTheDocument()
  })

  it('says so when annual EPS is unavailable', async () => {
    renderTab()

    await userEvent.click(screen.getByRole('button', { name: 'Annual' }))

    expect(screen.getByText(/annual EPS is unavailable/i)).toBeInTheDocument()
  })

  it('no longer shows the margin trend', () => {
    renderTab()

    expect(screen.queryByText('Margin trend')).not.toBeInTheDocument()
  })
})
