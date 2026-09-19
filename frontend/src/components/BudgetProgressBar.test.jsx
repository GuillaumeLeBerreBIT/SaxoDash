import { describe, expect, it, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import BudgetProgressBar from './BudgetProgressBar'

vi.mock('../api/queries')
import * as queries from '../api/queries'

describe('BudgetProgressBar', () => {
  it('shows a set-limit input when there is no budget yet', () => {
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })
    renderWithProviders(<BudgetProgressBar category="GROCERIES" spent="40.00" limit={null} />)
    expect(screen.getByPlaceholderText('Set limit')).toBeInTheDocument()
  })

  it('calls the mutation with the entered limit on blur', () => {
    const mutate = vi.fn()
    queries.useSetBudget.mockReturnValue({ mutate })
    renderWithProviders(<BudgetProgressBar category="GROCERIES" spent="40.00" limit={null} />)

    const input = screen.getByPlaceholderText('Set limit')
    fireEvent.change(input, { target: { value: '300' } })
    fireEvent.blur(input)

    expect(mutate).toHaveBeenCalledWith({ category: 'GROCERIES', monthlyLimit: 300 })
  })

  it('colors the bar red at or over 100%', () => {
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })
    const { container } = renderWithProviders(<BudgetProgressBar category="SHOPPING" spent="120.00" limit="100" />)
    expect(container.querySelector('.bg-red-500')).not.toBeNull()
  })

  it('colors the bar amber between 80 and 100%', () => {
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })
    const { container } = renderWithProviders(<BudgetProgressBar category="SHOPPING" spent="85.00" limit="100" />)
    expect(container.querySelector('.bg-amber-500')).not.toBeNull()
  })

  it('colors the bar green under 80%', () => {
    queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })
    const { container } = renderWithProviders(<BudgetProgressBar category="SHOPPING" spent="40.00" limit="100" />)
    expect(container.querySelector('.bg-emerald-500')).not.toBeNull()
  })
})
