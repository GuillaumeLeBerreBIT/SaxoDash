import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { expectValidHeadingOutline } from '../test/headingOutline'
import { LEGACY_REDIRECTS } from '../lib/navigation'
import { resolvePeriod } from '../lib/periods'
import LegacyRedirect from '../routes/LegacyRedirect'
import Money from './Money'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const KBC = {
  id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'BE12 •••• •••• 0001',
  balance: '1842.17', available: '1842.17', currency: 'EUR', accent: '#0284c7', external_id: 'enablebanking:kbc:acc-1',
}

function mockMoney({ netWorth, budgets = [], summary } = {}) {
  const ok = (data) => ({ data, isLoading: false, error: null, refetch: vi.fn() })
  queries.useBankAccounts.mockReturnValue(ok([KBC]))
  queries.useBankTransactions.mockReturnValue(ok([]))
  queries.useNetWorth.mockReturnValue(
    ok(netWorth === undefined ? { bank_total: '2342.17', bank_only_total: '1842.17', broker_cash: '500.00' } : netWorth),
  )
  queries.useSpendingSummary.mockReturnValue(
    ok(summary ?? { categories: [{ category: 'GROCERIES', amount: '120.00' }], total: '175.33', transfers: '0.00', transaction_count: 4, previous_period: null }),
  )
  queries.useSubscriptions.mockReturnValue(ok([]))
  queries.useDismissSubscription.mockReturnValue({ mutate: vi.fn() })
  queries.useSpendingTrend.mockReturnValue(ok([]))
  queries.useBudgetProgress.mockReturnValue(ok(budgets))
  queries.useSetBudget.mockReturnValue({ mutate: vi.fn() })
  queries.useUpdateBankTransactionCategory.mockReturnValue({ mutate: vi.fn() })
  queries.useMarkTransactionReviewed.mockReturnValue({ mutate: vi.fn() })
  queries.useEnableBankingStatus.mockReturnValue(ok(null))
  queries.useSyncNow.mockReturnValue({ syncNow: vi.fn(), syncing: false, queueError: null, note: '' })
  queries.useNetWorthHistory.mockReturnValue(ok([]))
  queries.useLabeledAccounts.mockReturnValue(ok([]))
  queries.useLabeledAccountCandidates.mockReturnValue(ok([]))
  queries.useCreateLabeledAccount.mockReturnValue({ mutate: vi.fn(), isPending: false })
  queries.useDeleteLabeledAccount.mockReturnValue({ mutate: vi.fn() })
}

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function renderAt(url) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/money" element={<Money />} />
          {LEGACY_REDIRECTS.map((redirect) => (
            <Route key={redirect.from} path={`/${redirect.from}`} element={<LegacyRedirect redirect={redirect} />} />
          ))}
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Money', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockMoney()
  })

  it.each([
    ['/money', 'Money'],
    ['/money?section=overview', 'Money'],
    ['/money?section=accounts', 'Accounts'],
    ['/money?section=spending', 'Spending'],
    ['/money?section=budgets', 'Budgets'],
    ['/money?section=transactions', 'All spending'],
    ['/money?section=nonsense', 'Money'],
  ])('Money sections route by query: %s shows %s', (url, heading) => {
    const { container } = renderAt(url)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    expectValidHeadingOutline(container)
  })

  it('marks the section in the URL as the selected sub-tab', () => {
    renderAt('/money?section=budgets')
    const tabs = within(screen.getByRole('tablist', { name: 'Money sections' }))
    expect(tabs.getByRole('tab', { name: 'Budgets' })).toHaveAttribute('aria-selected', 'true')
    expect(tabs.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview', 'Accounts', 'Spending', 'Budgets', 'Transactions',
    ])
  })

  it('switches section through the sub-tabs and drops the old section filters', () => {
    renderAt('/money?section=transactions&category=GROCERIES')
    fireEvent.click(screen.getByRole('tab', { name: 'Accounts' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/money\?section=accounts$/)
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/money$/)
  })

  it('/spending?period=3m lands on Money · Spending with 3 months picked', () => {
    renderAt('/spending?period=3m')
    expect(screen.getByTestId('where')).toHaveTextContent('/money?section=spending&period=3m')
    expect(screen.getByRole('heading', { level: 1, name: 'Spending' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Select period' })).toHaveValue('last_3_months')
    const { date_from: from } = resolvePeriod('last_3_months')
    expect(queries.useSpendingSummary).toHaveBeenLastCalledWith(expect.stringContaining(`date_from=${from}`))
  })

  it('keeps a picked preset period in the URL', () => {
    renderAt('/money?section=spending')
    fireEvent.change(screen.getByRole('combobox', { name: 'Select period' }), { target: { value: 'last_month' } })
    expect(screen.getByTestId('where')).toHaveTextContent('/money?section=spending&period=1m')
    fireEvent.change(screen.getByRole('combobox', { name: 'Select period' }), { target: { value: 'this_month' } })
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/money\?section=spending$/)
  })

  it('composes cash, spending, budgets, review queue, subscriptions and the category chart on the overview', () => {
    queries.useBankTransactions.mockImplementation((query) => ({
      data: query === '?needs_review=true'
        ? [{ id: 9, booking_date: '2026-10-29', counterparty_name: 'UNKNOWN SHOP', amount: '-38.20', effective_category: 'OTHER' }]
        : [],
      isLoading: false,
      error: null,
    }))
    queries.useSubscriptions.mockReturnValue({
      data: [{ id: 1, display_name: 'NETFLIX.COM', expected_amount: '12.99', cadence: 'monthly', dismissed: false }],
      isLoading: false,
      error: null,
    })
    renderAt('/money')
    expect(screen.getByRole('heading', { name: 'Cash' })).toBeInTheDocument()
    expect(screen.getByText('€2,342.17')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Spent this month' })).toBeInTheDocument()
    expect(screen.getByText('€175.33')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Budgets' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Needs review/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Subscriptions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Spending by category' })).toBeInTheDocument()
  })

  it('splits cash into bank and Saxo from the net-worth figures', () => {
    renderAt('/money')
    const cash = screen.getByRole('heading', { name: 'Cash' }).closest('.sd-panel')
    expect(within(cash).getByText('€1,842.17')).toBeInTheDocument()
    expect(within(cash).getByText('€500.00')).toBeInTheDocument()
  })

  it('shows a dash, not zero, for cash it was not given', () => {
    mockMoney({ netWorth: null })
    renderAt('/money')
    const cash = screen.getByRole('heading', { name: 'Cash' }).closest('.sd-panel')
    expect(within(cash).queryByText('€0.00')).not.toBeInTheDocument()
    expect(within(cash).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('totals what is left across budgets, and says when none are set', () => {
    mockMoney({
      budgets: [
        { category: 'GROCERIES', limit: '400.00', spent: '342.18', pct: 85.5 },
        { category: 'DINING', limit: '150.00', spent: '196.40', pct: 130.9 },
      ],
    })
    const { unmount } = renderAt('/money')
    const left = screen.getByRole('heading', { name: 'Budget left' }).closest('.sd-panel')
    expect(within(left).getByText('€11.42')).toBeInTheDocument()
    expect(within(left).getByText('of €550.00 across 2 budgets')).toBeInTheDocument()
    unmount()

    mockMoney({ budgets: [] })
    renderAt('/money')
    const none = screen.getByRole('heading', { name: 'Budget left' }).closest('.sd-panel')
    expect(within(none).getByText('—')).toBeInTheDocument()
    expect(within(none).getByText('No budgets set yet')).toBeInTheDocument()
  })

  it('links the overview to the spending section', () => {
    renderAt('/money')
    expect(screen.getByRole('link', { name: 'Spending →' })).toHaveAttribute('href', '/money?section=spending')
  })
})
