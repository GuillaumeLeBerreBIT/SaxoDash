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

  it('moves focus into the menu on open and back to the star on Escape', () => {
    render(<WatchlistStar ticker="AAPL" name="Apple Inc." uic={211} assetType="Stock" />)
    const star = screen.getByRole('button', { name: 'AAPL is on a list' })
    fireEvent.click(star)
    expect(screen.getAllByRole('menuitem')[0]).toHaveFocus()
    fireEvent.keyDown(document.activeElement, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(star).toHaveFocus()
  })

  it('right-aligns the menu to the star and keeps it inside the viewport', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 100, bottom: 124, left: window.innerWidth - 24, right: window.innerWidth, width: 24, height: 24,
    })
    render(<WatchlistStar ticker="AAPL" name="Apple Inc." uic={211} assetType="Stock" />)
    fireEvent.click(screen.getByRole('button', { name: 'AAPL is on a list' }))
    expect(screen.getByRole('menu').style.left).toBe(`${window.innerWidth - 200 - 8}px`)
    spy.mockRestore()
  })
})
