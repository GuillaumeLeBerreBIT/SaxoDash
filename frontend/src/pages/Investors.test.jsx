import { describe, expect, it, vi, beforeEach } from 'vitest'
import { expectValidHeadingOutline } from '../test/headingOutline'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import Investors from './Investors'

const card = (over) => ({
  slug: 's', name: 'N', firm: 'F', curated: true, stale: false, import: null, latest_quarter: '2026-06-30',
  last_filing_at: '2026-08-14', total_value: 1e9, positions: 10, top10_weight: 90, new_count: 1, exited_count: 0,
  top_holdings: [{ cusip: 'C', ticker: 'AAPL', issuer: 'APPLE', weight: 20 }], ...over,
})
const cards = [
  card({ slug: 'berkshire-hathaway', name: 'Warren Buffett', firm: 'Berkshire Hathaway', total_value: 299e9 }),
  card({ slug: 'scion-asset-management', name: 'Michael Burry', firm: 'Scion Asset Management', stale: true, latest_quarter: '2025-09-30', total_value: 0.9e9 }),
  ...Array.from({ length: 8 }, (_, i) => card({ slug: `fund-${i}`, name: `Manager ${i}`, firm: `Fund ${i}`, total_value: (i + 1) * 1e9 })),
]

let holders
let listed
const useInvestors = vi.hoisted(() => vi.fn())
vi.mock('../api/queries', () => ({ useInvestors }))
vi.mock('../components/investors/SnapshotPanel', () => ({
  default: ({ slug }) => <p>Snapshot of {slug}</p>,
  ImportProgress: () => null,
}))

const renderPage = (route = '/investors') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/investors" element={<Investors />} /></Routes>
    </MemoryRouter>,
  )

describe('Investors', () => {
  beforeEach(() => {
    holders = []
    listed = cards
    useInvestors.mockReset()
    useInvestors.mockImplementation(({ holds } = {}) => (holds ? { data: holders, isLoading: false } : { data: listed, isLoading: false, error: null }))
  })

  it('has exactly one h1 and no skipped heading level', () => {
    const { container } = renderPage()
    expectValidHeadingOutline(container)
  })

  it('states how many managers are tracked, the latest quarter and the lag', () => {
    renderPage()
    expect(screen.getByText('13F holdings of 10 tracked managers · latest quarter Q2 2026 · filings arrive up to 45 days after quarter end')).toBeInTheDocument()
  })

  it('writes a zero exit count without a sign', () => {
    renderPage()
    expect(screen.getAllByText('+1 new · 0 exited').length).toBeGreaterThan(0)
  })

  it('shows the first 8 cards by value, then offers the rest', () => {
    renderPage()
    expect(screen.getAllByTestId('investor-card')).toHaveLength(8)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 10' }))
    expect(screen.getAllByTestId('investor-card')).toHaveLength(10)
  })

  it('picks Berkshire by default and another investor on click', () => {
    renderPage()
    expect(screen.getByText('Snapshot of berkshire-hathaway')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Manager 7/ }))
    expect(screen.getByText('Snapshot of fund-7')).toBeInTheDocument()
  })

  it('keeps only stopped filers and says when they stopped', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Stopped filing' }))
    expect(screen.getAllByTestId('investor-card')).toHaveLength(1)
    expect(screen.getByText('No 13F since Q3 2025')).toBeInTheDocument()
  })

  it('searches by investor or firm and shows every match', () => {
    renderPage()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search investors' }), { target: { value: 'fund' } })
    expect(screen.getAllByTestId('investor-card')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('explains an empty search', () => {
    renderPage()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search investors' }), { target: { value: 'zzzz zzzz' } })
    expect(screen.getByText('No tracked investor matches “zzzz zzzz”.')).toBeInTheDocument()
  })

  it('holds the empty state back while a ticker search is still resolving', () => {
    vi.useFakeTimers()
    try {
      renderPage()
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search investors' }), { target: { value: 'zzz' } })
      expect(screen.queryByText(/No tracked investor matches/)).toBeNull()
      act(() => { vi.advanceTimersByTime(400) })
      expect(screen.getByText('No tracked investor matches “zzz”.')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('switches to a table with the top-10 share column', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Top 10' })).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(11)
  })

  it('sorts by name', () => {
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort investors' }), { target: { value: 'name' } })
    expect(within(screen.getAllByTestId('investor-card')[0]).getByText('Manager 0')).toBeInTheDocument()
  })

  it('picks an investor from the table with the keyboard-reachable button', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /Manager 7/ }))
    expect(screen.getByText('Snapshot of fund-7')).toBeInTheDocument()
  })

  it('includes investors holding a searched ticker', () => {
    vi.useFakeTimers()
    try {
      holders = [{ slug: 'scion-asset-management' }]
      renderPage()
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search investors' }), { target: { value: 'aapl' } })
      act(() => { vi.advanceTimersByTime(400) })
      expect(useInvestors).toHaveBeenCalledWith({ holds: 'AAPL' })
      expect(screen.getByText('Michael Burry')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('says the group is empty when a filter, not a search, matches nobody', () => {
    listed = cards.map((c) => ({ ...c, stale: false }))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Stopped filing' }))
    expect(screen.getByText('No investors in this group.')).toBeInTheDocument()
  })

  it('states the 13F limits', () => {
    renderPage()
    expect(screen.getByText(/US-listed long positions and listed options/)).toBeInTheDocument()
  })

  it('offers Retry when the investors fail to load', () => {
    const refetch = vi.fn()
    useInvestors.mockImplementation(() => ({ data: undefined, isLoading: false, error: new Error('boom'), refetch }))
    renderPage()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })
})
