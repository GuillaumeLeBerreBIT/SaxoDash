import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import ChangesTab from './ChangesTab'

let state
vi.mock('../../api/queries', () => ({ useInvestorChanges: () => state }))

const item = (over) => ({
  cusip: 'C', put_call: '', ticker: 'AAPL', issuer: 'APPLE INC', shares: 110, previous_shares: 100, shares_change_pct: 10,
  value: 700, previous_value: 600, value_change: 100, weight: 70, previous_weight: 54.55, ...over,
})

describe('ChangesTab', () => {
  it('groups changes with counts, value changes and share moves', () => {
    state = {
      isLoading: false, error: null,
      data: {
        quarter: '2026-06-30', previous_quarter: '2026-03-31',
        new: [item({ cusip: 'N', ticker: 'NVDA', previous_shares: null, shares_change_pct: null, previous_value: null, value_change: 200_000_000, weight: 20 })],
        added: [item({ value_change: 100_000_000 })],
        trimmed: [],
        sold_out: [item({ cusip: 'S', ticker: null, issuer: 'ALLY FINL INC', shares: null, value: null, value_change: -400_000_000, weight: null, previous_weight: 36.36, shares_change_pct: -100 })],
      },
    }
    render(<ChangesTab slug="berkshire-hathaway" />)
    const added = screen.getByRole('region', { name: 'Added' })
    expect(within(added).getByText('1')).toBeInTheDocument()
    expect(within(added).getByText('+$100M')).toBeInTheDocument()
    expect(within(added).getByText('shares ▲10%')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'New' })).getByText('20.0% of portfolio')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Sold out' })).getByText('ALLY FINL INC')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Sold out' })).getByText('was 36.4%')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Trimmed' })).getByText('None')).toBeInTheDocument()
  })

  it('explains a first stored quarter', () => {
    state = { isLoading: false, error: null, data: { quarter: '2021-12-31', previous_quarter: null, new: [], added: [], trimmed: [], sold_out: [] } }
    render(<ChangesTab slug="berkshire-hathaway" />)
    expect(screen.getByText('First stored quarter — there is no earlier filing to compare against.')).toBeInTheDocument()
  })

  it('offers Retry on a failed load', () => {
    const refetch = vi.fn()
    state = { data: undefined, isLoading: false, error: new Error('boom'), refetch }
    render(<ChangesTab slug="s" quarter="2026-06-30" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })
})
