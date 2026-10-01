import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Discover from './Discover'

const useDiscover = vi.fn()
vi.mock('../api/queries', () => ({ useDiscover: () => useDiscover() }))
vi.mock('../components/research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const shelf = (key, title, total, items = [], empty = `Nothing ${title.toLowerCase()} today`) => ({
  key, title, subtitle: `${title} rule`, empty, metric: 'rsi14', total, items,
})
const card = { ticker: 'NVDA', name: 'NVIDIA', uic: 1, asset_type: 'Stock', last_close: 100, change_1d: 1, metric_value: 81, sparkline: [] }

const renderPage = () => render(<MemoryRouter><Discover /></MemoryRouter>)

describe('Discover page', () => {
  it('renders each shelf with a See all link', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, shelves: [shelf('overbought', 'Overbought', 1, [card])] } })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Overbought' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /See all \(1\)/ })).toHaveAttribute('href', '/discover/overbought')
  })

  it('collapses an empty shelf to a quiet note', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, shelves: [shelf('strong-trend', 'Strong trend', 0, [], 'No strong trends today')] } })
    renderPage()
    expect(screen.getByText('No strong trends today')).toBeInTheDocument()
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

  it('holds the shelves back while the first scan is still running', () => {
    useDiscover.mockReturnValue({ data: { as_of: null, health: { state: 'scanning', scanned: 144, total: 518 }, shelves: [shelf('oversold', 'Oversold', 0)] } })
    renderPage()
    expect(screen.getByText(/First scan in progress: 144 of 518/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Oversold' })).not.toBeInTheDocument()
  })
})
