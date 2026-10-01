import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import DiscoverCard from './DiscoverCard'

vi.mock('../research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const item = {
  ticker: 'AAPL', name: 'Apple Inc.', uic: 211, asset_type: 'Stock',
  last_close: 230.5, change_1d: -1.25, metric_value: 78.4, sparkline: [1, 2, 3],
}

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <DiscoverCard item={item} metric="rsi14" {...props} />
    </MemoryRouter>,
  )

describe('DiscoverCard', () => {
  it('shows the metric that put the stock on the shelf', () => {
    renderCard()
    expect(screen.getByText('RSI 78')).toBeInTheDocument()
  })

  it('shows the change with its sign, not colour alone', () => {
    renderCard()
    expect(screen.getByText('-1.25%')).toBeInTheDocument()
  })

  it('links to the chart for the exact instrument', () => {
    renderCard()
    expect(screen.getByRole('link', { name: /AAPL/ })).toHaveAttribute(
      'href',
      '/research/chart?symbol=AAPL&uic=211&assetType=Stock',
    )
  })
})
