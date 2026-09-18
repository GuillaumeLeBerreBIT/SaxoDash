import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import Accounts from './Accounts'

vi.mock('../api/queries')
import * as queries from '../api/queries'

describe('Accounts', () => {
  it('links each account card to its drill-down page', () => {
    queries.useBankAccounts.mockReturnValue({
      data: [{ id: 5, external_id: 'enablebanking:kbc:acc-1', bank: 'KBC', type: 'Current account', iban_masked: 'BE12 •••• •••• 0001', balance: '100.00', available: '100.00' }],
      isLoading: false, error: null,
    })
    // Accounts.jsx also renders EnableBankingConnectionStatus and the
    // balance/cash-flow charts, each backed by its own hook - these need a
    // non-crashing default so the destructured hook results aren't undefined.
    queries.useEnableBankingStatus.mockReturnValue({ data: null, isLoading: false, error: null })
    queries.useNetWorthHistory.mockReturnValue({ data: [], isLoading: false, error: null })
    queries.useCashFlow.mockReturnValue({ data: [], isLoading: false, error: null })

    renderWithProviders(<Accounts />)

    const link = screen.getByRole('link', { name: /KBC/ })
    expect(link).toHaveAttribute('href', '/accounts/5')
  })
})
