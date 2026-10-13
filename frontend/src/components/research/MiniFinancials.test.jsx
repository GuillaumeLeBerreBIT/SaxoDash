import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { NEGATIVE, STATEMENT_SERIES } from '../../lib/charts'
import MiniFinancials from './MiniFinancials'

const year = (fiscal_year, revenue, net_income) => ({
  label: `FY ${fiscal_year}`,
  fiscal_year,
  income: { ...(revenue == null ? {} : { revenue }), ...(net_income == null ? {} : { net_income }) },
})

const colour = (value) => {
  const probe = document.createElement('span')
  probe.style.backgroundColor = value
  return probe.style.backgroundColor
}

describe('MiniFinancials', () => {
  it('draws the newest five years, oldest first, with a text alternative', () => {
    const annual = [2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y, index) => year(y, (index + 1) * 10e9, (index + 1) * 2e9))
    render(<MiniFinancials annual={annual} />)

    const years = screen.getAllByRole('listitem')
    expect(years).toHaveLength(5)
    expect(within(years[0]).getByText('2021')).toBeInTheDocument()
    expect(years.at(-1)).toHaveAccessibleName('FY 2025: revenue 70.00B, net income 14.00B')
  })

  it('draws a loss below the baseline without breaking the layout', () => {
    render(<MiniFinancials annual={[year(2024, 10e9, -2e9), year(2025, 12e9, 1e9)]} />)

    expect(screen.getAllByRole('listitem')[0]).toHaveAccessibleName('FY 2024: revenue 10.00B, net income -2.00B')
  })

  it('names a year without net income by its revenue alone', () => {
    render(<MiniFinancials annual={[year(2024, 10e9, null), year(2025, 12e9, 1e9)]} />)

    expect(screen.getAllByRole('listitem')[0]).toHaveAccessibleName('FY 2024: revenue 10.00B')
  })

  it('renders nothing with fewer than two years of revenue', () => {
    const { container } = render(<MiniFinancials annual={[year(2025, 12e9, 1e9), year(2024, null, 1e9)]} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('fills a loss with the negative colour, hanging from the baseline of the gains', () => {
    render(<MiniFinancials annual={[year(2024, 10e9, -2e9), year(2025, 12e9, 1e9)]} />)

    const bars = screen.getAllByTestId('mini-bar')
    const loss = bars.find((bar) => bar.dataset.series === 'net_income' && bar.style.backgroundColor === colour(NEGATIVE))
    const revenue = bars.find((bar) => bar.dataset.series === 'revenue')
    expect(loss).toBeDefined()
    expect(parseFloat(loss.style.top)).toBeGreaterThanOrEqual(parseFloat(revenue.style.top) + parseFloat(revenue.style.height) - 0.001)
  })

  it('keeps the series colour for a profit', () => {
    render(<MiniFinancials annual={[year(2024, 10e9, 2e9), year(2025, 12e9, 1e9)]} />)

    const profits = screen.getAllByTestId('mini-bar').filter((bar) => bar.dataset.series === 'net_income')
    profits.forEach((bar) => expect(bar.style.backgroundColor).toBe(colour(STATEMENT_SERIES.net_income)))
  })

  it('puts the year label in the flow under the bars, not over them', () => {
    render(<MiniFinancials annual={[year(2024, 10e9, 2e9), year(2025, 12e9, 1e9)]} />)

    const label = screen.getByText('2024')
    expect(label.className).not.toMatch(/absolute/)
    expect(label.className).toMatch(/mt-1/)
  })
})
