import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectValidHeadingOutline } from '../test/headingOutline'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Discover from './Discover'

const useDiscover = vi.fn()
const useWorthALook = vi.fn()
const startScan = { mutate: vi.fn(), error: null }
vi.mock('../api/queries', () => ({
  useDiscover: () => useDiscover(),
  useStartDiscoverScan: () => startScan,
  useWorthALook: () => useWorthALook(),
}))
vi.mock('../components/research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const shelf = (key, title, total, items = [], empty = 'No stocks match these criteria in the last session.', group = 'price') => ({
  key, title, subtitle: 'RSI 14 ≥ 70', order: 'Ordered by RSI 14, highest first', empty, total, items, group, short: title,
})
const groups = [{ key: 'price', title: 'Price action' }, { key: 'fundamentals', title: 'Fundamentals' }]
const card = {
  ticker: 'NVDA', name: 'NVIDIA', uic: 1, asset_type: 'Stock', last_close: 100, change_1d: 1, sparkline: [],
  reasons: [{ field: 'rsi14', label: 'RSI', value: 81, format: 'number' }],
}

const renderPage = () => render(<MemoryRouter><Discover /></MemoryRouter>)

describe('Discover page', () => {
  beforeEach(() => {
    startScan.mutate.mockClear()
    startScan.error = null
    useWorthALook.mockReturnValue({ data: { total: 0, stocks: [] } })
  })

  it('has exactly one h1 and no skipped heading level', () => {
    useDiscover.mockReturnValue({ data: {
      as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' },
      groups: [{ key: 'price', title: 'Price action' }, { key: 'fundamentals', title: 'Fundamentals' }],
      shelves: [shelf('overbought', 'Overbought', 1, [card]), shelf('pe-under-15', 'P/E under 15', 1, [card], undefined, 'fundamentals')],
    } })
    const { container } = renderPage()
    expectValidHeadingOutline(container)
  })

  it('keeps the updated label current while the page stays open', () => {
    vi.useFakeTimers({ now: new Date('2026-10-04T08:00:30Z') })
    try {
      useDiscover.mockReturnValue({ data: { as_of: '2026-10-04T08:00:00Z', health: { state: 'ok', last_ok_at: '2026-10-04T08:00:00Z', progress: null }, groups, shelves: [] } })
      renderPage()
      expect(screen.getByText('Updated just now')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(5 * 60_000))
      expect(screen.getByText('Updated 5 min ago')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('says what a refresh does before it is started', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-10-04T08:00:00Z', health: { state: 'ok', progress: null }, groups, shelves: [] } })
    renderPage()
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveAttribute('title', expect.stringMatching(/several minutes/))
  })

  it('leads with the stocks graded strong and cheap, one plain line each', () => {
    useWorthALook.mockReturnValue({ data: { total: 14, stocks: [
      { ticker: 'ADBE', name: 'Adobe', action: 'buy', last_close: 320, cheap_below: 400, discount_pct: 20 },
      { ticker: 'MSFT', name: 'Microsoft', action: 'hold', capped: true, last_close: 380, cheap_below: 400, discount_pct: 5 },
    ] } })
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [shelf('overbought', 'Overbought', 7, [card])] } })
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Worth a look today', 'Browse by idea'])
    const rows = within(screen.getByRole('list', { name: 'Worth a look today' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('ADBE')
    expect(rows[0]).toHaveTextContent('US$320.00, 20% under the US$400.00 where it stops being cheap')
    expect(rows[0]).toHaveTextContent('Opportunity')
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/research?symbol=ADBE')
    expect(rows[1]).toHaveTextContent('Hold · over cap')
    expect(screen.getByText('Showing 2 of 14, furthest under its cheap price first.')).toBeInTheDocument()
  })

  it('says so when nothing is both strong and cheap', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [] } })
    renderPage()
    expect(screen.getByText('Nothing is both strong and cheap today')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Ideas' })).toBeNull()
  })

  it('shows one idea at a time, starting with the first that has stocks', () => {
    useDiscover.mockReturnValue({ data: {
      as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups,
      shelves: [shelf('oversold', 'Oversold', 0), shelf('overbought', 'Overbought', 7, [card]), shelf('pe-under-15', 'P/E under 15', 3, [card], undefined, 'fundamentals')],
    } })
    renderPage()
    const ideas = screen.getByRole('group', { name: 'Ideas' })
    expect(within(ideas).getByRole('button', { name: 'Overbought 7' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Overbought'])
    fireEvent.click(within(ideas).getByRole('button', { name: 'P/E under 15 3' }))
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['P/E under 15'])
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull()
  })

  it('loads with shelf-shaped placeholders', () => {
    useDiscover.mockReturnValue({ data: undefined, isLoading: true })
    renderPage()
    expect(screen.getAllByTestId('shelf-skeleton')).toHaveLength(3)
  })

  it('renders each shelf with its criteria, count and a See all link', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [shelf('overbought', 'Overbought', 7, [card])] } })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Overbought' })).toBeInTheDocument()
    expect(screen.getByText(/RSI 14/)).toBeInTheDocument()
    expect(screen.getByText('7 stocks')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See all 7' })).toHaveAttribute('href', '/discover/overbought')
  })

  it('shows an earnings date on a reporting idea', () => {
    const reporting = { ...card, reasons: [{ field: 'next_earnings_date', label: 'Reports', value: '2026-10-08', format: 'date' }] }
    useDiscover.mockReturnValue({ data: {
      as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' },
      groups: [...groups, { key: 'events', title: 'Events' }],
      shelves: [shelf('reporting-soon', 'Reporting soon', 1, [reporting], undefined, 'events')],
    } })
    renderPage()
    expect(screen.getByText('Reports')).toBeInTheDocument()
    expect(screen.getByText('08 Oct')).toBeInTheDocument()
  })

  it('explains the order and that a lens is not a recommendation', async () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [shelf('overbought', 'Overbought', 7, [card])] } })
    renderPage()
    fireEvent.focus(screen.getByRole('button', { name: 'About Overbought' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Ordered by RSI 14, highest first. Showing the first 1 of 7. A filter on the last scan, not a recommendation.',
    )
  })

  it('collapses an empty shelf to a quiet note', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [shelf('above-moving-averages', 'Above 50- & 200-day averages', 0)] } })
    renderPage()
    expect(screen.getByText('No stocks match these criteria in the last session.')).toBeInTheDocument()
    expect(screen.getByText('0 stocks')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument()
  })

  it('warns when the scan failed', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-28T22:40:00Z', health: { state: 'failed' }, groups, shelves: [] } })
    renderPage()
    expect(screen.getByText(/The last scan failed/)).toBeInTheDocument()
  })

  it('explains the first scan when none has run', () => {
    useDiscover.mockReturnValue({ data: { as_of: null, health: { state: 'never' }, groups, shelves: [shelf('oversold', 'Oversold', 0)] } })
    renderPage()
    expect(screen.getByText(/manage\.py scan_universe/)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Oversold' })).not.toBeInTheDocument()
  })

  it('starts the first scan when there has never been one', () => {
    useDiscover.mockReturnValue({ data: { as_of: null, health: { state: 'never', progress: null }, groups, shelves: [] } })
    renderPage()
    expect(startScan.mutate).toHaveBeenCalledTimes(1)
  })

  it('does not start a scan once one has run', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok', progress: null }, groups, shelves: [] } })
    renderPage()
    expect(startScan.mutate).not.toHaveBeenCalled()
  })

  it('asks for Saxo when the first scan cannot start without it', () => {
    startScan.error = Object.assign(new Error('Saxo is not connected.'), { status: 409 })
    useDiscover.mockReturnValue({ data: { as_of: null, health: { state: 'never', progress: null }, groups, shelves: [] } })
    renderPage()
    expect(screen.getByText(/Connect Saxo to run the first scan/)).toBeInTheDocument()
  })

  it('says when the data was last updated and refreshes on request', () => {
    const lastOk = new Date(Date.now() - 50 * 3_600_000).toISOString()
    useDiscover.mockReturnValue({ data: { as_of: lastOk, health: { state: 'ok', last_ok_at: lastOk, progress: null }, groups, shelves: [] } })
    renderPage()
    expect(screen.getByText('Updated 2 days ago')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(startScan.mutate).toHaveBeenCalledTimes(1)
  })

  it('cannot start a second scan while one runs', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-10-01T17:28:00Z', health: { state: 'ok', last_ok_at: '2026-10-01T17:28:00Z', progress: { done: 10, total: 518 } }, groups, shelves: [] } })
    renderPage()
    expect(screen.getByRole('button', { name: 'Scanning…' })).toBeDisabled()
  })

  it('asks for Saxo when a refresh cannot start without it', () => {
    startScan.error = Object.assign(new Error('Saxo is not connected.'), { status: 409 })
    useDiscover.mockReturnValue({ data: { as_of: '2026-10-01T17:28:00Z', health: { state: 'ok', progress: null }, groups, shelves: [] } })
    renderPage()
    expect(screen.getByText('Connect Saxo to refresh.')).toBeInTheDocument()
  })

  it('holds the shelves back and shows progress while the first scan runs', () => {
    useDiscover.mockReturnValue({ data: { as_of: null, health: { state: 'scanning', progress: { done: 144, total: 518 } }, groups, shelves: [shelf('oversold', 'Oversold', 0)] } })
    renderPage()
    expect(screen.getByRole('progressbar', { name: 'Scanning stocks · 144 of 518' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Oversold' })).not.toBeInTheDocument()
  })

  it('keeps last night’s shelves on screen while a rescan runs', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok', progress: { done: 10, total: 518 } }, groups, shelves: [shelf('overbought', 'Overbought', 1, [card])] } })
    renderPage()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10')
    expect(screen.getByRole('heading', { name: 'Overbought' })).toBeInTheDocument()
  })

  it('puts the scan status, the stale reason and Refresh in one panel', () => {
    useDiscover.mockReturnValue({ data: {
      as_of: '2026-10-20T12:00:00Z',
      health: { state: 'stale', last_ok_at: '2026-10-20T12:00:00Z', issue: 'Saxo needs re-authentication', progress: null },
      groups, shelves: [shelf('overbought', 'Overbought', 7, [card])],
    } })
    renderPage()
    const panel = screen.getByRole('region', { name: 'Scan status' })
    expect(within(panel).getByRole('status')).toHaveTextContent('No fresh scan since 20 Oct. Last attempt: Saxo needs re-authentication')
    expect(within(panel).getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })
})
