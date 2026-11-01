import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import Layout from './Layout'

vi.mock('../api/client', () => ({
  getUsername: () => 'Test User',
  logout: vi.fn(),
  connectSaxo: vi.fn(),
  getSaxoStatus: vi.fn(() => new Promise(() => {})),
  getFilingAlerts: vi.fn(() => new Promise(() => {})),
  markFilingAlertsRead: vi.fn(),
  getPortfolioSummary: vi.fn(() => new Promise(() => {})),
  getNetWorth: vi.fn(() => new Promise(() => {})),
}))
vi.mock('./CommandPalette', () => ({ default: () => null }))

describe('Layout shell', () => {
  it('has no sidebar and no rail offset', () => {
    const { container } = renderWithProviders(<Layout />)
    expect(container.querySelector('aside')).not.toBeInTheDocument()
    expect(container.querySelector('main').style.getPropertyValue('--rail')).toBe('')
  })

  it('puts the sticky header above the page, below the safe-area inset', () => {
    const { container } = renderWithProviders(<Layout />)
    const header = container.querySelector('header')
    expect(header).toHaveClass('sticky', 'top-[env(safe-area-inset-top)]')
    expect(screen.getByRole('navigation', { name: 'Pages' })).toBeInTheDocument()
  })

  it('pads the page with the shared gutter and no narrow max width', () => {
    const { container } = renderWithProviders(<Layout />)
    const page = container.querySelector('main > div')
    expect(page).toHaveClass('sd-gutter')
    expect(page.style.maxWidth).toBe('')
  })

  it('renders the phone bottom navigation', () => {
    renderWithProviders(<Layout />)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })
})
