import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, render, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AccountTransactions from './AccountTransactions'

vi.mock('../api/queries')
import * as queries from '../api/queries'

// AccountTransactions needs a Route match (not just a URL) for useParams to
// resolve :accountId - renderWithProviders already supplies its own
// MemoryRouter, and React Router refuses to render one Router inside
// another, so this builds the same providers directly instead (same pattern
// as RequireAuth.test.jsx / NotFound.test.jsx).
function renderAt(id) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/accounts/${id}`]}>
        <Routes>
          <Route path="/accounts/:accountId" element={<AccountTransactions />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

const KBC = {
  id: 5, bank: 'KBC', type: 'Current account', iban_masked: 'BE12 •••• •••• 0001',
  balance: '1842.17', available: '1842.17', accent: '#0284c7',
}

describe('AccountTransactions', () => {
  beforeEach(() => {
    queries.useUpdateBankTransactionCategory.mockReturnValue({ mutate: vi.fn() })
    queries.useBankAccounts.mockReturnValue({ data: [KBC] })
  })

  it('renders the transactions for the account in the URL', () => {
    queries.useBankTransactions.mockReturnValue({
      data: [{ id: 1, booking_date: '2026-01-05', counterparty_name: 'COLRUYT', amount: '-40.00', currency: 'EUR', effective_category: 'GROCERIES' }],
      isLoading: false, error: null,
    })

    renderAt(5)

    expect(queries.useBankTransactions).toHaveBeenCalledWith('?account=5')
    expect(screen.getByText('COLRUYT')).toBeInTheDocument()
  })

  it('shows which account you drilled into: bank name, balance, and IBAN', () => {
    queries.useBankTransactions.mockReturnValue({
      data: [], isLoading: false, error: null,
    })

    renderAt(5)

    expect(screen.getByRole('heading', { name: 'KBC' })).toBeInTheDocument()
    expect(screen.getByText('€1,842.17')).toBeInTheDocument()
    expect(screen.getByText('BE12 •••• •••• 0001')).toBeInTheDocument()
  })

  it('lets you correct a transaction\'s category', async () => {
    const mutate = vi.fn()
    queries.useBankTransactions.mockReturnValue({
      data: [{ id: 1, booking_date: '2026-01-05', counterparty_name: 'COLRUYT', amount: '-40.00', currency: 'EUR', effective_category: 'GROCERIES' }],
      isLoading: false, error: null,
    })
    queries.useUpdateBankTransactionCategory.mockReturnValue({ mutate })

    renderAt(5)
    fireEvent.change(screen.getAllByLabelText('Category for COLRUYT')[0], { target: { value: 'DINING' } })

    expect(mutate).toHaveBeenCalledWith({ id: 1, category: 'DINING' })
  })

  it('says so when the account id matches nothing', () => {
    queries.useBankTransactions.mockReturnValue({ data: [], isLoading: false, error: null })

    renderAt(99)

    expect(screen.getByRole('heading', { name: 'Account not found' })).toBeInTheDocument()
    expect(screen.getByText('No account with this id')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('narrows the rows as you type in the search box', () => {
    queries.useBankTransactions.mockReturnValue({
      data: [
        { id: 1, booking_date: '2026-01-05', counterparty_name: 'COLRUYT', description: '', amount: '-40.00', effective_category: 'GROCERIES' },
        { id: 2, booking_date: '2026-01-06', counterparty_name: 'NMBS', description: '', amount: '-9.00', effective_category: 'TRANSPORT' },
      ],
      isLoading: false, error: null,
    })

    renderAt(5)
    fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'nmbs' } })

    expect(screen.queryByText('COLRUYT')).not.toBeInTheDocument()
    expect(screen.getByText('NMBS')).toBeInTheDocument()
  })

  it('signs amounts and shows a differing description under the name', () => {
    queries.useBankTransactions.mockReturnValue({
      data: [
        { id: 1, booking_date: '2026-01-05', counterparty_name: 'ACME', description: 'Salary January', amount: '2500.00', effective_category: 'INCOME' },
        { id: 2, booking_date: '2026-01-06', counterparty_name: 'NMBS', description: '', amount: '-9.00', effective_category: 'TRANSPORT' },
      ],
      isLoading: false, error: null,
    })

    renderAt(5)

    expect(screen.getByText('+€2,500.00')).toBeInTheDocument()
    expect(screen.getByText('-€9.00')).toBeInTheDocument()
    expect(screen.getByText('Salary January')).toBeInTheDocument()
  })

  it('truncates a long description to one line and keeps the full text in the title', () => {
    const raw = 'NYX*CandySnackService|.|02-10-2026|.|11:07|.|Meule|.|BE|.|524784XXXXXX0999 |.| |.|'
    queries.useBankTransactions.mockReturnValue({
      data: [{ id: 1, booking_date: '2026-01-05', counterparty_name: 'NYX', description: raw, amount: '-3.00', effective_category: 'GROCERIES' }],
      isLoading: false, error: null,
    })

    renderAt(5)

    const description = screen.getByText(raw)
    expect(description).toHaveAttribute('title', raw)
    expect(description).toHaveClass('truncate')
    expect(screen.getByText('NYX')).toHaveClass('truncate')
  })

  it('pages through long lists and resets to page 1 when filtering', () => {
    const data = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1, booking_date: '2026-01-05', counterparty_name: `SHOP ${i + 1}`, description: '', amount: '-1.00', effective_category: 'GROCERIES',
    }))
    queries.useBankTransactions.mockReturnValue({ data, isLoading: false, error: null })

    renderAt(5)
    expect(screen.getByText('Showing 1–25 of 30')).toBeInTheDocument()
    expect(screen.getByLabelText('Previous page')).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('Showing 26–30 of 30')).toBeInTheDocument()
    expect(screen.getByLabelText('Next page')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'shop' } })
    expect(screen.getByText('Showing 1–25 of 30')).toBeInTheDocument()
  })

  it('offers to clear filters that match nothing', () => {
    queries.useBankTransactions.mockReturnValue({
      data: [{ id: 1, booking_date: '2026-01-05', counterparty_name: 'COLRUYT', description: '', amount: '-40.00', effective_category: 'GROCERIES' }],
      isLoading: false, error: null,
    })

    renderAt(5)
    fireEvent.change(screen.getByLabelText('Search transactions'), { target: { value: 'zzz' } })
    expect(screen.getByText('No transactions match your filters.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('COLRUYT')).toBeInTheDocument()
  })

  it('filters by category', () => {
    queries.useBankTransactions.mockReturnValue({
      data: [
        { id: 1, booking_date: '2026-01-05', counterparty_name: 'COLRUYT', description: '', amount: '-40.00', effective_category: 'GROCERIES' },
        { id: 2, booking_date: '2026-01-06', counterparty_name: 'NMBS', description: '', amount: '-9.00', effective_category: 'TRANSPORT' },
      ],
      isLoading: false, error: null,
    })

    renderAt(5)
    fireEvent.change(screen.getByLabelText('Filter by category'), { target: { value: 'TRANSPORT' } })

    expect(screen.queryByText('COLRUYT')).not.toBeInTheDocument()
    expect(screen.getByText('NMBS')).toBeInTheDocument()
  })
})

describe('AccountTransactions on mobile', () => {
  beforeEach(() => {
    queries.useUpdateBankTransactionCategory.mockReturnValue({ mutate: vi.fn() })
    queries.useBankAccounts.mockReturnValue({ data: [KBC] })
  })

  it('keeps date, description and amount visible below md and shows the category as a subline', () => {
    queries.useBankTransactions.mockReturnValue({
      data: [{ id: 1, booking_date: '2026-01-05', counterparty_name: 'COLRUYT', amount: '-40.00', currency: 'EUR', effective_category: 'GROCERIES' }],
      isLoading: false, error: null,
    })
    renderAt(5)
    for (const name of ['Date', 'Description', 'Amount']) {
      expect(screen.getByRole('columnheader', { name })).not.toHaveClass('hidden')
    }
    expect(screen.getByRole('columnheader', { name: 'Category' })).toHaveClass('hidden', 'md:table-cell')
    const desktopSelect = screen.getAllByLabelText('Category for COLRUYT').find((el) => !el.closest('.md\\:hidden'))
    expect(desktopSelect.closest('td')).toHaveClass('hidden', 'md:table-cell')
  })

  it('lets a phone recategorise from the below-md subline', () => {
    const mutate = vi.fn()
    queries.useUpdateBankTransactionCategory.mockReturnValue({ mutate })
    queries.useBankTransactions.mockReturnValue({
      data: [{ id: 7, booking_date: '2026-01-05', counterparty_name: 'COLRUYT', amount: '-40.00', currency: 'EUR', effective_category: 'GROCERIES' }],
      isLoading: false, error: null,
    })
    renderAt(5)
    const selects = screen.getAllByLabelText('Category for COLRUYT')
    expect(selects).toHaveLength(2)
    const mobile = selects.find((el) => el.closest('.md\\:hidden'))
    expect(mobile.closest('td')).not.toHaveClass('hidden')
    fireEvent.change(mobile, { target: { value: 'DINING' } })
    expect(mutate).toHaveBeenCalledWith({ id: 7, category: 'DINING' })
  })
})
