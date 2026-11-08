import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { useNavigate } from 'react-router-dom'
import userEvent from '@testing-library/user-event'
import MobileNav from './MobileNav'
import { renderWithProviders } from '../test/renderWithProviders'

describe('MobileNav', () => {
  it('phone bar has Overview, Portfolio, Research, Discover, More', () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(nav).toHaveClass('min-[760px]:hidden')
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Overview', 'Portfolio', 'Research', 'Discover'])
    expect(within(nav).getByRole('button', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument()
  })

  it('marks the active destination', () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />, { route: '/discover' })
    expect(screen.getByRole('link', { name: 'Discover' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens a More dialog listing the overflow destinations', async () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />)
    const more = screen.getByRole('button', { name: 'More' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    const dialog = screen.getByRole('dialog', { name: 'More' })
    expect(within(dialog).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Boards',
      'Earnings',
      'Investors',
      'Analytics',
      'Money',
      'Settings',
    ])
  })

  it('closes on Escape', async () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on backdrop click', async () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByTestId('more-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes after navigating to an overflow destination', async () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByRole('link', { name: 'Money' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks More active on an overflow route only', () => {
    const { unmount } = renderWithProviders(<MobileNav onOpenPalette={() => {}} />, { route: '/money/accounts/4' })
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page')
    unmount()
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />, { route: '/portfolio' })
    expect(screen.getByRole('button', { name: 'More' })).not.toHaveAttribute('aria-current')
  })

  it('opens the palette from the Search row and closes the sheet', async () => {
    const onOpenPalette = vi.fn()
    renderWithProviders(<MobileNav onOpenPalette={onOpenPalette} />)
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Search' }))
    expect(onOpenPalette).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('moves focus into the dialog on open', async () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement)
  })

  it('wraps Tab and Shift+Tab inside the dialog', async () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    const dialog = screen.getByRole('dialog')
    const items = within(dialog).getAllByRole('link').concat(within(dialog).getAllByRole('button'))
    const first = within(dialog).getAllByRole('link')[0]
    const last = within(dialog).getByRole('button', { name: 'Search' })
    expect(items).toContain(last)
    last.focus()
    await userEvent.tab()
    expect(first).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  it('returns focus to More after Escape', async () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />)
    const more = screen.getByRole('button', { name: 'More' })
    await userEvent.click(more)
    await userEvent.keyboard('{Escape}')
    expect(more).toHaveFocus()
  })

  it('closes when the link for the current route is tapped', async () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />, { route: '/money' })
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    await userEvent.click(screen.getByRole('link', { name: 'Money' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays closed when history returns to the path where it was opened', async () => {
    function Jump() {
      const navigate = useNavigate()
      return (
        <>
          <button onClick={() => navigate('/')}>go-home</button>
          <button onClick={() => navigate('/portfolio')}>go-portfolio</button>
        </>
      )
    }
    renderWithProviders(
      <>
        <MobileNav onOpenPalette={() => {}} />
        <Jump />
      </>,
      { route: '/portfolio' },
    )
    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'go-home' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'go-portfolio' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
