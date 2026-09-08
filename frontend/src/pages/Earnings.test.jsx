import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'

import Earnings from './Earnings'
import { renderWithProviders } from '../test/renderWithProviders'
import * as queries from '../api/queries'

vi.mock('../api/queries')

const future = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

beforeEach(() => {
  queries.usePositions.mockReturnValue({ data: [{ ticker: 'AAPL' }] })
})

describe('Earnings page', () => {
  it('groups events and marks held symbols', () => {
    queries.useEarningsCalendar.mockReturnValue({
      isLoading: false,
      data: {
        events: [
          { symbol: 'AAPL', date: future(3), session: 'amc', eps_estimate: 2.1, eps_actual: null, eps_surprise_pct: null },
          { symbol: 'MSFT', date: future(-2), session: 'bmo', eps_estimate: 1.9, eps_actual: 2.0, eps_surprise_pct: 5.3 },
        ],
        unavailable: [],
        window: { from: future(-7), to: future(31) },
      },
    })

    renderWithProviders(<Earnings />, { route: '/earnings' })

    expect(screen.getByText('AAPL')).toBeInTheDocument()
    expect(screen.getByText('Held')).toBeInTheDocument()
    expect(screen.getByText('Recent')).toBeInTheDocument()      // MSFT bucket
    expect(screen.getByText('Next 7 days')).toBeInTheDocument()  // AAPL bucket
  })

  it('renders a failure line when the calendar request errors', () => {
    queries.useEarningsCalendar.mockReturnValue({ isLoading: false, error: new Error('boom'), data: undefined })

    renderWithProviders(<Earnings />, { route: '/earnings' })

    expect(screen.getByText(/Couldn’t load the earnings calendar\./)).toBeInTheDocument()
    expect(screen.queryByText(/No earnings in the next 30 days/)).not.toBeInTheDocument()
  })

  it('shows an empty state and the unavailable count', () => {
    queries.useEarningsCalendar.mockReturnValue({
      isLoading: false,
      data: { events: [], unavailable: ['TSLA', 'NVDA'], window: { from: future(-7), to: future(31) } },
    })

    renderWithProviders(<Earnings />, { route: '/earnings' })

    expect(screen.getByText(/No earnings in the next 30 days/)).toBeInTheDocument()
    expect(screen.getByText(/2 symbol/)).toBeInTheDocument()
  })
})
