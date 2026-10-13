import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import AssetsLiabilitiesChart from './AssetsLiabilitiesChart'

const year = (fiscal_year, balance = {}) => ({
  period: `${fiscal_year}-12-31`,
  fiscal_year,
  label: `FY ${fiscal_year}`,
  income: {},
  balance,
  cash_flow: {},
})

const full = { total_assets: 100e9, current_assets: 40e9, total_liabilities: 70e9, current_liabilities: 30e9 }

describe('AssetsLiabilitiesChart', () => {
  it('titles the card and names the chart', () => {
    render(<AssetsLiabilitiesChart annual={[year(2025, full)]} />)

    expect(screen.getByRole('heading', { name: 'Assets against liabilities' })).toBeInTheDocument()
    expect(screen.getByText('Short- and long-term, by fiscal year')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Short- and long-term assets against liabilities by fiscal year' }),
    ).toBeInTheDocument()
  })

  it('lists the four series in the legend', () => {
    render(<AssetsLiabilitiesChart annual={[year(2025, full)]} />)

    const legend = screen.getByRole('list')
    for (const name of ['Current assets', 'Long-term assets', 'Current liabilities', 'Long-term liabilities']) {
      expect(legend).toHaveTextContent(name)
    }
  })

  it('renders nothing for a bank-shaped balance sheet without current assets', () => {
    const bank = { total_assets: 100e9, total_liabilities: 90e9 }

    const { container } = render(<AssetsLiabilitiesChart annual={[year(2025, bank)]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an empty or missing list', () => {
    expect(render(<AssetsLiabilitiesChart annual={[]} />).container).toBeEmptyDOMElement()
    expect(render(<AssetsLiabilitiesChart annual={undefined} />).container).toBeEmptyDOMElement()
  })
})
