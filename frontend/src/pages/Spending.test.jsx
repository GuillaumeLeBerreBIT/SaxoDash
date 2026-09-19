import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import Spending from './Spending'

vi.mock('../api/queries')
import * as queries from '../api/queries'

function mockDefaults(overrides = {}) {
  queries.useSpendingSummary.mockReturnValue(
    overrides.summary ?? {
      data: { categories: [], total: '0.00', transfers: '0.00', transaction_count: 0, previous_period: null },
      isLoading: false,
      error: null,
    },
  )
  queries.useSubscriptions.mockReturnValue(overrides.subscriptions ?? { data: [], isLoading: false, error: null })
  queries.useDismissSubscription.mockReturnValue(overrides.dismissSubscription ?? { mutate: vi.fn() })
  queries.useSpendingTrend.mockReturnValue(overrides.trend ?? { data: [], isLoading: false, error: null })
  queries.useBudgetProgress.mockReturnValue(overrides.budgetProgress ?? { data: [], isLoading: false, error: null })
  queries.useSetBudget.mockReturnValue(overrides.setBudget ?? { mutate: vi.fn() })
}

describe('Spending', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the spending total for the selected period', () => {
    mockDefaults({
      summary: {
        data: {
          categories: [{ category: 'GROCERIES', amount: '20.00' }],
          total: '50.00', transfers: '0.00', transaction_count: 3, previous_period: null,
        },
        isLoading: false,
        error: null,
      },
    })

    renderWithProviders(<Spending />)

    expect(screen.getByText('€50.00')).toBeInTheDocument()
  })

  it('shows a visible Transfers line separate from the spending total', () => {
    mockDefaults({
      summary: {
        data: {
          categories: [{ category: 'GROCERIES', amount: '20.00' }],
          total: '50.00', transfers: '500.00', transaction_count: 3, previous_period: null,
        },
        isLoading: false,
        error: null,
      },
    })

    renderWithProviders(<Spending />)

    expect(screen.getByText('€50.00')).toBeInTheDocument()
    expect(screen.getByText('€500.00')).toBeInTheDocument()
  })

  it('shows a comparison against the previous period when one is available', () => {
    mockDefaults({
      summary: {
        data: {
          categories: [{ category: 'GROCERIES', amount: '50.00' }],
          total: '50.00', transfers: '0.00', transaction_count: 3,
          previous_period: { date_from: '2026-08-01', date_to: '2026-08-31', total: '40.00' },
        },
        isLoading: false,
        error: null,
      },
    })

    renderWithProviders(<Spending />)

    expect(screen.getByText('vs €40.00 last period')).toBeInTheDocument()
  })

  it('lets you dismiss a subscription', () => {
    const mutate = vi.fn()
    mockDefaults({
      subscriptions: {
        data: [{ id: 1, display_name: 'NETFLIX.COM', expected_amount: '12.99', cadence: 'monthly', dismissed: false }],
        isLoading: false,
        error: null,
      },
      dismissSubscription: { mutate },
    })

    renderWithProviders(<Spending />)
    screen.getByText('Dismiss').click()

    expect(mutate).toHaveBeenCalledWith({ id: 1, dismissed: true })
  })

  it('shows a budget progress bar for a category with a limit set', () => {
    mockDefaults({
      budgetProgress: {
        data: [{ category: 'GROCERIES', limit: '100.00', spent: '40.00', pct: 40 }],
        isLoading: false,
        error: null,
      },
    })

    renderWithProviders(<Spending />)

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('€40.00 / €100.00')).toBeInTheDocument()
  })

  it('switching the period selector re-requests the summary with the new date range', () => {
    mockDefaults()
    renderWithProviders(<Spending />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Select period' }), { target: { value: 'last_month' } })

    const calledQueries = queries.useSpendingSummary.mock.calls.map((args) => args[0])
    expect(calledQueries.some((q) => typeof q === 'string' && q.includes('date_from'))).toBe(true)
  })
})
