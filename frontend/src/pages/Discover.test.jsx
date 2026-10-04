import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Discover from './Discover'

const useDiscover = vi.fn()
const startScan = { mutate: vi.fn(), error: null }
vi.mock('../api/queries', () => ({ useDiscover: () => useDiscover(), useStartDiscoverScan: () => startScan }))
vi.mock('../components/research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const shelf = (key, title, total, items = [], empty = 'No stocks match these criteria in the last session.') => ({
  key, title, subtitle: 'RSI 14 ≥ 70', order: 'Ordered by RSI 14, highest first', empty, total, items,
})
const card = {
  ticker: 'NVDA', name: 'NVIDIA', uic: 1, asset_type: 'Stock', last_close: 100, change_1d: 1, sparkline: [],
  reasons: [{ field: 'rsi14', label: 'RSI', value: 81, format: 'number' }],
}

const renderPage = () => render(<MemoryRouter><Discover /></MemoryRouter>)

describe('Discover page', () => {
  beforeEach(() => {
    startScan.mutate.mockClear()
    startScan.error = null
  })

  it('keeps the updated label current while the page stays open', () => {
    vi.useFakeTimers({ now: new Date('2026-10-04T08:00:30Z') })
    try {
      useDiscover.mockReturnValue({ data: { as_of: '2026-10-04T08:00:00Z', health: { state: 'ok', last_ok_at: '2026-10-04T08:00:00Z', progress: null }, shelves: [] } })
      renderPage()
      expect(screen.getByText('Updated just now')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(5 * 60_000))
      expect(screen.getByText('Updated 5 min ago')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('says what a refresh does before it is started', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-10-04T08:00:00Z', health: { state: 'ok', progress: null }, shelves: [] } })
    renderPage()
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('title', expect.stringMatching(/several minutes/))
  })

  it('loads with shelf-shaped placeholders', () => {
    useDiscover.mockReturnValue({ data: undefined, isLoading: true })
    renderPage()
    expect(screen.getAllByTestId('shelf-skeleton')).toHaveLength(3)
  })

  it('renders each shelf with its criteria, count and a See all link', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, shelves: [shelf('overbought', 'Overbought', 7, [card])] } })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Overbought' })).toBeInTheDocument()
    expect(screen.getByText(/RSI 14/)).toBeInTheDocument()
    expect(screen.getByText('7 stocks')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See all 7' })).toHaveAttribute('href', '/discover/overbought')
  })

  it('explains the order and that a lens is not a recommendation', async () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, shelves: [shelf('overbought', 'Overbought', 7, [card])] } })
    renderPage()
    fireEvent.focus(screen.getByRole('button', { name: 'About Overbought' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Ordered by RSI 14, highest first. Showing the first 1 of 7. A filter on the last scan, not a recommendation.',
    )
  })

  it('collapses an empty shelf to a quiet note', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, shelves: [shelf('above-moving-averages', 'Above 50- & 200-day averages', 0)] } })
    renderPage()
    expect(screen.getByText('No stocks match these criteria in the last session.')).toBeInTheDocument()
    expect(screen.getByText('0 stocks')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument()
  })

  it('warns when the scan failed', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-28T22:40:00Z', health: { state: 'failed' }, shelves: [] } })
    renderPage()
    expect(screen.getByText(/The last scan failed/)).toBeInTheDocument()
  })

  it('explains the first scan when none has run', () => {
    useDiscover.mockReturnValue({ data: { as_of: null, health: { state: 'never' }, shelves: [shelf('oversold', 'Oversold', 0)] } })
    renderPage()
    expect(screen.getByText(/manage\.py scan_universe/)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Oversold' })).not.toBeInTheDocument()
  })

  it('starts the first scan when there has never been one', () => {
    useDiscover.mockReturnValue({ data: { as_of: null, health: { state: 'never', progress: null }, shelves: [] } })
    renderPage()
    expect(startScan.mutate).toHaveBeenCalledTimes(1)
  })

  it('does not start a scan once one has run', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok', progress: null }, shelves: [] } })
    renderPage()
    expect(startScan.mutate).not.toHaveBeenCalled()
  })

  it('asks for Saxo when the first scan cannot start without it', () => {
    startScan.error = Object.assign(new Error('Saxo is not connected.'), { status: 409 })
    useDiscover.mockReturnValue({ data: { as_of: null, health: { state: 'never', progress: null }, shelves: [] } })
    renderPage()
    expect(screen.getByText(/Connect Saxo to run the first scan/)).toBeInTheDocument()
  })

  it('says when the data was last updated and refreshes on request', () => {
    const lastOk = new Date(Date.now() - 50 * 3_600_000).toISOString()
    useDiscover.mockReturnValue({ data: { as_of: lastOk, health: { state: 'ok', last_ok_at: lastOk, progress: null }, shelves: [] } })
    renderPage()
    expect(screen.getByText('Updated 2 days ago')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(startScan.mutate).toHaveBeenCalledTimes(1)
  })

  it('cannot start a second scan while one runs', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-10-01T17:28:00Z', health: { state: 'ok', last_ok_at: '2026-10-01T17:28:00Z', progress: { done: 10, total: 518 } }, shelves: [] } })
    renderPage()
    expect(screen.getByRole('button', { name: 'Scanning…' })).toBeDisabled()
  })

  it('asks for Saxo when a refresh cannot start without it', () => {
    startScan.error = Object.assign(new Error('Saxo is not connected.'), { status: 409 })
    useDiscover.mockReturnValue({ data: { as_of: '2026-10-01T17:28:00Z', health: { state: 'ok', progress: null }, shelves: [] } })
    renderPage()
    expect(screen.getByText('Connect Saxo to refresh.')).toBeInTheDocument()
  })

  it('holds the shelves back and shows progress while the first scan runs', () => {
    useDiscover.mockReturnValue({ data: { as_of: null, health: { state: 'scanning', progress: { done: 144, total: 518 } }, shelves: [shelf('oversold', 'Oversold', 0)] } })
    renderPage()
    expect(screen.getByRole('progressbar', { name: 'Scanning stocks · 144 of 518' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Oversold' })).not.toBeInTheDocument()
  })

  it('keeps last night’s shelves on screen while a rescan runs', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok', progress: { done: 10, total: 518 } }, shelves: [shelf('overbought', 'Overbought', 1, [card])] } })
    renderPage()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10')
    expect(screen.getByRole('heading', { name: 'Overbought' })).toBeInTheDocument()
  })
})
