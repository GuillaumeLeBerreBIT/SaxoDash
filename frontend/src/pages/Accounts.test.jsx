import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import Accounts from './Accounts'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const KBC = {
  id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'BE12 •••• •••• 0001',
  balance: '1842.17', available: '1842.17', currency: 'EUR',
  gradient: 'from-sky-500 to-sky-700', accent: '#0284c7', external_id: 'enablebanking:kbc:acc-1',
}
const ARGENTA = {
  id: 2, bank: 'Argenta', type: 'Savings account', iban_masked: 'BE34 •••• •••• 0002',
  balance: '6230.00', available: '6230.00', currency: 'EUR',
  gradient: 'from-amber-500 to-amber-700', accent: '#d97706', external_id: 'enablebanking:argenta:acc-1',
}

function mockDefaults(overrides = {}) {
  queries.useBankAccounts.mockReturnValue(overrides.accounts ?? { data: [KBC, ARGENTA], isLoading: false, error: null })
  queries.useBankTransactions.mockReturnValue(
    overrides.transactions ?? {
      data: [
        { id: 1, bank_account: 1, booking_date: '2026-09-19', counterparty_name: 'NMBS', amount: '-65.00', effective_category: 'TRANSPORT' },
        { id: 2, bank_account: 1, booking_date: '2026-09-18', counterparty_name: 'Colruyt', amount: '-60.85', effective_category: 'GROCERIES' },
      ],
      isLoading: false,
      error: null,
    },
  )
  queries.useSpendingSummary.mockReturnValue(
    overrides.summary ?? {
      data: { total: '175.33', transfers: '200.00', previous_period: { total: '187.50' } },
      isLoading: false,
      error: null,
    },
  )
  // EnableBankingConnectionStatus and HistoryAreaChart (kept unchanged from
  // the previous page) are backed by these hooks - a non-crashing default
  // so the destructured hook results aren't undefined.
  queries.useEnableBankingStatus.mockReturnValue({ data: null, isLoading: false, error: null })
  queries.useNetWorthHistory.mockReturnValue({ data: [], isLoading: false, error: null })
}

describe('Accounts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the total balance across accounts', () => {
    mockDefaults()
    renderWithProviders(<Accounts />)
    expect(screen.getByText('€8,072.17')).toBeInTheDocument()
  })

  it('shows a gradient tile for each account, linking to its drill-down page', () => {
    mockDefaults()
    renderWithProviders(<Accounts />)
    expect(screen.getByText('KBC')).toBeInTheDocument()
    expect(screen.getByText('Argenta')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /KBC/ })).toHaveAttribute('href', '/accounts/1')
  })

  it("shows this month's spending and transfers from the Spending definitions", () => {
    mockDefaults()
    renderWithProviders(<Accounts />)
    expect(screen.getByText('€175.33')).toBeInTheDocument()
    expect(screen.getByText('€200.00')).toBeInTheDocument()
  })

  it('shows recent transactions with their resolved bank name', () => {
    mockDefaults()
    renderWithProviders(<Accounts />)
    expect(screen.getAllByText('NMBS').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/KBC/).length).toBeGreaterThan(0)
  })
})
