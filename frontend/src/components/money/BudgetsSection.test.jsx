import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { expectValidHeadingOutline } from '../../test/headingOutline'
import { renderWithProviders } from '../../test/renderWithProviders'
import BudgetsSection from './BudgetsSection'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'

function mockDefaults(overrides = {}) {
  queries.useSubscriptions.mockReturnValue(overrides.subscriptions ?? { data: [], isLoading: false, error: null })
  queries.useDismissSubscription.mockReturnValue(overrides.dismissSubscription ?? { mutate: vi.fn() })
  queries.useBudgetProgress.mockReturnValue(overrides.budgetProgress ?? { data: [], isLoading: false, error: null })
  queries.useSetBudget.mockReturnValue(overrides.setBudget ?? { mutate: vi.fn() })
}

describe('BudgetsSection', () => {
  beforeEach(() => vi.clearAllMocks())

  it('has exactly one h1 and no skipped heading level', () => {
    mockDefaults()
    const { container } = renderWithProviders(<BudgetsSection />)
    expectValidHeadingOutline(container)
    expect(screen.getByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
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

    renderWithProviders(<BudgetsSection />)
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

    renderWithProviders(<BudgetsSection />)

    const budgets = screen.getByRole('heading', { level: 2, name: 'Budgets' }).closest('.sd-panel')
    expect(within(budgets).getByText('Groceries')).toBeInTheDocument()
    expect(within(budgets).getByText('€40.00 / €100.00')).toBeInTheDocument()
  })

  it('sums what is left across the budgets', () => {
    mockDefaults({
      budgetProgress: {
        data: [{ category: 'GROCERIES', limit: '100.00', spent: '40.00', pct: 40 }],
        isLoading: false,
        error: null,
      },
    })

    renderWithProviders(<BudgetsSection />)

    const left = screen.getByRole('heading', { name: 'Budget left' }).closest('.sd-panel')
    expect(within(left).getByText('€60.00')).toBeInTheDocument()
  })
})
