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

  it('shows a calm line when nothing needs attention', () => {
    renderWithProviders(<AttentionBand items={[]} />)
    expect(screen.getByText(/Nothing needs attention/)).toBeInTheDocument()
  })
})
