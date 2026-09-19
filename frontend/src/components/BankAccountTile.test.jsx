import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import BankAccountTile from './BankAccountTile'

describe('BankAccountTile', () => {
  it('shows the account balance, bank, and masked IBAN', () => {
    renderWithProviders(
      <BankAccountTile
        account={{
          id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'BE12 •••• •••• 0001',
          balance: '1842.17', available: '1842.17', gradient: 'from-sky-500 to-sky-700', accent: '#0284c7',
        }}
        recentTransactions={[]}
      />,
    )

    expect(screen.getByText('KBC')).toBeInTheDocument()
    expect(screen.getByText('Current account')).toBeInTheDocument()
    expect(screen.getByText('BE12 •••• •••• 0001')).toBeInTheDocument()
    expect(screen.getByText('€1,842.17')).toBeInTheDocument()
  })

  it('does not show an available-balance line when available equals balance', () => {
    renderWithProviders(
      <BankAccountTile
        account={{ id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'x', balance: '100.00', available: '100.00', gradient: 'from-sky-500 to-sky-700', accent: '#0284c7' }}
        recentTransactions={[]}
      />,
    )
    expect(screen.queryByText(/available/)).not.toBeInTheDocument()
  })

  it('shows an available-balance line when it differs from balance', () => {
    renderWithProviders(
      <BankAccountTile
        account={{ id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'x', balance: '100.00', available: '80.00', gradient: 'from-sky-500 to-sky-700', accent: '#0284c7' }}
        recentTransactions={[]}
      />,
    )
    expect(screen.getByText('€80.00 available')).toBeInTheDocument()
  })

  it('lists up to two recent transactions for this account', () => {
    renderWithProviders(
      <BankAccountTile
        account={{ id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'x', balance: '100.00', available: '100.00', gradient: 'from-sky-500 to-sky-700', accent: '#0284c7' }}
        recentTransactions={[
          { id: 1, booking_date: '2026-09-19', counterparty_name: 'Colruyt', amount: '-60.85', effective_category: 'GROCERIES' },
          { id: 2, booking_date: '2026-09-18', counterparty_name: 'NMBS', amount: '-65.00', effective_category: 'TRANSPORT' },
        ]}
      />,
    )
    expect(screen.getByText('Colruyt')).toBeInTheDocument()
    expect(screen.getByText('NMBS')).toBeInTheDocument()
    expect(screen.getByText('-€60.85')).toBeInTheDocument()
  })

  it('links to the account detail page', () => {
    const { container } = renderWithProviders(
      <BankAccountTile
        account={{ id: 42, bank: 'Argenta', type: 'Savings account', iban_masked: 'x', balance: '100.00', available: '100.00', gradient: 'from-amber-500 to-amber-700', accent: '#d97706' }}
        recentTransactions={[]}
      />,
    )
    expect(container.querySelector('a[href="/accounts/42"]')).toBeInTheDocument()
  })
})
