import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Sidebar from './Sidebar'
import { NAV_ITEMS } from '../lib/navigation'

vi.mock('../api/queries')
import * as queries from '../api/queries'

beforeEach(() => {
  queries.useSaxoStatus.mockReturnValue({ data: { connected: false } })
})

vi.mock('../api/client', () => ({
  getUsername: () => 'Test User',
  logout: vi.fn(),
}))

describe('Sidebar', () => {
  it('credits elbstream.com for the instrument logos when expanded', () => {
    render(
      <MemoryRouter>
        <Sidebar collapsed={false} setCollapsed={() => {}} onOpenPalette={() => {}} />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'elbstream.com' })
    expect(link).toHaveAttribute('href', 'https://elbstream.com/logos')
  })

  it('hides the attribution text when collapsed, like every other label', () => {
    render(
      <MemoryRouter>
        <Sidebar collapsed setCollapsed={() => {}} onOpenPalette={() => {}} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: 'elbstream.com' })).not.toBeInTheDocument()
  })

  it('links to every shared nav item', () => {
    render(
      <MemoryRouter>
        <Sidebar collapsed={false} setCollapsed={() => {}} onOpenPalette={() => {}} />
      </MemoryRouter>,
    )
    for (const { label } of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it.each([[false], [true]])('shows the compact Saxo status (collapsed: %s)', (collapsed) => {
    render(
      <MemoryRouter>
        <Sidebar collapsed={collapsed} setCollapsed={() => {}} onOpenPalette={() => {}} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status', { name: 'Saxo not connected' })).toBeInTheDocument()
  })
})
