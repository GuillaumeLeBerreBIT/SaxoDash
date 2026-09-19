import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import BudgetSection from './BudgetSection'

vi.mock('../api/queries')
import * as queries from '../api/queries'

describe('BudgetSection', () => {
  it('does not offer a Set limit fallback row for a non-budgetable category like INCOME', () => {
    queries.useBudgetProgress.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(
      <BudgetSection categories={[{ category: 'INCOME', amount: '500.00' }]} />,
    )

    expect(screen.queryByText('Income')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Set limit')).not.toBeInTheDocument()
  })

  it('still shows a Set limit fallback row for a genuinely budgetable category', () => {
    queries.useBudgetProgress.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(
      <BudgetSection categories={[{ category: 'GROCERIES', amount: '40.00' }]} />,
    )

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Set limit')).toBeInTheDocument()
  })

  it('still shows a category that already has a real budget, unaffected by the categories filter', () => {
    queries.useBudgetProgress.mockReturnValue({
      data: [{ category: 'GROCERIES', limit: '100.00', spent: '40.00', pct: 40 }],
      isLoading: false,
      error: null,
    })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<BudgetSection categories={[]} />)

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('€40.00 / €100.00')).toBeInTheDocument()
  })
})
