import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, within } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import FundsTab from './FundsTab'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

const idle = { data: undefined, isLoading: false, error: null }

const OWNERSHIP = {
  quarter: '2026-06-30',
  filed: 80,
  tracked: 88,
  ticker: 'NBIS',
  issuer: 'NEBIUS GROUP N.V.',
  stock: { owners: 2, new: 1, added: 1, trimmed: 0, sold_out: 1, unchanged: 0 },
  funds: [
    {
      slug: 'tci', name: 'Chris Hohn', firm: 'TCI Fund Management', followed: true, kind: 'new',
      shares: 1_200_000, previous_shares: null, change_pct: null, value: 61_000_000, weight: 2.4, previous_weight: null,
    },
    {
      slug: 'pershing-square', name: 'Bill Ackman', firm: 'Pershing Square', followed: false, kind: 'added',
      shares: 300, previous_shares: 200, change_pct: 50, value: 15_000_000, weight: 1.1, previous_weight: 0.8,
    },
    {
      slug: 'baupost', name: 'Seth Klarman', firm: 'Baupost Group', followed: false, kind: 'sold_out',
      shares: 0, previous_shares: 900, change_pct: -100, value: 0, weight: 0, previous_weight: 3.2,
    },
  ],
}

const show = (props = {}) => renderWithProviders(<FundsTab symbol="NBIS" currency="USD" {...props} />)

describe('FundsTab', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    queries.useOwnership.mockReturnValue({ ...idle, data: OWNERSHIP })
  })

  it('leads with owners and the four move counts for the named quarter', () => {
    show()

    expect(queries.useOwnership).toHaveBeenCalledWith('NBIS')
    expect(screen.getByText('2 of 88')).toBeInTheDocument()
    expect(screen.getByText(/As of Q2 2026 quarter end, filed up to 45 days later/)).toBeInTheDocument()
    expect(screen.getByText(/8 of 88 funds have not filed it yet/)).toBeInTheDocument()
  })

  it('lists each fund with its move, linked to its profile', () => {
    show()

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(within(rows[0]).getByRole('link', { name: 'Chris Hohn' })).toHaveAttribute('href', '/investors/tci')
    expect(within(rows[0]).getByText('New')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Following')).toBeInTheDocument()
    expect(within(rows[1]).getByText('▲ Added 50%')).toBeInTheDocument()
    expect(within(rows[1]).queryByText('Following')).not.toBeInTheDocument()
  })

  it('shows what a sold-out fund used to hold instead of a zero weight', () => {
    show()

    const exited = screen.getAllByRole('row')[3]
    expect(within(exited).getByText('Sold out')).toBeInTheDocument()
    expect(within(exited).getByText('was 3.2%')).toBeInTheDocument()
  })

  it('does not ask about an instrument quoted outside the US', () => {
    show({ symbol: 'ASML', currency: 'EUR' })

    expect(queries.useOwnership).toHaveBeenCalledWith(null)
    expect(screen.getByText('13F filings cover US-listed securities only.')).toBeInTheDocument()
  })

  it('tells an unknown stock apart from one nobody held this quarter', () => {
    queries.useOwnership.mockReturnValue({ ...idle, data: { ...OWNERSHIP, stock: null, funds: [] } })
    const { unmount } = show()
    expect(screen.getByText('No tracked fund has reported NBIS')).toBeInTheDocument()
    unmount()

    queries.useOwnership.mockReturnValue({
      ...idle,
      data: { ...OWNERSHIP, stock: { owners: 0, new: 0, added: 0, trimmed: 0, sold_out: 0, unchanged: 0 }, funds: [] },
    })
    show()
    expect(screen.getByText('No tracked fund reported NBIS in Q2 2026')).toBeInTheDocument()
  })

  it('says so when no filings are stored at all', () => {
    queries.useOwnership.mockReturnValue({ ...idle, data: { quarter: null, filed: 0, tracked: 0, stock: null, funds: [] } })
    show()
    expect(screen.getByText('No 13F filings imported yet')).toBeInTheDocument()
  })

  it('shows a loading state while the lookup is in flight', () => {
    queries.useOwnership.mockReturnValue({ ...idle, isLoading: true })
    show()
    expect(screen.getByRole('status', { name: 'Loading tracked funds' })).toBeInTheDocument()
  })
})
