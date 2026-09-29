import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import WatchlistHeatmap from './WatchlistHeatmap'

const items = [
  { id: 1, symbol: 'AAPL', uic: 1, asset_type: 'Stock' },
  { id: 2, symbol: 'NVDA', uic: 2, asset_type: 'Stock' },
  { id: 3, symbol: 'TSLA', uic: 3, asset_type: 'Stock' },
  { id: 4, symbol: 'IWDA', uic: 4, asset_type: 'Etf' },
  { id: 5, symbol: 'KO', uic: 5, asset_type: 'Stock' },
]

const quotes = new Map([
  [1, { uic: 1, change_pct: 0.05, change_basis: 'live' }],
  [2, { uic: 2, change_pct: 3.1, change_basis: 'live' }],
  [3, { uic: 3, change_pct: -2.4, change_basis: 'live' }],
  [5, { uic: 5, change_pct: 0.8, change_basis: 'live' }],
])

const renderGrid = (props = {}) => {
  const onSelectSymbol = vi.fn()
  render(
    <WatchlistHeatmap
      items={items}
      quotes={quotes}
      symbol="TSLA"
      heldSymbols={new Set(['NVDA'])}
      onSelectSymbol={onSelectSymbol}
      {...props}
    />,
  )
  return onSelectSymbol
}

describe('WatchlistHeatmap', () => {
  it('orders tiles from biggest gain to biggest loss, unknown last', () => {
    renderGrid()
    const order = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label').split(' ')[0])
    expect(order).toEqual(['NVDA', 'KO', 'AAPL', 'TSLA', 'IWDA'])
  })

  it('counts risers and fallers, leaving flat and unknown out', () => {
    renderGrid()
    expect(screen.getByLabelText('2 up, 1 down')).toBeInTheDocument()
  })

  it('marks the charted symbol and the held ones', () => {
    renderGrid()
    expect(screen.getByRole('button', { name: /^TSLA/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /^NVDA/ })).toHaveAccessibleName('NVDA +3.1%, in portfolio')
  })

  it('loads a tile into the chart', async () => {
    const user = userEvent.setup()
    const onSelectSymbol = renderGrid()
    await user.click(screen.getByRole('button', { name: /^NVDA/ }))
    expect(onSelectSymbol).toHaveBeenCalledWith('NVDA', { uic: 2, assetType: 'Stock' })
  })

  it('calls a last-close move the latest session', () => {
    renderGrid({ quotes: new Map([[2, { uic: 2, change_pct: 3.1, change_basis: 'last_close' }]]) })
    expect(screen.getByText('Latest session · sorted by move')).toBeInTheDocument()
  })
})
