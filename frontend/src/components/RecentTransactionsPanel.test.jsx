import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import RecentTransactionsPanel from './RecentTransactionsPanel'

describe('RecentTransactionsPanel', () => {
  it('lists each transaction with its category, date, and bank name', () => {
    renderWithProviders(
      <RecentTransactionsPanel
        transactions={[
          { id: 1, booking_date: '2026-09-19', counterparty_name: 'NMBS', amount: '-65.00', effective_category: 'TRANSPORT', bank_name: 'KBC' },
          { id: 2, booking_date: '2026-09-18', counterparty_name: '', amount: '200.00', effective_category: 'TRANSFER', bank_name: 'KBC' },
        ]}
      />,
    )
    expect(screen.getByText('NMBS')).toBeInTheDocument()
    expect(screen.getByText(/2026-09-19.*Transport.*KBC/)).toBeInTheDocument()
    expect(screen.getByText('-€65.00')).toBeInTheDocument()
    expect(screen.getByText('+€200.00')).toBeInTheDocument()
  })

  it('falls back to the category label when counterparty_name is blank', () => {
    renderWithProviders(
      <RecentTransactionsPanel
        transactions={[
          { id: 1, booking_date: '2026-09-18', counterparty_name: '', amount: '200.00', effective_category: 'TRANSFER', bank_name: 'KBC' },
        ]}
      />,
    )
    expect(screen.getByText('Transfer')).toBeInTheDocument()
  })

  it('shows an empty state when there are no transactions', () => {
    renderWithProviders(<RecentTransactionsPanel transactions={[]} />)
    expect(screen.getByText(/no transactions/i)).toBeInTheDocument()
  })
})
