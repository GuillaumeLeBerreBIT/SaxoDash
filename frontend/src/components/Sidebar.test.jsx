import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Sidebar from './Sidebar'

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
})
