import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import InsiderTransactions from './InsiderTransactions'

const trade = (overrides = {}) => ({
  date: '2026-09-12',
  filed: '2026-09-14',
  name: 'COXE TENCH',
  code: 'S',
  shares: -1500,
  price: 120.5,
  value: 180750,
  holdings: 40000,
  ...overrides,
})

const many = (count, overrides = {}) => Array.from({ length: count }, (_, i) => trade({ name: `Insider ${i}`, ...overrides }))
const bodyRows = () => within(screen.getAllByRole('rowgroup')[1]).getAllByRole('row')

describe('InsiderTransactions', () => {
  it('shows the columns as real headers inside a scrolling wrapper', () => {
    const { container } = render(<InsiderTransactions transactions={[trade()]} />)

    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((header) => header.textContent)).toEqual(['Date', 'Insider', 'Type', 'Shares', 'Price', 'Value', 'Holding after'])
    headers.forEach((header) => expect(header).toHaveAttribute('scope', 'col'))
    expect(container.querySelector('.overflow-x-auto')).toContainElement(screen.getByRole('table'))
  })

  it('prints every trade value in one compact dollar format', () => {
    render(<InsiderTransactions transactions={[trade({ value: 3_417_500 }), trade({ name: 'Other', value: 950 })]} />)

    expect(screen.getByText('$3.42M')).toBeInTheDocument()
    expect(screen.getByText('$950')).toBeInTheDocument()
  })

  it('names the table for assistive technology', () => {
    render(<InsiderTransactions transactions={[trade()]} />)

    expect(screen.getByRole('table', { name: 'Insider transactions' })).toBeInTheDocument()
  })

  it('formats a trade row', () => {
    render(<InsiderTransactions transactions={[trade()]} />)

    const row = bodyRows()[0]
    expect(within(row).getByText('12 Sep 2026')).toBeInTheDocument()
    expect(within(row).getByText('Coxe Tench')).toBeInTheDocument()
    expect(within(row).getByText('Sell')).toBeInTheDocument()
    expect(within(row).getByText('-1,500')).toHaveClass('text-red-400')
    expect(within(row).getByText('US$120.50')).toBeInTheDocument()
    expect(within(row).getByText('$180.75K')).toBeInTheDocument()
    expect(within(row).getByText('40,000')).toBeInTheDocument()
  })

  it('colours a purchase by its sign', () => {
    render(<InsiderTransactions transactions={[trade({ code: 'P', shares: 800, value: 96400 })]} />)

    expect(screen.getByText('+800')).toHaveClass('text-emerald-400')
  })

  it('prints dashes for a missing price and value', () => {
    render(<InsiderTransactions transactions={[trade({ price: null, value: null })]} />)

    const cells = within(bodyRows()[0]).getAllByRole('cell')
    expect(cells[4]).toHaveTextContent('—')
    expect(cells[5]).toHaveTextContent('—')
  })

  it('defaults to open-market trades and switches to all', async () => {
    const transactions = [trade(), trade({ code: 'A', name: 'AWARDEE', shares: 100, price: null, value: null }), trade({ code: 'P', shares: 5 })]
    render(<InsiderTransactions transactions={transactions} />)

    expect(screen.getByRole('button', { name: 'Open market' })).toHaveAttribute('aria-pressed', 'true')
    expect(bodyRows()).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(bodyRows()).toHaveLength(3)
    expect(screen.getByText('Award')).toBeInTheDocument()
  })

  it('shows 15 rows and reveals the rest with Show all', async () => {
    render(<InsiderTransactions transactions={many(20)} />)

    expect(bodyRows()).toHaveLength(15)
    await userEvent.click(screen.getByRole('button', { name: 'Show all 20' }))
    expect(bodyRows()).toHaveLength(20)
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })

  it('has no Show all button at 15 rows or fewer', () => {
    render(<InsiderTransactions transactions={many(15)} />)

    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument()
  })

  it('says when a scope shows only the newest of more trades', async () => {
    const transactions = [...many(3), ...many(4, { code: 'A' })]
    render(<InsiderTransactions transactions={transactions} counts={{ open_market: 9, other: 40 }} />)

    expect(screen.getByText('Showing the newest 3 of 9.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'All' }))

    expect(screen.getByText('Showing the newest 7 of 49.')).toBeInTheDocument()
  })

  it('says nothing about a subset when nothing was cut or no counts came', () => {
    const { rerender } = render(<InsiderTransactions transactions={many(3)} counts={{ open_market: 3, other: 0 }} />)
    expect(screen.queryByText(/Showing the newest/)).not.toBeInTheDocument()

    rerender(<InsiderTransactions transactions={many(3)} />)
    expect(screen.queryByText(/Showing the newest/)).not.toBeInTheDocument()
  })

  it('says so when there are no open-market trades', () => {
    render(<InsiderTransactions transactions={[trade({ code: 'A' })]} />)

    expect(screen.getByText('No open-market trades in this period.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says so when there are no transactions at all', async () => {
    render(<InsiderTransactions transactions={[]} />)

    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(screen.getByText('No transactions in this period.')).toBeInTheDocument()
  })
})
