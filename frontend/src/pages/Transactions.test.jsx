import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { renderWithProviders } from '../test/renderWithProviders'
import Transactions from './Transactions'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const row = (overrides) => ({
  id: 1, date: '2026-09-01', type: 'BUY', instrument: 'NVIDIA', ticker: 'NVDA',
  qty: '10.0000', price: '150.00', total: '1500.00', account: 'Saxo',
  currency: 'USD', fx_rate: '0.86', total_eur: '1290.00', ...overrides,
})

function stub(rows) {
  queries.useTransactions.mockReturnValue({ data: rows, isLoading: false, error: null })
}

describe('Transactions', () => {
  beforeEach(() => vi.resetAllMocks())

  it('prices a trade in its own currency and totals it in euro with the right sign', () => {
    stub([row({ id: 1, type: 'BUY' }), row({ id: 2, type: 'SELL', ticker: 'AMD', instrument: 'AMD' })])
    renderWithProviders(<Transactions />)

    const buy = within(screen.getByRole('table')).getByText('NVDA').closest('tr')
    expect(within(buy).getByText('US$150.00')).toBeInTheDocument()
    expect(within(buy).getByText('-€1,290.00')).toBeInTheDocument()

    const sell = within(screen.getByRole('table')).getByText('AMD', { selector: 'span' }).closest('tr')
    expect(within(sell).getByText('+€1,290.00')).toBeInTheDocument()
  })

  it('shows a dash for the total when the currency was never recorded', () => {
    stub([row({ currency: null, fx_rate: null, total_eur: null })])
    renderWithProviders(<Transactions />)

    const line = within(screen.getByRole('table')).getByText('NVDA').closest('tr')
    expect(within(line).getByText('150.00')).toBeInTheDocument()
    expect(within(line).getByText('—')).toBeInTheDocument()
  })

  it('offers a chip only for the types present', () => {
    stub([row({ id: 1, type: 'BUY' }), row({ id: 2, type: 'INTEREST', ticker: '', instrument: 'Interest' })])
    renderWithProviders(<Transactions />)

    expect(screen.getByRole('button', { name: 'BUY' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'INTEREST' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'DIVIDEND' })).toBeNull()
  })

  it('falls back to All when the selected type vanishes from the data', () => {
    stub([row({ id: 1, type: 'BUY' }), row({ id: 2, type: 'INTEREST', ticker: '', instrument: 'Interest' })])
    const { rerender } = renderWithProviders(<Transactions />)
    fireEvent.click(screen.getByRole('button', { name: 'INTEREST' }))

    stub([row({ id: 1, type: 'BUY' })])
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Transactions />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(within(screen.getByRole('table')).getByText('NVDA')).toBeInTheDocument()
  })
})

describe('Transactions on mobile', () => {
  beforeEach(() => vi.resetAllMocks())

  it('keeps date, instrument and total visible below md and hides the rest', () => {
    stub([row({ id: 1, type: 'BUY' })])
    renderWithProviders(<Transactions />)
    const table = screen.getByRole('table')
    for (const name of ['Date', 'Instrument', 'Total']) {
      expect(within(table).getByRole('columnheader', { name })).not.toHaveClass('hidden')
    }
    for (const name of ['Type', 'Ticker', 'Qty', 'Price', 'Account']) {
      expect(within(table).getByRole('columnheader', { name })).toHaveClass('hidden', 'md:table-cell')
    }
    const line = within(table).getByText('NVIDIA').closest('tr')
    expect(within(line).getByText('Saxo').closest('td')).toHaveClass('hidden', 'md:table-cell')
    expect(within(line).getByText('US$150.00').closest('td')).toHaveClass('hidden', 'md:table-cell')
    expect(within(line).getByText('BUY', { selector: 'span.md\\:hidden' })).toBeInTheDocument()
  })
  it('wraps the toolbar and its type chips and gives the search the full row on mobile', () => {
    stub([row({ id: 1, type: 'BUY' })])
    renderWithProviders(<Transactions />)

    const chips = screen.getByRole('button', { name: 'BUY' }).parentElement
    expect(chips).toHaveClass('flex-wrap')
    expect(chips.parentElement).toHaveClass('flex-wrap', 'gap-2', 'md:gap-3')
    expect(screen.getByRole('textbox').parentElement).toHaveClass('w-full', 'md:w-auto')
  })

})
