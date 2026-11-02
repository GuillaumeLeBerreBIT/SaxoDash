import { describe, expect, it, vi } from 'vitest'
import { expectValidHeadingOutline } from '../test/headingOutline'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import DiscoverShelf from './DiscoverShelf'

const shelf = {
  key: 'profitable-below-200d',
  title: 'Profitable & below 200-day average',
  subtitle: 'ROE ≥ 15% · Net margin ≥ 10%',
  order: 'Ordered by market cap, highest first',
  total: 1,
  as_of: '2026-10-04T07:00:00Z',
  items: [{
    ticker: 'FICO', name: 'Fair Isaac', uic: 42, asset_type: 'Stock', last_close: 1200, change_1d: -0.5,
    reasons: [
      { field: 'roe', label: 'ROE', value: 120, format: 'pct' },
      { field: 'pct_vs_ma200', label: 'vs 200D', value: -22.04, format: 'signed_pct' },
    ],
  }],
}

let served = shelf
vi.mock('../api/queries', () => ({ useDiscoverShelf: () => ({ data: served, isLoading: false, error: null }) }))
const toggleList = vi.fn()
vi.mock('../components/research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [{ id: 1, name: 'Ideas', items: [] }], toggleList }),
}))

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/discover/profitable-below-200d']}>
      <Routes>
        <Route path="/discover/:key" element={<DiscoverShelf />} />
        <Route path="/research" element={<p>Research page</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('DiscoverShelf', () => {
  it('has exactly one h1 and no skipped heading level', () => {
    const { container } = renderPage()
    expectValidHeadingOutline(container)
  })

  it('states the count, the criteria and the order', () => {
    renderPage()
    expect(screen.getByText('1 stock · ROE ≥ 15% · Net margin ≥ 10% · Ordered by market cap, highest first')).toBeInTheDocument()
  })

  it('leads back to Discover above the title', () => {
    renderPage()
    expect(screen.getByRole('link', { name: '← Discover' })).toHaveAttribute('href', '/discover')
  })

  it('says how many stocks match and how fresh the data is', () => {
    renderPage()
    expect(screen.getByText(/1 stock/)).toBeInTheDocument()
    expect(screen.getByText(/^Updated /)).toBeInTheDocument()
  })

  it('reads why a stock is here from the left', () => {
    renderPage()
    expect(screen.getByRole('columnheader', { name: 'Why it is here' })).not.toHaveClass('text-right')
  })

  it('gives the row actions a finger-sized target on phones', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Open FICO chart' })).toHaveClass('w-10', 'h-10')
  })

  it('shows every reason for each stock', () => {
    renderPage()
    expect(screen.getByText('ROE 120% · vs 200D -22.0%')).toBeInTheDocument()
  })

  it('opens Research on the overview from the stock', () => {
    renderPage()
    expect(screen.getByRole('link', { name: /^FICO/ })).toHaveAttribute(
      'href',
      '/research?symbol=FICO&tab=overview&uic=42&assetType=Stock',
    )
  })

  it('offers the chart as a separate action', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Open FICO chart' })).toHaveAttribute(
      'href',
      '/boards?symbol=FICO&uic=42&assetType=Stock',
    )
  })

  it('adds a stock to a watchlist without leaving the page', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Add FICO to a list' }))
    await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Ideas/ }))
    expect(toggleList).toHaveBeenCalledWith({ id: 1, name: 'Ideas', items: [] })
    expect(screen.queryByText('Research page')).not.toBeInTheDocument()
  })

  it('shelf sector chips filter rows', async () => {
    const stock = (ticker, sector) => ({ ...shelf.items[0], ticker, name: ticker, uic: ticker.charCodeAt(0), sector })
    served = { ...shelf, total: 3, items: [stock('FICO', 'Technology'), stock('MSFT', 'Technology'), stock('JPM', 'Financials')] }
    try {
      renderPage()
      expect(screen.getByRole('button', { name: 'All sectors 3' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Technology 2' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Financials 1' }))
      expect(screen.getByRole('button', { name: 'Financials 1' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('link', { name: /^JPM/ })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /^FICO/ })).toBeNull()
      await userEvent.click(screen.getByRole('button', { name: 'All sectors 3' }))
      expect(screen.getByRole('link', { name: /^FICO/ })).toBeInTheDocument()
    } finally {
      served = shelf
    }
  })

  it('offers no sector chips when no stock names a sector', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: /All sectors/ })).toBeNull()
  })

  it('titles the page with the shelf name as the one h1', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: shelf.title })).toBeInTheDocument()
  })
})
