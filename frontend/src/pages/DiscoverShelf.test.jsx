import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import DiscoverShelf from './DiscoverShelf'

const shelf = {
  key: 'profitable-below-200d',
  title: 'Profitable & below 200-day average',
  subtitle: 'ROE ≥ 15% · Net margin ≥ 10%',
  order: 'Ordered by market cap, highest first',
  total: 1,
  items: [{
    ticker: 'FICO', name: 'Fair Isaac', uic: 42, asset_type: 'Stock', last_close: 1200, change_1d: -0.5,
    reasons: [
      { field: 'roe', label: 'ROE', value: 120, format: 'pct' },
      { field: 'pct_vs_ma200', label: 'vs 200D', value: -22.04, format: 'signed_pct' },
    ],
  }],
}

vi.mock('../api/queries', () => ({ useDiscoverShelf: () => ({ data: shelf, isLoading: false, error: null }) }))
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
  it('states the criteria and the order', () => {
    renderPage()
    expect(screen.getByText('ROE ≥ 15% · Net margin ≥ 10% · Ordered by market cap, highest first')).toBeInTheDocument()
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
      '/research/chart?symbol=FICO&uic=42&assetType=Stock',
    )
  })

  it('adds a stock to a watchlist without leaving the page', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add FICO to a list' }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /Ideas/ }))
    expect(toggleList).toHaveBeenCalledWith({ id: 1, name: 'Ideas', items: [] })
    expect(screen.queryByText('Research page')).not.toBeInTheDocument()
  })
})
