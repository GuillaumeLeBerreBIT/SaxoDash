import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Earnings from './Earnings'
import { renderWithProviders } from '../test/renderWithProviders'
import * as queries from '../api/queries'

vi.mock('../api/queries')

const MON = '2026-10-26' // a Monday
const WINDOW = { from: '2026-10-26', to: '2026-10-30', week: 0 }

const ev = (o = {}) => ({
  symbol: 'X',
  date: MON,
  session: 'amc',
  quarter: 4,
  year: 2026,
  eps_estimate: 1,
  eps_actual: null,
  eps_surprise_pct: null,
  revenue_estimate: 1e9,
  revenue_actual: null,
  held: false,
  watched: false,
  mine: false,
  ...o,
})

const STATS = {
  total: 1, reported: 0, beat: 0, missed: 0, inline: 0, mine: 0,
  avg_surprise: null, by_day: [],
}

const stub = (over = {}) =>
  queries.useEarningsCalendar.mockReturnValue({
    isLoading: false,
    error: null,
    data: { events: [ev()], window: WINDOW, ok: true, stats: STATS, ...over },
  })

beforeEach(() => {
  queries.useEarningsCalendar.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Earnings page', () => {
  it('shows the week label and the selected day docket', () => {
    stub({ events: [ev({ symbol: 'MSFT', held: true, mine: true })] })
    renderWithProviders(<Earnings />, { route: '/earnings' })

    expect(screen.getByText('Oct 26 – 30 · October 2026')).toBeInTheDocument()
    // MSFT shows in both the week-strip preview and the docket row.
    expect(screen.getAllByText('MSFT').length).toBeGreaterThan(0)
    expect(screen.getByText('Held')).toBeInTheDocument()
  })

  it('reported rows show the actual + a surprise chip; upcoming rows show the estimate', () => {
    stub({
      events: [
        ev({ symbol: 'REPT', eps_actual: 2.2, eps_estimate: 2.0, eps_surprise_pct: 10 }),
        ev({ symbol: 'SOON', eps_estimate: 1.5, revenue_estimate: 5e8 }),
      ],
    })
    renderWithProviders(<Earnings />, { route: '/earnings' })

    expect(screen.getByText('2.20')).toBeInTheDocument()
    expect(screen.getByText(/▲ 10\.0%/)).toBeInTheDocument()
    expect(screen.getByText('1.50')).toBeInTheDocument()
  })

  it('shows the week-summary headline from the backend stats', () => {
    stub({
      stats: {
        total: 40, reported: 12, beat: 8, missed: 3, inline: 1, mine: 2,
        avg_surprise: 4.2,
        by_day: [
          { date: '2026-10-26', beat: 5, missed: 0, inline: 0 },
          { date: '2026-10-27', beat: 1, missed: 2, inline: 0 },
        ],
      },
    })
    renderWithProviders(<Earnings />, { route: '/earnings' })

    expect(screen.getByText('Reporting')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('8/12')).toBeInTheDocument()
    expect(screen.getByText('+4.2%')).toBeInTheDocument()
    expect(screen.getByText(/2 on your lists/)).toBeInTheDocument()
  })

  it('opens on today’s weekday column by default, not a fixed Monday', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T12:00:00')) // a Wednesday in the stub window
    stub({
      events: [
        ev({ symbol: 'MONCO', date: '2026-10-26' }),
        ev({ symbol: 'WEDCO', date: '2026-10-28' }),
      ],
    })
    renderWithProviders(<Earnings />, { route: '/earnings' })

    // Wednesday's name shows in both the rail and the open docket; Monday's
    // only in the rail.
    expect(screen.getAllByText('WEDCO')).toHaveLength(2)
    expect(screen.getAllByText('MONCO')).toHaveLength(1)
  })

  it('labels every docket column and carries a reading-guide tooltip', () => {
    stub({ events: [ev({ symbol: 'MON', date: MON })] })
    renderWithProviders(<Earnings />, { route: '/earnings' })

    expect(screen.getByText('Symbol')).toBeInTheDocument()
    expect(screen.getByText('EPS · est')).toBeInTheDocument()
    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.getByText('vs est', { exact: false })).toBeInTheDocument()
  })

  it('the Mine toggle refetches with scope=mine', async () => {
    stub()
    renderWithProviders(<Earnings />, { route: '/earnings' })

    await userEvent.click(screen.getByRole('button', { name: 'Mine' }))

    expect(queries.useEarningsCalendar).toHaveBeenLastCalledWith('mine', 0)
  })

  it('the week arrow refetches with the next week offset', async () => {
    stub()
    renderWithProviders(<Earnings />, { route: '/earnings' })

    await userEvent.click(screen.getByRole('button', { name: 'Next week' }))

    expect(queries.useEarningsCalendar).toHaveBeenLastCalledWith('all', 1)
  })

  it('renders a failure card when the calendar comes back not ok', () => {
    stub({ ok: false, events: [] })
    renderWithProviders(<Earnings />, { route: '/earnings' })

    expect(screen.getByText(/Couldn’t load the earnings calendar\./)).toBeInTheDocument()
    expect(screen.queryByText(/No companies report/)).not.toBeInTheDocument()
  })

  it('a quiet day in Mine scope offers a way back to All', async () => {
    stub({ events: [] })
    renderWithProviders(<Earnings />, { route: '/earnings' })

    await userEvent.click(screen.getByRole('button', { name: 'Mine' }))
    expect(screen.getByText(/Nothing on your lists reports this day/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /View all/ }))
    expect(queries.useEarningsCalendar).toHaveBeenLastCalledWith('all', 0)
  })
})
