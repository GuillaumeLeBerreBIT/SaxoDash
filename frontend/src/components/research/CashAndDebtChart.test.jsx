import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import CashAndDebtChart from './CashAndDebtChart'

const year = (fiscal_year, balance = {}, cash_flow = {}) => ({
  period: `${fiscal_year}-12-31`,
  fiscal_year,
  label: `FY ${fiscal_year}`,
  income: {},
  balance,
  cash_flow,
})

const full = [year(2025, { cash: 5e9, total_debt: 9e9 }, { free_cash_flow: 7e9 })]

describe('CashAndDebtChart', () => {
  it('titles the card and names the chart', () => {
    render(<CashAndDebtChart annual={full} />)

    expect(screen.getByRole('heading', { name: 'Cash and debt' })).toBeInTheDocument()
    expect(screen.getByText('Free cash flow, cash and total debt by fiscal year')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Free cash flow, cash and total debt by fiscal year' })).toBeInTheDocument()
  })

  it('lists every series that has data in the legend', () => {
    render(<CashAndDebtChart annual={full} />)

    for (const name of ['Free cash flow', 'Cash', 'Total debt']) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    }
    expect(screen.getByRole('list')).toHaveTextContent('Total debt')
  })

  it('leaves out the legend entry of a series without data', () => {
    render(<CashAndDebtChart annual={[year(2025, { cash: 5e9 }, { free_cash_flow: 7e9 })]} />)

    expect(screen.getByRole('list')).not.toHaveTextContent('Total debt')
    expect(screen.getByRole('list')).toHaveTextContent('Cash')
  })

  it('renders nothing without any of the three figures', () => {
    const { container } = render(<CashAndDebtChart annual={[year(2025, { total_assets: 1 })]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an empty or missing list', () => {
    expect(render(<CashAndDebtChart annual={[]} />).container).toBeEmptyDOMElement()
    expect(render(<CashAndDebtChart annual={undefined} />).container).toBeEmptyDOMElement()
  })
})
