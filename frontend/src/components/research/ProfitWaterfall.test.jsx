import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import ProfitWaterfall from './ProfitWaterfall'

const period = (income) => ({ period: '2025-12-31', fiscal_year: 2025, label: 'FY 2025', income })

describe('ProfitWaterfall', () => {
  it('lists each step with its amount', () => {
    render(<ProfitWaterfall period={period({ revenue: 100e9, gross_profit: 60e9, operating_income: 35e9, net_income: 28e9 })} />)

    const steps = screen.getAllByRole('listitem')
    expect(steps.map((step) => within(step).getByTestId('step-label').textContent)).toEqual([
      'Revenue', 'Cost of revenue', 'Gross profit', 'Operating expenses', 'Operating income', 'Tax & other', 'Net income',
    ])
    expect(within(steps[0]).getByText('100.00B')).toBeInTheDocument()
    expect(within(steps[1]).getByText('-40.00B')).toBeInTheDocument()
    expect(within(steps[6]).getByText('28.00B')).toBeInTheDocument()
  })

  it('keeps every bar inside the track, also below zero', () => {
    render(<ProfitWaterfall period={period({ revenue: 100e9, operating_income: -20e9, net_income: -25e9 })} />)

    for (const bar of screen.getAllByTestId('step-bar')) {
      const left = parseFloat(bar.style.left)
      const width = parseFloat(bar.style.width)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left + width).toBeLessThanOrEqual(100.0001)
    }
  })

  it('renders nothing without revenue and net income', () => {
    const { container } = render(<ProfitWaterfall period={period({ revenue: 100e9 })} />)

    expect(container).toBeEmptyDOMElement()
  })
})
