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

  it('folds slices under three percent into a single Other row', () => {
    renderWithProviders(
      <SpendingCategoryChart
        categories={[
          { category: 'GROCERIES', amount: '960.00' },
          { category: 'DINING', amount: '20.00' },
          { category: 'FUEL', amount: '20.00' },
        ]}
        isLoading={false}
        error={null}
        periodLabel="September 2026"
      />,
    )

    expect(screen.getByText('Groceries')).toBeInTheDocument()
    expect(screen.queryByText('Dining')).not.toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
    expect(screen.getByText('€40.00')).toBeInTheDocument()
  })

  it('links each category to its transactions for the exact period, and the folded Other slice to the all-spending view', () => {
    renderWithProviders(
      <SpendingCategoryChart
        categories={[
          { category: 'GROCERIES', amount: '960.00' },
          { category: 'DINING', amount: '20.00' },
          { category: 'TRANSPORT', amount: '20.00' },
        ]}
        isLoading={false}
        error={null}
        periodLabel="September 2026"
        period={{ date_from: '2026-09-01', date_to: '2026-09-30' }}
      />,
    )

    expect(screen.getByRole('link', { name: /Groceries/ })).toHaveAttribute(
      'href',
      '/spending/transactions?category=GROCERIES&from=2026-09-01&to=2026-09-30',
    )
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByRole('link', { name: /Other/ })).toHaveAttribute(
      'href',
      '/spending/transactions?from=2026-09-01&to=2026-09-30',
    )
  })

  it('links every category when none is folded', () => {
    renderWithProviders(
      <SpendingCategoryChart
        categories={[
          { category: 'GROCERIES', amount: '120.00' },
          { category: 'DINING', amount: '80.00' },
        ]}
        isLoading={false}
        error={null}
        periodLabel="September 2026"
        period={{ date_from: '2026-09-01', date_to: '2026-09-30' }}
      />,
    )

    expect(screen.getByRole('link', { name: /Dining/ })).toHaveAttribute(
      'href',
      '/spending/transactions?category=DINING&from=2026-09-01&to=2026-09-30',
    )
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })

  it('keeps a real OTHER category linked to itself when it is not folded', () => {
    renderWithProviders(
      <SpendingCategoryChart
        categories={[
          { category: 'GROCERIES', amount: '60.00' },
          { category: 'OTHER', amount: '40.00' },
        ]}
        isLoading={false}
        error={null}
        periodLabel="September 2026"
        period={{ date_from: '2026-09-01', date_to: '2026-09-30' }}
      />,
    )

    expect(screen.getByRole('link', { name: /Other/ })).toHaveAttribute(
      'href',
      '/spending/transactions?category=OTHER&from=2026-09-01&to=2026-09-30',
    )
  })

  it('does not collide when a real OTHER and a folded slice are both shown', () => {
    renderWithProviders(
      <SpendingCategoryChart
        categories={[
          { category: 'GROCERIES', amount: '600.00' },
          { category: 'OTHER', amount: '355.00' },
          { category: 'DINING', amount: '20.00' },
          { category: 'TRANSPORT', amount: '25.00' },
        ]}
        isLoading={false}
        error={null}
        periodLabel="September 2026"
        period={{ date_from: '2026-09-01', date_to: '2026-09-30' }}
      />,
    )

    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(hrefs).toContain('/spending/transactions?category=OTHER&from=2026-09-01&to=2026-09-30')
    expect(hrefs).toContain('/spending/transactions?from=2026-09-01&to=2026-09-30')
    expect(hrefs).toHaveLength(3)
  })
})
