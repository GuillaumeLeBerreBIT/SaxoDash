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
        // Category amount deliberately differs from the total so the
        // BudgetSection fallback row (which also renders the plain spent
        // amount for an un-budgeted category) can't collide with the
        // StatRow total text below.
        categories: [{ category: 'GROCERIES', amount: '20.00' }],
        total: '50.00',
        transfers: '0.00',
      },
      isLoading: false,
      error: null,
    })
    queries.useSubscriptions.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useDismissSubscription.mockReturnValue({ mutate: vi.fn() })
    queries.useSpendingTrend.mockReturnValue({
      data: [{ month: '2026-01', total: '50.00' }], isLoading: false, error: null,
    })
    queries.useBudgetProgress.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

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
        // Category amount deliberately differs from the total/transfers
        // values so the BudgetSection fallback row can't collide with them.
        categories: [{ category: 'GROCERIES', amount: '20.00' }],
        total: '50.00',
        transfers: '500.00',
      },
      isLoading: false,
      error: null,
    })
    queries.useSubscriptions.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useDismissSubscription.mockReturnValue({ mutate: vi.fn() })
    queries.useSpendingTrend.mockReturnValue({
      data: [{ month: '2026-01', total: '50.00' }], isLoading: false, error: null,
    })
    queries.useBudgetProgress.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

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
    queries.useSpendingTrend.mockReturnValue({
      data: [{ month: '2026-01', total: '50.00' }], isLoading: false, error: null,
    })
    queries.useBudgetProgress.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

    const { getByText } = renderWithProviders(<Spending />)
    getByText('Dismiss').click()

    expect(mutate).toHaveBeenCalledWith({ id: 1, dismissed: true })
  })

  it('shows a budget progress bar for a category with a limit set', () => {
    queries.useSpendingSummary.mockReturnValue({
      data: { categories: [{ category: 'GROCERIES', amount: '40.00' }], total: '40.00', transfers: '0.00' },
      isLoading: false,
      error: null,
    })
    queries.useSubscriptions.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useDismissSubscription.mockReturnValue({ mutate: vi.fn() })
    queries.useBudgetProgress.mockReturnValue({
      data: [{ category: 'GROCERIES', limit: '100.00', spent: '40.00', pct: 40 }],
      isLoading: false,
      error: null,
    })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<Spending />)

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('€40.00 / €100.00')).toBeInTheDocument()
  })
})
