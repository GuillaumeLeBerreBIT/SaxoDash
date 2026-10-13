import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import RatioHistoryTable from './RatioHistoryTable'

const history = [
  { period: '2023-09-30', pe: 29.1, gross_margin: 44.13 },
  { period: '2024-09-28', pe: 37.2, gross_margin: 46.21, current_ratio: 0.87 },
  { period: '2025-09-27', pe: 33.56, gross_margin: 46.91, current_ratio: 0.89 },
]
const current = { pe_ratio: 34.8, gross_margin: 48.65 }

describe('RatioHistoryTable', () => {
  it('has a column per fiscal year and one for today', () => {
    render(<RatioHistoryTable history={history} current={current} />)

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(['Ratio', '2023', '2024', '2025', 'Current'])
  })

  it('keeps column headers distinct when a fiscal year end moved within a calendar year', () => {
    const shifted = [
      { period: '2023-12-31', pe: 20 },
      { period: '2024-01-31', pe: 21 },
      { period: '2024-12-31', pe: 22 },
    ]
    render(<RatioHistoryTable history={shifted} current={current} />)

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(new Set(headers).size).toBe(5)
    expect(headers[1]).toBe('2023')
  })

  it('prints each ratio across the years and its current figure', () => {
    render(<RatioHistoryTable history={history} current={current} />)

    const pe = screen.getByRole('rowheader', { name: 'P/E' }).closest('tr')
    expect(within(pe).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['29.10', '37.20', '33.56', '34.80'])
    const margin = screen.getByRole('rowheader', { name: 'Gross margin' }).closest('tr')
    expect(within(margin).getAllByRole('cell').at(-1)).toHaveTextContent('48.65%')
  })

  it('prints a dash where a year or the current figure is missing', () => {
    render(<RatioHistoryTable history={history} current={current} />)

    const ratio = screen.getByRole('rowheader', { name: 'Current ratio' }).closest('tr')
    expect(within(ratio).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['—', '0.87', '0.89', '—'])
  })

  it('titles each group that has a ratio and skips the rest', () => {
    render(<RatioHistoryTable history={history} current={current} />)

    expect(screen.getByText('Valuation')).toBeInTheDocument()
    expect(screen.getByText('Liquidity')).toBeInTheDocument()
    expect(screen.queryByText('Solvency')).not.toBeInTheDocument()
  })

  it('renders nothing without a history', () => {
    const { container } = render(<RatioHistoryTable history={undefined} current={current} />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('RatioHistoryTable layout', () => {
  it('pins the ratio names while the years scroll', () => {
    render(<RatioHistoryTable history={history} current={current} />)

    expect(screen.getByRole('columnheader', { name: 'Ratio' }).className).toMatch(/sticky left-0 bg-zinc-900/)
    expect(screen.getByRole('rowheader', { name: 'P/E' }).className).toMatch(/sticky left-0 bg-zinc-900/)
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
    const { container, rerender } = render(<RatioHistoryTable history={history.slice(1)} current={current} />)
    const wrapper = container.querySelector('.overflow-x-auto')
    expect(wrapper.scrollLeft).toBe(640)

    wrapper.scrollLeft = 0
    rerender(<RatioHistoryTable history={history} current={current} />)

    expect(wrapper.scrollLeft).toBe(640)
  })
})
