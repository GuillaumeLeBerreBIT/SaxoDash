import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import SpendingCategoryChart from './SpendingCategoryChart'

describe('SpendingCategoryChart', () => {
  it('renders each category as a legend row with its amount and the period label', () => {
    renderWithProviders(
      <SpendingCategoryChart
        categories={[
          { category: 'GROCERIES', amount: '120.00' },
          { category: 'DINING', amount: '40.00' },
        ]}
        isLoading={false}
        error={null}
        periodLabel="September 2026"
      />,
    )

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('Dining')).toBeInTheDocument()
    expect(screen.getByText('€120.00')).toBeInTheDocument()
    expect(screen.getByText('September 2026')).toBeInTheDocument()
  })

  it('shows a placeholder when there is no spending in the period', () => {
    renderWithProviders(
      <SpendingCategoryChart categories={[]} isLoading={false} error={null} periodLabel="September 2026" />,
    )

    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })
})
