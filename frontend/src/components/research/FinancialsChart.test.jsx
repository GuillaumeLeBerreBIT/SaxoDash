import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import FinancialsChart from './FinancialsChart'

const year = (fiscal_year, income) => ({ period: `${fiscal_year}-12-31`, fiscal_year, label: `FY ${fiscal_year}`, income })

describe('FinancialsChart', () => {
  it('labels the chart and lists the series it draws', () => {
    render(<FinancialsChart periods={[year(2025, { revenue: 10, gross_profit: 6, operating_income: 3, net_income: 2 })]} />)

    expect(screen.getByRole('img', { name: /revenue and profit by period/i })).toBeInTheDocument()
    for (const name of ['Revenue', 'Gross profit', 'Operating income', 'Net income']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('leaves a series the company does not report out of the legend', () => {
    render(<FinancialsChart periods={[year(2025, { revenue: 10, net_income: 2 })]} />)

    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.queryByText('Gross profit')).not.toBeInTheDocument()
  })

  it('renders nothing without a charted figure', () => {
    const { container } = render(<FinancialsChart periods={[year(2025, { income_tax: 1 })]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
