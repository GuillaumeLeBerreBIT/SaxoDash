import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import ShelfRow from './ShelfRow'

vi.mock('../research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists: [], toggleList: vi.fn() }),
}))

const item = (i) => ({
  ticker: `T${i}`, name: `Stock ${i}`, uic: i, asset_type: 'Stock', last_close: 10, change_1d: 1, sparkline: [],
  reasons: [{ field: 'rsi14', label: 'RSI', value: 81, format: 'number' }],
})
const shelf = (total, count) => ({
  key: 'overbought', title: 'Overbought', subtitle: 'RSI 14 ≥ 70', order: 'Ordered by RSI 14, highest first',
  empty: 'No stocks match these criteria in the last session.', total, items: Array.from({ length: count }, (_, i) => item(i)),
})
const renderRow = (s) => render(<MemoryRouter><ShelfRow shelf={s} /></MemoryRouter>)

describe('ShelfRow', () => {
  it('shows only the cards that fit whole on a wide row', () => {
    renderRow(shelf(20, 20))
    expect(screen.getAllByRole('link', { name: /^T\d+/ })).toHaveLength(3)
  })

  it('does not pad a short shelf', () => {
    renderRow(shelf(2, 2))
    expect(screen.getAllByRole('link', { name: /^T\d+/ })).toHaveLength(2)
  })

  it('tells how many stocks See all opens', () => {
    renderRow(shelf(99, 20))
    expect(screen.getByRole('link', { name: 'See all 99' })).toHaveAttribute('href', '/discover/overbought')
  })

  it('keeps the count on one line', () => {
    renderRow(shelf(102, 20))
    expect(screen.getByText('102 stocks')).toHaveClass('whitespace-nowrap')
  })

  it('says a shelf is empty in readable contrast', () => {
    renderRow(shelf(0, 0))
    expect(screen.getByText('No stocks match these criteria in the last session.')).not.toHaveClass('text-zinc-600')
  })

  it('counts only the cards on screen in its note', () => {
    renderRow(shelf(99, 20))
    fireEvent.focus(screen.getByRole('button', { name: 'About Overbought' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Showing the first 3 of 99')
  })
})
