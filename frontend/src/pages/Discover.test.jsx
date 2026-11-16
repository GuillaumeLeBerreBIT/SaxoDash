import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectValidHeadingOutline } from '../test/headingOutline'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Discover from './Discover'

const useDiscover = vi.fn()
const useBrowse = vi.fn()
const useInvestorHub = vi.fn()
const startScan = { mutate: vi.fn(), error: null }
vi.mock('../api/queries', () => ({
  useDiscover: () => useDiscover(),
  useStartDiscoverScan: () => startScan,
  useBrowse: (query, options) => useBrowse(query, options),
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
const queries = () => useBrowse.mock.calls.map(([query]) => query)

describe('Discover page', () => {
  beforeEach(() => {
    startScan.mutate.mockClear()
    startScan.error = null
    useBrowse.mockReset()
    useBrowse.mockReturnValue(answer([]))
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

  it('opens on rows of stock cards, opportunities first, each saying why it is there', () => {
    useBrowse.mockImplementation((query) => (query.includes('min_fall') ? answer([stock('LULU', { action: 'wait' })], 39) : answer([stock('ZTS'), stock('ADBE')], 50)))
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [shelf('overbought', 'Overbought', 7, [card])] } })
    renderPage()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(["Today's opportunities", 'Fell hard, still strong', 'Browse by idea'])
    const first = within(screen.getByRole('region', { name: "Today's opportunities" })).getAllByTestId('stock-card')[0]
    expect(first).toHaveTextContent('ZTS Corp')
    expect(first).toHaveTextContent('50% below its cheap line')
    expect(first).toHaveTextContent('6 of 7 quality checks pass; debt fails.')
    expect(first).toHaveTextContent('Opportunity')
    expect(within(first).getByRole('link', { name: 'ZTS Corp' })).toHaveAttribute('href', expect.stringContaining('/research?symbol=ZTS'))
    expect(screen.getByRole('link', { name: 'See all 50 →' })).toHaveAttribute('href', expect.stringContaining('valuation=cheap&quality=strong'))
  })

  it('never repeats a stock from the first row in the second', () => {
    useBrowse.mockImplementation(() => answer([stock('ZTS'), stock('ADBE')]))
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [] } })
    renderPage()
    expect(queries().find((query) => query.includes('min_fall'))).toContain('exclude=ZTS%2CADBE')
  })

  it('adds a row for what tracked funds bought, with the fund count on each card', () => {
    useInvestorHub.mockReturnValue({ data: { shelves: [{ key: 'convergent-buys', items: [{ ticker: 'AMZN', bought: 19 }] }] } })
    useBrowse.mockImplementation((query) => (query.includes('tickers=AMZN') ? answer([stock('AMZN', { held: true, action: 'add' })]) : answer([])))
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [] } })
    renderPage()
    const row = screen.getByRole('region', { name: 'Funds are buying' })
    expect(row).toHaveTextContent('19 tracked funds bought it last quarter.')
    expect(row).toHaveTextContent('You own it')
  })

  it('leaves a row out when nothing qualifies', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [] } })
    renderPage()
    expect(screen.queryByRole('region', { name: "Today's opportunities" })).toBeNull()
  })

  it('switches from rows to a filtered grid with a count, and sorts only there', () => {
    useBrowse.mockImplementation(() => answer([stock('ZTS')], 19))
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [] } })
    renderPage('/discover?quality=strong&sector=Health%20Care')
    expect(screen.getByTestId('browse-count')).toHaveTextContent('19 stocks match')
    expect(screen.queryByRole('heading', { name: "Today's opportunities" })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(queries()).toContain('?quality=strong&sector=Health+Care&limit=24')
  })

  it('filters with checkboxes that carry their counts', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [] } })
    renderPage()
    const filters = screen.getByRole('complementary', { name: 'Filters' })
    const cheap = within(filters).getByRole('checkbox', { name: /Cheap/ })
    expect(cheap.closest('label')).toHaveTextContent('Cheap3')
    fireEvent.click(cheap)
    expect(queries()).toContain('?valuation=cheap&limit=24')
  })

  it('offers a clear way out when no stock matches', () => {
    useBrowse.mockReturnValue(answer([], 0))
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, groups, shelves: [] } })
    renderPage('/discover?quality=weak')
    expect(screen.getByText('No stock matches every filter.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.queryByText('No stock matches every filter.')).toBeNull()
    expect(queries()).toContain('?valuation=cheap&quality=strong&limit=4')
  })

  it('shows one idea at a time, starting with the first that has stocks', () => {    useDiscover.mockReturnValue({ data: {
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
