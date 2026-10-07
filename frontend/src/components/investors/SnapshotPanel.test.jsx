import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import SnapshotPanel from './SnapshotPanel'

let state
vi.mock('../../api/queries', () => ({ useInvestor: () => state }))

const detail = {
  slug: 'scion-asset-management', name: 'Michael Burry', firm: 'Scion Asset Management', stale: true,
  quarter: '2025-09-30', previous_quarter: '2025-06-30', filed_on: '2025-11-14', total_value: 920000000, positions: 2,
  top10_weight: 100, new_count: 2, exited_count: 3, turnover: 74, import: null,
  holdings: [
    { cusip: 'A', ticker: 'PLTR', issuer: 'PALANTIR', put_call: 'PUT', shares: 1, value: 600000000, weight: 65.2, change: 'new', shares_change_pct: null, quarters_held: 1, owned: false, watched: false },
    { cusip: 'B', ticker: 'NVDA', issuer: 'NVIDIA', put_call: 'PUT', shares: 1, value: 320000000, weight: 34.8, change: 'new', shares_change_pct: null, quarters_held: 1, owned: true, watched: false },
  ],
}

const renderPanel = () => render(<MemoryRouter><SnapshotPanel slug="scion-asset-management" /></MemoryRouter>)

describe('SnapshotPanel', () => {
  it('heads the snapshot and says a stopped filer stopped', () => {
    state = { data: detail, isLoading: false, error: null }
    renderPanel()
    expect(screen.getByRole('heading', { name: 'Michael Burry' })).toBeInTheDocument()
    expect(screen.getByText('Scion Asset Management · Q3 2025')).toBeInTheDocument()
    expect(screen.getByText('No 13F since Q3 2025')).toBeInTheDocument()
    expect(screen.getByText('$920M')).toBeInTheDocument()
  })

  it('shows import progress while a backfill runs', () => {
    state = { data: { ...detail, import: { quarters_imported: 3, quarters_expected: 19, cusips_resolved: 40, cusips_seen: 90 } }, isLoading: false, error: null }
    renderPanel()
    expect(screen.getByText('Importing history · 3 of 19 quarters · tickers 40/90')).toBeInTheDocument()
  })

  it('explains an investor with nothing imported', () => {
    state = { data: { ...detail, quarter: null, holdings: [], quarters: [] }, isLoading: false, error: null }
    renderPanel()
    expect(screen.getByText('Nothing imported for Michael Burry yet')).toBeInTheDocument()
  })

  it('reports a failed load', () => {
    state = { data: undefined, isLoading: false, error: new Error('boom') }
    renderPanel()
    expect(screen.getByText(/Could not load this investor/)).toBeInTheDocument()
  })

  it('offers Retry on a failed load', () => {
    const refetch = vi.fn()
    state = { data: undefined, isLoading: false, error: new Error('boom'), refetch }
    renderPanel()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })
})
