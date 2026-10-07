import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import SpendingTrendChart from './SpendingTrendChart'

vi.mock('../api/queries')
import * as queries from '../api/queries'

describe('SpendingTrendChart', () => {
  it('renders months without a total instead of crashing', () => {
    queries.useSpendingTrend.mockReturnValue({
      data: [
        { month: '2026-05', total: null, partial: false },
        { month: '2026-06', total: '120.00', partial: true },
      ],
      isLoading: false,
      error: null,
    })
    renderWithProviders(<SpendingTrendChart />)
    expect(screen.getByText('Spending over time')).toBeInTheDocument()
  })

  it('says the current month is to date when the last bar is partial', () => {
    queries.useSpendingTrend.mockReturnValue({
      data: [
        { month: '2026-05', total: '90.00', partial: false },
        { month: '2026-06', total: '120.00', partial: true },
      ],
      isLoading: false,
      error: null,
    })
    renderWithProviders(<SpendingTrendChart />)
    expect(screen.getByText(/current month to date/)).toBeInTheDocument()
  })

  it('does not claim month to date when every bar is complete', () => {
    queries.useSpendingTrend.mockReturnValue({
      data: [{ month: '2026-05', total: '90.00', partial: false }],
      isLoading: false,
      error: null,
    })
    renderWithProviders(<SpendingTrendChart />)
    expect(screen.queryByText(/current month to date/)).not.toBeInTheDocument()
  })
})
