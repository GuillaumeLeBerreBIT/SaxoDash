import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectValidHeadingOutline } from '../test/headingOutline'
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

  it('has exactly one h1 and no skipped heading level', () => {
    stub([row({ id: 1, type: 'BUY' })])
    const { container } = renderWithProviders(<Transactions />)
    expectValidHeadingOutline(container)
  })

  it('keeps one h1 and no skipped level while loading', () => {
    queries.useTransactions.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { container } = renderWithProviders(<Transactions />)
    expectValidHeadingOutline(container)
  })

  it('keeps one h1 and no skipped level while in error', () => {
    queries.useTransactions.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x'), refetch: vi.fn() })
    const { container } = renderWithProviders(<Transactions />)
    expectValidHeadingOutline(container)
  })

  it('prices a trade in its own currency and totals it in euro with the right sign', () => {
    stub([row({ id: 1, type: 'BUY' }), row({ id: 2, type: 'SELL', ticker: 'AMD', instrument: 'AMD' })])
    renderWithProviders(<Transactions />)

    const buy = within(screen.getByRole('table')).getByText('NVDA').closest('tr')
    expect(within(buy).getByText('US$150.00')).toBeInTheDocument()
    expect(within(buy).getByText('-€1,290.00')).toBeInTheDocument()

    const sell = within(screen.getByRole('table')).getByText('AMD', { selector: 'span' }).closest('tr')
    expect(within(sell).getByText('+€1,290.00')).toBeInTheDocument()
  })

  it('shows the date as day, month and year, not ISO', () => {
    stub([row({ id: 1, date: '2026-10-04' })])
    renderWithProviders(<Transactions />)
    const cells = within(screen.getByRole('table'))
    expect(cells.getByText('04 Oct 2026')).toBeInTheDocument()
    expect(cells.queryByText('2026-10-04')).not.toBeInTheDocument()
  })

  it('marks the active type filter as pressed', () => {
    stub([row({ id: 1, type: 'BUY' }), row({ id: 2, type: 'SELL' })])
    renderWithProviders(<Transactions />)

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    const sell = screen.getByRole('button', { name: 'SELL' })
    expect(sell).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(sell)
    expect(screen.getByRole('button', { name: 'SELL' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('titles the truncated instrument cell with its full name and ticker', () => {
    stub([row({ instrument: 'NVIDIA Corporation', ticker: 'NVDA' })])
    renderWithProviders(<Transactions />)
    expect(screen.getByTitle('NVIDIA Corporation (NVDA)')).toHaveClass('truncate')
  })

  it('carries ticker and account in the below-md subline', () => {
    stub([row({ type: 'BUY', ticker: 'NVDA', account: 'Saxo Main' })])
    renderWithProviders(<Transactions />)
    const subline = screen.getByText(/BUY · NVDA · Saxo Main/)
    expect(subline).toHaveClass('md:hidden')
    expect(subline.closest('td')).toHaveTextContent('NVIDIA')
  })

  it('skips an empty subline part without a stray separator', () => {
    stub([row({ type: 'BUY', ticker: 'NVDA', account: '' })])
    renderWithProviders(<Transactions />)
    expect(screen.getByText('BUY · NVDA', { selector: '.md\\:hidden' })).toBeInTheDocument()
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

  it('names the pagination controls and marks the current page', () => {
    stub(Array.from({ length: 12 }, (_, i) => row({ id: i + 1 })))
    renderWithProviders(<Transactions />)

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Page 2' })).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('clears an unmatched search and filter from the empty state', () => {
    stub([row({ id: 1, type: 'BUY' }), row({ id: 2, type: 'SELL' })])
    renderWithProviders(<Transactions />)
    fireEvent.click(screen.getByRole('button', { name: 'SELL' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz' } })

    expect(screen.getByText('No transactions match your filters.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))

    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('lets the pager wrap and renders every page button', () => {
    stub(Array.from({ length: 250 }, (_, i) => row({ id: i + 1 })))
    renderWithProviders(<Transactions />)

    const pager = screen.getByRole('button', { name: 'Page 1' }).parentElement
    expect(pager).toHaveClass('flex-wrap')
    for (let n = 1; n <= 25; n++) {
      expect(screen.getByRole('button', { name: `Page ${n}` })).toBeInTheDocument()
    }
  })

  it('offers no Clear filters when nothing is filtered', () => {
    stub([])
    renderWithProviders(<Transactions />)

    expect(screen.getByText('No transactions match your filters.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('returns to page 1 when the selected type vanishes', () => {
    const interest = Array.from({ length: 12 }, (_, i) =>
      row({ id: 100 + i, type: 'INTEREST', ticker: '', instrument: 'Interest' }))
    const buys = Array.from({ length: 12 }, (_, i) => row({ id: i + 1, type: 'BUY' }))
    stub([...buys, ...interest])
    const { rerender } = renderWithProviders(<Transactions />)
    fireEvent.click(screen.getByRole('button', { name: 'INTEREST' }))
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }))

    stub(buys)
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Transactions />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
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
    expect(within(line).getByText('BUY · NVDA · Saxo', { selector: 'span.md\\:hidden' })).toBeInTheDocument()
  })
  it('wraps the toolbar and its type chips and gives the search the full row on mobile', () => {
    stub([row({ id: 1, type: 'BUY' })])
    renderWithProviders(<Transactions />)

    const chips = screen.getByRole('button', { name: 'BUY' }).parentElement
    expect(chips).toHaveClass('flex-wrap')
    expect(chips.parentElement).toHaveClass('flex-wrap', 'gap-2', 'md:gap-3')
    expect(screen.getByRole('textbox').parentElement).toHaveClass('w-full', 'md:w-auto')
  })

  it('keeps the heading and offers Retry when transactions fail', () => {
    const refetch = vi.fn()
    queries.useTransactions.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x'), refetch })
    renderWithProviders(<Transactions />)
    expect(screen.getByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('shows a skeleton card, not bare Loading text, while loading', () => {
    queries.useTransactions.mockReturnValue({ data: undefined, isLoading: true, error: null })
    renderWithProviders(<Transactions />)
    expect(screen.getByRole('status', { name: 'Loading transactions' })).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })
})
