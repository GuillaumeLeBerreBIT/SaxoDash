import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import DiscoverCard from './DiscoverCard'

vi.mock('../research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const item = {
  ticker: 'AAPL', name: 'Apple Inc.', uic: 211, asset_type: 'Stock',
  last_close: 230.5, change_1d: -1.25, sparkline: [1, 2, 3],
  reasons: [
    { field: 'roe', label: 'ROE', value: 31.2, format: 'pct' },
    { field: 'pct_vs_ma200', label: 'vs 200D', value: -6.4, format: 'signed_pct' },
  ],
}

const renderCard = (props = {}) =>
  render(
    <MemoryRouter>
      <DiscoverCard item={item} {...props} />
    </MemoryRouter>,
  )

describe('DiscoverCard', () => {
  it('shows every value that put the stock in the lens, each kept whole', () => {
    renderCard()
    const reasons = screen.getByRole('list', { name: 'Why AAPL is here' })
    expect(within(reasons).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['ROE 31%', 'vs 200D -6.4%'])
  })

  it('shows the change with its sign, not colour alone', () => {
    renderCard()
    expect(screen.getByText('-1.25%')).toBeInTheDocument()
  })

  it('opens Research on the overview for the exact instrument', () => {
    renderCard()
    expect(screen.getByRole('link', { name: /AAPL/ })).toHaveAttribute(
      'href',
      '/research?symbol=AAPL&tab=overview&uic=211&assetType=Stock',
    )
  })
})
