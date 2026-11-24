import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import PortfolioHero from './PortfolioHero'

vi.mock('../../api/queries', () => ({
  useNetWorthHistory: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
  useTransactions: () => ({ data: [] }),
}))

const renderHero = (props) =>
  render(
    <MemoryRouter>
      <PortfolioHero summary={{}} positions={[]} quotes={new Map()} {...props} />
    </MemoryRouter>,
  )

describe('PortfolioHero', () => {
  it('labels the value with its holdings count at Saxo', () => {
    renderHero({ holdingsCount: 3 })
    expect(screen.getByText('Portfolio value · 3 holdings at Saxo')).toBeInTheDocument()
  })

  it('uses the singular for one holding', () => {
    renderHero({ holdingsCount: 1 })
    expect(screen.getByText('Portfolio value · 1 holding at Saxo')).toBeInTheDocument()
  })

  it('labels the value plainly while the holdings count is unknown', () => {
    renderHero({ holdingsCount: null })
    expect(screen.getByText('Portfolio value')).toBeInTheDocument()
  })
})
