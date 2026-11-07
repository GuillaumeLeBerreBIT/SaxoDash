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
          balance: '1842.17', available: '1842.17', accent: '#0284c7',
        }}
      />,
    )

    expect(screen.getByText('KBC')).toBeInTheDocument()
    expect(screen.getByText('Current account')).toBeInTheDocument()
    expect(screen.getByText('BE12 •••• •••• 0001')).toBeInTheDocument()
    expect(screen.getByText('€1,842.17')).toBeInTheDocument()
  })

  it('links to the account page by default, and is plain when not linked', () => {
    const account = { id: 7, bank: 'KBC', type: 'Current account', iban_masked: 'x', balance: '1.00', available: '1.00', accent: '#0284c7' }
    const { unmount } = renderWithProviders(<BankAccountTile account={account} />)
    expect(screen.getByRole('link', { name: /KBC/ })).toHaveAttribute('href', '/money/accounts/7')
    unmount()

    renderWithProviders(<BankAccountTile account={account} linked={false} />)
    expect(screen.getByText('KBC')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('does not show an available-balance line when available equals balance', () => {
    renderWithProviders(
      <BankAccountTile
        account={{ id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'x', balance: '100.00', available: '100.00', accent: '#0284c7' }}
      />,
    )
    expect(screen.queryByText(/available/)).not.toBeInTheDocument()
  })

  it('shows an available-balance line when it differs from balance', () => {
    renderWithProviders(
      <BankAccountTile
        account={{ id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'x', balance: '100.00', available: '80.00', accent: '#0284c7' }}
      />,
    )
    expect(screen.getByText('€80.00 available')).toBeInTheDocument()
  })

  it('links to the account detail page', () => {
    const { container } = renderWithProviders(
      <BankAccountTile
        account={{ id: 42, bank: 'Argenta', type: 'Savings account', iban_masked: 'x', balance: '100.00', available: '100.00', accent: '#d97706' }}
      />,
    )
    expect(container.querySelector('a[href="/money/accounts/42"]')).toBeInTheDocument()
  })

  it('uses the flat Card language, not a skeuomorphic gradient card', () => {
    // Regression test for the 2026-09 UI audit's top finding: this was the
    // only rounded-2xl element anywhere in the app.
    const { container } = renderWithProviders(
      <BankAccountTile
        account={{ id: 1, bank: 'KBC', type: 'Current account', iban_masked: 'x', balance: '100.00', available: '100.00', accent: '#0284c7' }}
      />,
    )
    expect(container.querySelector('.rounded-2xl')).not.toBeInTheDocument()
    expect(container.querySelector('[class*="bg-gradient-to-br"]')).not.toBeInTheDocument()
  })
})
