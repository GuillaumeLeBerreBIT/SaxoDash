import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { expectValidHeadingOutline } from '../test/headingOutline'
import SpendingTransactions from './SpendingTransactions'
import SpendingCategoryChart from '../components/SpendingCategoryChart'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const tx = (id, booking_date, effective_category, amount, counterparty_name = `Shop ${id}`) => ({
  id, booking_date, effective_category, amount, counterparty_name, description: '', currency: 'EUR',
})

const ROWS = [
  tx(1, '2026-09-02', 'GROCERIES', '-40.00', 'COLRUYT'),
  tx(2, '2026-09-10', 'GROCERIES', '-10.50', 'DELHAIZE'),
  tx(3, '2026-09-12', 'GROCERIES', '5.50', 'COLRUYT REFUND'),
  tx(4, '2026-09-12', 'DINING', '-20.00', 'PIZZA'),
  tx(5, '2026-09-13', 'TRANSFER', '-300.00', 'OWN ACCOUNT'),
  tx(6, '2026-08-31', 'GROCERIES', '-99.00', 'TOO EARLY'),
  tx(7, '2026-10-01', 'GROCERIES', '-77.00', 'TOO LATE'),
]

const URL = '/spending/transactions?category=GROCERIES&from=2026-09-01&to=2026-09-30'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderAt(url) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/spending/transactions" element={<SpendingTransactions />} />
          <Route path="/spending" element={<div>Spending page</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function stub(data) {
  queries.useBankTransactions.mockReturnValue({ data, isLoading: false, error: null, refetch: vi.fn() })
}

describe('SpendingTransactions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    queries.useUpdateBankTransactionCategory.mockReturnValue({ mutate: vi.fn() })
    stub(ROWS)
  })

  it('asks for every account, not one', () => {
    renderAt(URL)
    expect(queries.useBankTransactions).toHaveBeenCalledWith()
  })

  it('titles the page with the category and applies category and period from the URL', () => {
    renderAt(URL)
    expect(screen.getByRole('heading', { level: 1, name: 'Groceries' })).toBeInTheDocument()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('COLRUYT')).toBeInTheDocument()
    expect(table.getByText('DELHAIZE')).toBeInTheDocument()
    expect(table.getByText('COLRUYT REFUND')).toBeInTheDocument()
    expect(table.queryByText('PIZZA')).not.toBeInTheDocument()
    expect(table.queryByText('TOO EARLY')).not.toBeInTheDocument()
    expect(table.queryByText('TOO LATE')).not.toBeInTheDocument()
  })

  it('shows the period and a way back to Spending', () => {
    renderAt(URL)
    expect(screen.getByText(/01 Sep 2026/)).toBeInTheDocument()
    expect(screen.getByText(/30 Sep 2026/)).toBeInTheDocument()
    const back = screen.getByRole('link', { name: /Back to Spending/ })
    expect(back).toHaveAttribute('href', '/spending')
  })

  it('shows a count and a net total equal to what the Spending chart reports for the category', () => {
    renderAt(URL)
    const strip = screen.getByText('Net spend').closest('div').parentElement
    expect(within(strip).getByText('€45.00')).toBeInTheDocument()
    const count = screen.getByText('Transactions (incl. refunds)').parentElement
    expect(within(count).getByText('3')).toBeInTheDocument()
  })

  it('agrees with the chart on the category amount for the same data', () => {
    const period = { date_from: '2026-09-01', date_to: '2026-09-30' }
    const queryClient = new QueryClient()
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SpendingCategoryChart
            categories={[{ category: 'GROCERIES', amount: '45.00' }, { category: 'DINING', amount: '20.00' }]}
            isLoading={false}
            error={null}
            periodLabel="September 2026"
            period={period}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const link = screen.getByRole('link', { name: /Groceries/ })
    expect(within(link).getByText('€45.00')).toBeInTheDocument()
    unmount()
    renderAt(link.getAttribute('href'))
    const strip = screen.getByText('Net spend').closest('div').parentElement
    expect(within(strip).getByText('€45.00')).toBeInTheDocument()
  })

  it('leaves out transfers when the category is unknown and shows everything else', () => {
    renderAt('/spending/transactions?category=NOPE&from=2026-09-01&to=2026-09-30')
    expect(screen.getByRole('heading', { level: 1, name: 'All spending' })).toBeInTheDocument()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('PIZZA')).toBeInTheDocument()
    expect(table.getByText('COLRUYT')).toBeInTheDocument()
    expect(table.queryByText('OWN ACCOUNT')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Filter by category')).toHaveValue('ALL')
  })

  it('switching the category select updates the URL and keeps the period', () => {
    renderAt(URL)
    fireEvent.change(screen.getByLabelText('Filter by category'), { target: { value: 'DINING' } })
    expect(screen.getByTestId('location')).toHaveTextContent('category=DINING')
    expect(screen.getByTestId('location')).toHaveTextContent('from=2026-09-01')
    expect(screen.getByRole('heading', { level: 1, name: 'Dining' })).toBeInTheDocument()
  })

  it('narrows by search and clears back to the whole category', () => {
    renderAt(URL)
    fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'delhaize' } })
    const table = within(screen.getByRole('table'))
    expect(table.getByText('DELHAIZE')).toBeInTheDocument()
    expect(table.queryByText('COLRUYT')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'zzz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(within(screen.getByRole('table')).getByText('COLRUYT')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Groceries' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('totals the all-spending view like the Spending summary: only categories with a net outflow', () => {
    stub([...ROWS, tx(8, '2026-09-20', 'INCOME', '2500.00', 'EMPLOYER')])
    renderAt('/spending/transactions?from=2026-09-01&to=2026-09-30')
    const strip = screen.getByText('Total spend').closest('div').parentElement
    expect(within(strip).getByText('€65.00')).toBeInTheDocument()
    const table = within(screen.getByRole('table'))
    expect(table.queryByText('EMPLOYER')).not.toBeInTheDocument()
    expect(table.getByText('PIZZA')).toBeInTheDocument()
    const count = screen.getByText('Transactions (incl. refunds)').parentElement
    expect(within(count).getByText('4')).toBeInTheDocument()
    const options = within(screen.getByLabelText('Filter by category')).getAllByRole('option').map((o) => o.value)
    expect(options).toEqual(expect.arrayContaining(['ALL', 'GROCERIES', 'DINING']))
    expect(options).not.toContain('INCOME')
  })

  it('shows a category that is net positive by URL as a net credit, not a negative spend', () => {
    stub([...ROWS, tx(8, '2026-09-20', 'INCOME', '2500.00', 'EMPLOYER')])
    renderAt('/spending/transactions?category=INCOME&from=2026-09-01&to=2026-09-30')
    expect(within(screen.getByRole('table')).getByText('EMPLOYER')).toBeInTheDocument()
    expect(screen.queryByText('Net spend')).not.toBeInTheDocument()
    const strip = screen.getByText('Net credit').closest('div').parentElement
    expect(within(strip).getByText('€2,500.00')).toBeInTheDocument()
  })

  it.each(['TRANSFER', 'SAVINGS'])('treats ?category=%s like an unknown code', (code) => {
    renderAt(`/spending/transactions?category=${code}&from=2026-09-01&to=2026-09-30`)
    expect(screen.getByRole('heading', { level: 1, name: 'All spending' })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).queryByText('OWN ACCOUNT')).not.toBeInTheDocument()
  })

  it('treats an impossible calendar date in the URL as no bound', () => {
    renderAt('/spending/transactions?category=GROCERIES&from=2026-13-45&to=2026-09-30')
    expect(screen.queryByText(/13 /)).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('TOO EARLY')).toBeInTheDocument()
  })

  it('resets the search and page when the URL moves to another drill-down', () => {
    stub(Array.from({ length: 30 }, (_, i) => tx(100 + i, '2026-09-05', 'GROCERIES', '-1.00', `Store ${i}`)))
    renderAt(URL)
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Showing 26–30 of 30')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'store 2' } })
    const select = screen.getByLabelText('Filter by category')
    select.focus()
    fireEvent.change(select, { target: { value: 'ALL' } })
    expect(document.activeElement).toBe(screen.getByLabelText('Filter by category'))
    expect(screen.getByLabelText('Search transactions')).toHaveValue('')
    expect(screen.getByText('Showing 1–25 of 30')).toBeInTheDocument()
  })

  it('says so when there is no spending in the period', () => {
    renderAt('/spending/transactions?category=TRAVEL&from=2026-09-01&to=2026-09-30')
    expect(screen.getByText('No spending in this period.')).toBeInTheDocument()
  })

  it('shows an empty list, not an error, when from is after to', () => {
    renderAt('/spending/transactions?category=GROCERIES&from=2026-09-30&to=2026-09-01')
    expect(screen.getByText('No spending in this period.')).toBeInTheDocument()
  })

  it('pages through long lists', () => {
    stub(Array.from({ length: 30 }, (_, i) => tx(100 + i, '2026-09-05', 'GROCERIES', '-1.00', `Store ${i}`)))
    renderAt(URL)
    expect(screen.getByText('Showing 1–25 of 30')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Showing 26–30 of 30')).toBeInTheDocument()
  })

  it('has one h1 and no skipped level when populated', () => {
    const { container } = renderAt(URL)
    expectValidHeadingOutline(container)
  })

  it('keeps the h1 while loading', () => {
    queries.useBankTransactions.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { container } = renderAt(URL)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expectValidHeadingOutline(container)
  })

  it('keeps the h1 and offers a retry in error', () => {
    const refetch = vi.fn()
    queries.useBankTransactions.mockReturnValue({ data: undefined, isLoading: false, error: new Error('x'), refetch })
    const { container } = renderAt(URL)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expectValidHeadingOutline(container)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })
})
