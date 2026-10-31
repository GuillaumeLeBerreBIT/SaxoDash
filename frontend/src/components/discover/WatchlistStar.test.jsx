import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
  it('opens the watchlists and toggles the one clicked', async () => {
    render(<WatchlistStar ticker="AAPL" name="Apple Inc." uic={211} assetType="Stock" />)
    const star = screen.getByRole('button', { name: 'AAPL is on a list' })
    expect(star).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(star)
    expect(star).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('menuitem', { name: /Ideas/ }))
    expect(toggleList).toHaveBeenCalledWith(watchlists[1])
  })

  it('moves focus into the menu on open and back to the star on Escape', async () => {
    render(<WatchlistStar ticker="AAPL" name="Apple Inc." uic={211} assetType="Stock" />)
    const star = screen.getByRole('button', { name: 'AAPL is on a list' })
    await userEvent.click(star)
    expect(screen.getAllByRole('menuitem')[0]).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(star).toHaveFocus()
  })

  it('right-aligns the menu to the star', async () => {
    render(<WatchlistStar ticker="AAPL" name="Apple Inc." uic={211} assetType="Stock" />)
    await userEvent.click(screen.getByRole('button', { name: 'AAPL is on a list' }))
    expect(screen.getByRole('menu')).toHaveAttribute('data-align', 'end')
  })
})
