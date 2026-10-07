import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MobileNav from './MobileNav'
import { renderWithProviders } from '../test/renderWithProviders'

vi.mock('../api/client', () => ({
  getUsername: () => 'Test User',
  logout: vi.fn(),
}))

describe('MobileNav', () => {
  it('renders the four primary tabs in a Primary navigation', () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(nav).toHaveClass('md:hidden')
    const names = within(nav).getAllByRole('link').map((link) => link.textContent)
    expect(names).toEqual(['Dashboard', 'Portfolio', 'Research', 'Spending'])
    expect(screen.queryByRole('link', { name: 'Analytics' })).not.toBeInTheDocument()
  })

  it('opens a More dialog listing the overflow destinations', async () => {
    renderWithProviders(<MobileNav onOpenPalette={() => {}} />)
    const more = screen.getByRole('button', { name: 'More' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    const dialog = screen.getByRole('dialog', { name: 'More' })
    for (const label of ['Analytics', 'Discover', 'Earnings', 'Investors', 'Transactions', 'Accounts']) {
      expect(within(dialog).getByRole('link', { name: label })).toBeInTheDocument()
    }
    expect(within(dialog).getByText('Test User')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Log out' })).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('link', { name: 'Accounts' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page')
  })

  it('marks More active on an overflow route only', () => {
    const { unmount } = renderWithProviders(<MobileNav onOpenPalette={() => {}} />, { route: '/accounts' })
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
})
