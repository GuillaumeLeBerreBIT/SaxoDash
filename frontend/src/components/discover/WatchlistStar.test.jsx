import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import WatchlistStar from './WatchlistStar'

const toggleList = vi.fn()
const watchlists = [
  { id: 1, name: 'Core', items: [{ id: 9, uic: 211 }] },
  { id: 2, name: 'Ideas', items: [] },
]

vi.mock('../research/useWatchlistToggle', () => ({
  useWatchlistToggle: () => ({ watchlists, toggleList }),
}))

describe('WatchlistStar', () => {
  it('opens the watchlists and toggles the one clicked', () => {
    render(<WatchlistStar ticker="AAPL" name="Apple Inc." uic={211} assetType="Stock" />)
    const star = screen.getByRole('button', { name: 'AAPL is on a list' })
    expect(star).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(star)
    expect(star).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: /Ideas/ }))
    expect(toggleList).toHaveBeenCalledWith(watchlists[1])
  })
})
