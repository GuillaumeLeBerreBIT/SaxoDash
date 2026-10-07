import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import Layout from './Layout'

vi.mock('../api/client', () => ({
  getUsername: () => 'Test User',
  logout: vi.fn(),
}))
vi.mock('./CommandPalette', () => ({ default: () => null }))

describe('Layout shell', () => {
  it('hides the sidebar below md', () => {
    const { container } = renderWithProviders(<Layout />)
    const aside = container.querySelector('aside')
    expect(aside).toHaveClass('hidden')
    expect(aside).toHaveClass('md:flex')
  })

  it('offsets main by the rail only from md up', () => {
    const { container } = renderWithProviders(<Layout />)
    const main = container.querySelector('main')
    expect(main).toHaveClass('md:ml-[var(--rail)]')
    expect(main.style.marginLeft).toBe('')
    expect(main.style.getPropertyValue('--rail')).toMatch(/^(64|220)px$/)
  })

  it('renders the mobile top bar and bottom navigation', () => {
    const { container } = renderWithProviders(<Layout />)
    expect(container.querySelector('header')).toHaveClass('md:hidden')
    expect(container.querySelector('nav[aria-label="Primary"]')).toBeInTheDocument()
  })
})
