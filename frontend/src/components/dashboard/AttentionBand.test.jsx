import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import AttentionBand from './AttentionBand'

describe('AttentionBand', () => {
  it('renders warn and info chips', () => {
    renderWithProviders(
      <AttentionBand
        items={[
          { kind: 'concentration', severity: 'warn', text: 'Top 3 holdings are 61% of the portfolio.' },
          { kind: 'price_basis', severity: 'info', text: '3 holdings priced off Saxo P/L, not a live quote.' },
        ]}
      />,
    )
    expect(screen.getByText(/Top 3 holdings/)).toBeInTheDocument()
    expect(screen.getByText(/priced off Saxo/)).toBeInTheDocument()
  })

  it('links an earnings_soon chip to the Research earnings tab', () => {
    renderWithProviders(
      <AttentionBand
        items={[{ kind: 'earnings_soon', severity: 'info', ticker: 'MSFT', text: 'MSFT reports in 3 days.' }]}
      />,
    )
    expect(screen.getByRole('link', { name: /MSFT reports/ })).toHaveAttribute(
      'href', '/research?symbol=MSFT&tab=earnings',
    )
  })

  it.each([
    ['thesis_review_due', 'AAPL thesis last reviewed 120 days ago.'],
    ['target_reached', 'AAPL reached your 250.00 USD target at 251.00.'],
  ])('links a %s chip to the Research overview for its ticker', (kind, text) => {
    renderWithProviders(<AttentionBand items={[{ kind, severity: 'info', ticker: 'AAPL', text }]} />)
    expect(screen.getByRole('link', { name: text })).toHaveAttribute(
      'href', '/research?symbol=AAPL&tab=overview',
    )
  })

  it('shows a calm line when nothing needs attention', () => {
    renderWithProviders(<AttentionBand items={[]} />)
    expect(screen.getByText(/Nothing needs attention/)).toBeInTheDocument()
  })
})
