import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import Spending from './Spending'

vi.mock('../api/queries')
import * as queries from '../api/queries'

describe('Spending', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the spending total', () => {
    queries.useSpendingSummary.mockReturnValue({
      data: {
        categories: [{ category: 'GROCERIES', amount: '50.00' }],
        total: '50.00',
        transfers: '0.00',
      },
      isLoading: false,
      error: null,
    })
    queries.useSubscriptions.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useDismissSubscription.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<Spending />)

    // Asserting on the StatRow total, not chart-internal SVG content -
    // Recharts axis/bar labels aren't reliably queryable under jsdom, which
    // is why this codebase's existing chart tests (e.g.
    // CashFlowTrendChart.test.jsx) only assert on plain-DOM text like card
    // titles, never on data rendered inside the chart itself.
    expect(screen.getByText('€50.00')).toBeInTheDocument()
  })

  it('shows a visible Transfers line separate from the spending total', () => {
    queries.useSpendingSummary.mockReturnValue({
      data: {
        categories: [{ category: 'GROCERIES', amount: '50.00' }],
        total: '50.00',
        transfers: '500.00',
      },
      isLoading: false,
      error: null,
    })
    queries.useSubscriptions.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useDismissSubscription.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<Spending />)

    expect(screen.getByText('€50.00')).toBeInTheDocument()
    expect(screen.getByText('€500.00')).toBeInTheDocument()
  })

  it('lets you dismiss a subscription', async () => {
    const mutate = vi.fn()
    queries.useSpendingSummary.mockReturnValue({
      data: { categories: [], total: '0.00', transfers: '0.00' }, isLoading: false, error: null,
    })
    queries.useSubscriptions.mockReturnValue({
      data: [{ id: 1, display_name: 'NETFLIX.COM', expected_amount: '12.99', cadence: 'monthly', dismissed: false }],
      isLoading: false, error: null,
    })
    queries.useDismissSubscription.mockReturnValue({ mutate })

    const { getByText } = renderWithProviders(<Spending />)
    getByText('Dismiss').click()

    expect(mutate).toHaveBeenCalledWith({ id: 1, dismissed: true })
  })
})
