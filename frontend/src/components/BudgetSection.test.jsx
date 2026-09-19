import { describe, expect, it, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import BudgetSection from './BudgetSection'

vi.mock('../api/queries')
import * as queries from '../api/queries'

describe('BudgetSection', () => {
  it('shows a category that already has a budget set', () => {
    queries.useBudgetProgress.mockReturnValue({
      data: [{ category: 'GROCERIES', limit: '100.00', spent: '40.00', pct: 40 }],
      isLoading: false,
      error: null,
    })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<BudgetSection />)

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('€40.00 / €100.00')).toBeInTheDocument()
  })

  it('offers an Add a budget control listing only unbudgeted, budgetable categories', () => {
    queries.useBudgetProgress.mockReturnValue({
      data: [{ category: 'GROCERIES', limit: '100.00', spent: '40.00', pct: 40 }],
      isLoading: false,
      error: null,
    })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<BudgetSection />)

    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('Dining')
    expect(options).not.toContain('Groceries')
    expect(options).not.toContain('Income')
  })

  it('adding a budget calls setBudget with the chosen category and amount', () => {
    const mutate = vi.fn()
    queries.useBudgetProgress.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useSetBudget.mockReturnValue({ mutate })

    renderWithProviders(<BudgetSection />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'DINING' } })
    fireEvent.change(screen.getByPlaceholderText('Monthly limit'), { target: { value: '80' } })
    fireEvent.click(screen.getByText('Add a budget'))

    expect(mutate).toHaveBeenCalledWith({ category: 'DINING', monthlyLimit: 80 })
  })

  it('shows an empty state when no budgets are set yet', () => {
    queries.useBudgetProgress.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })

    renderWithProviders(<BudgetSection />)

    expect(screen.getByText('No budgets set yet.')).toBeInTheDocument()
  })
})
