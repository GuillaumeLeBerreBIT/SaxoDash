import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen, render } from '@testing-library/react'
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
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'DINING' } })

    expect(mutate).toHaveBeenCalledWith({ id: 1, category: 'DINING' })
  })
})
