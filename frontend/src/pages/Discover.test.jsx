import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Discover from './Discover'

const useDiscover = vi.fn()
vi.mock('../api/queries', () => ({ useDiscover: () => useDiscover() }))
vi.mock('../components/research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const shelf = (key, title, total, items = []) => ({
  key, title, subtitle: `${title} rule`, metric: 'rsi14', total, items,
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
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-30T22:40:00Z', health: { state: 'ok' }, shelves: [shelf('oversold', 'Oversold', 0)] } })
    renderPage()
    expect(screen.getByText('Nothing oversold today')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument()
  })

  it('warns when the scan failed', () => {
    useDiscover.mockReturnValue({ data: { as_of: '2026-09-28T22:40:00Z', health: { state: 'failed' }, shelves: [] } })
    renderPage()
    expect(screen.getByText(/The last scan failed/)).toBeInTheDocument()
  })

  it('explains the first scan when none has run', () => {
    useDiscover.mockReturnValue({ data: { as_of: null, health: { state: 'never' }, shelves: [] } })
    renderPage()
    expect(screen.getByText(/manage\.py scan_universe/)).toBeInTheDocument()
  })
})
