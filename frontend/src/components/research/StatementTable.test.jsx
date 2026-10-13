import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { statementByKey } from '../../lib/statements'
import StatementTable from './StatementTable'

const year = (fiscal_year, income) => ({
  period: `${fiscal_year}-12-31`,
  fiscal_year,
  label: `FY ${fiscal_year}`,
  income,
  balance: {},
  cash_flow: {},
})

const periods = [
  year(2023, { revenue: 80_000_000_000, net_income: -4_000_000_000 }),
  year(2024, { revenue: 100_000_000_000, net_income: 10_000_000_000 }),
  year(2025, { revenue: 125_000_000_000, net_income: 20_000_000_000, income_tax: 3_000_000_000 }),
]

const renderTable = (visible = periods.slice(-2)) =>
  render(<StatementTable statement={statementByKey('income')} periods={visible} allPeriods={periods} />)

describe('StatementTable', () => {
  it('has a column per visible period, oldest first', () => {
    renderTable()

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Income statement', 'FY 2024', 'FY 2025'])
  })

  it('prints each reported row and leaves out the ones nobody reports', () => {
    renderTable()

    expect(screen.getByRole('rowheader', { name: 'Revenue' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Income tax' })).toBeInTheDocument()
    expect(screen.queryByRole('rowheader', { name: 'Gross profit' })).not.toBeInTheDocument()
  })

  it('formats dollars compactly and a missing cell as a dash', () => {
    renderTable()

    const revenue = screen.getByRole('rowheader', { name: 'Revenue' }).closest('tr')
    expect(within(revenue).getByText('125.00B')).toBeInTheDocument()
    const tax = screen.getByRole('rowheader', { name: 'Income tax' }).closest('tr')
    expect(within(tax).getByText('—')).toBeInTheDocument()
    expect(within(tax).getByText('3.00B')).toBeInTheDocument()
  })

  it('shows the year-on-year change under a headline figure', () => {
    renderTable()

    const revenue = screen.getByRole('rowheader', { name: 'Revenue' }).closest('tr')
    expect(within(revenue).getAllByText('+25.00%')).toHaveLength(2)
  })

  it('compares against a period that is not on screen', () => {
    renderTable(periods.slice(-1))

    const net = screen.getByRole('rowheader', { name: 'Net income' }).closest('tr')
    expect(within(net).getByText('+100.00%')).toBeInTheDocument()
  })

  it('shows no change where there is no prior year', () => {
    renderTable(periods.slice(0, 1))

    expect(screen.queryByText(/%$/)).not.toBeInTheDocument()
  })

  it('shows no change under a row that is not a headline', () => {
    renderTable()

    const tax = screen.getByRole('rowheader', { name: 'Income tax' }).closest('tr')
    expect(within(tax).queryByText(/%$/)).not.toBeInTheDocument()
  })

  it('renders nothing when no row has data', () => {
    const { container } = render(
      <StatementTable statement={statementByKey('balance')} periods={periods} allPeriods={periods} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})

describe('opening on the newest period', () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth')

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 640 })
  })

  afterEach(() => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', original)
    else delete HTMLElement.prototype.scrollWidth
  })

  it('scrolls the wide table to its right edge on render and again when the periods change', () => {
    const { container, rerender } = render(<StatementTable statement={statementByKey('income')} periods={periods.slice(-2)} allPeriods={periods} />)
    const wrapper = container.querySelector('.overflow-x-auto')
    expect(wrapper.scrollLeft).toBe(640)

    wrapper.scrollLeft = 0
    rerender(<StatementTable statement={statementByKey('income')} periods={periods} allPeriods={periods} />)

    expect(wrapper.scrollLeft).toBe(640)
  })
})
