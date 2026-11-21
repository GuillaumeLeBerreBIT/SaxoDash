import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectValidHeadingOutline } from '../test/headingOutline'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Discover from './Discover'

const useDiscover = vi.fn()
const mockBrowse = vi.fn()
const useInvestorHub = vi.fn()
const startScan = { mutate: vi.fn(), error: null }
vi.mock('../api/queries', () => ({
  useDiscover: () => useDiscover(),
  useStartDiscoverScan: () => startScan,
  useExplorerPages: (queries) => queries.map((query) => mockBrowse(query)),
  useInvestorHub: () => useInvestorHub(),
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

const renderPage = (path = '/discover') => render(<MemoryRouter initialEntries={[path]}><Discover /></MemoryRouter>)

const stock = (ticker, extra = {}) => ({
  ticker, name: `${ticker} Corp`, uic: 1, sector: 'Health Care', quality: 'strong', valuation: 'cheap', action: 'buy',
  last_close: 50, cheap_below: 100, expensive_above: 150, discount_pct: 50, below_high_pct: 40, spark: [60, 55, 50],
  checks_passed: 6, checks_answered: 7, failed_checks: ['Debt'], held: false, ...extra,
})
const answer = (stocks, total = stocks.length) => ({ data: { total, stocks, facets: { valuation: { cheap: 3, fair: 2 }, quality: { strong: 4 }, sector: { 'Health Care': 5 } } }, isSuccess: true })
const queries = () => mockBrowse.mock.calls.map(([query]) => query)

describe('Discover page', () => {
  beforeEach(() => {
    startScan.mutate.mockClear()
    startScan.error = null
    mockBrowse.mockReset()
    mockBrowse.mockReturnValue(answer([]))
    useInvestorHub.mockReturnValue({ data: { shelves: [] } })
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

  it('opens on all stocks and switches presentation with the same data', () => {
    useDiscover.mockReturnValue({ data: { health: { state: 'ok' }, shelves: [], groups } })
    mockBrowse.mockReturnValue(answer([stock('ZTS')]))
    renderPage()
    expect(screen.getByTestId('stock-card')).toHaveTextContent('ZTS')
    expect(screen.getByRole('button', { name: 'All stocks' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(within(screen.getByRole('table')).getByRole('link', { name: /ZTS/ })).toBeInTheDocument()
    expect(new Set(queries()).size).toBe(1)
  })

  it('loads past row 60 and retains the query when switching layouts', () => {
    useDiscover.mockReturnValue({ data: { health: { state: 'ok' }, shelves: [], groups } })
    mockBrowse.mockImplementation((query) => {
      const offset = Number(new URLSearchParams(query).get('offset'))
      return answer(Array.from({ length: Math.min(24, 65 - offset) }, (_, i) => stock('T' + (offset + i))), 65)
    })
    renderPage('/discover?q=T')
    fireEvent.click(screen.getByRole('button', { name: /Show .*more/ }))
    fireEvent.click(screen.getByRole('button', { name: /Show .*more/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('link', { name: /T64/ })).toBeInTheDocument()
    expect(queries().every((query) => new URLSearchParams(query).get('q') === 'T')).toBe(true)
  })

  it('keeps the first page visible while retrying the next page', () => {
    const retry = vi.fn()
    useDiscover.mockReturnValue({ data: { health: { state: 'ok' }, groups, shelves: [] } })
    mockBrowse.mockImplementation((query) => query.includes('offset=24')
      ? { error: new Error('Page unavailable'), refetch: retry }
      : answer([stock('ZTS')], 25))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }))
    expect(screen.getByTestId('stock-card')).toHaveTextContent('ZTS')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('combines a saved screen with existing filters', () => {
    useDiscover.mockReturnValue({ data: { health: { state: 'ok' }, shelves: [], groups } })
    renderPage('/discover?screen=saved&sector=Energy')
    expect(queries().some((query) => query.includes('screen=saved') && query.includes('sector=Energy'))).toBe(true)
    expect(screen.getByRole('button', { name: 'All stocks' })).toBeInTheDocument()
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
    expect(screen.getAllByRole('option', { name: 'Overbought', hidden: true }).length).toBeGreaterThan(0)
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
