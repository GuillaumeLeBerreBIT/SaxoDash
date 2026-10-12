import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import FundBalance from './FundBalance'

const stock = (overrides = {}) => ({ owners: 0, new: 0, added: 0, trimmed: 0, sold_out: 0, unchanged: 0, ...overrides })

describe('FundBalance', () => {
  it('shows buyers against sellers and links to the Funds tab', () => {
    renderWithProviders(<FundBalance ticker="NBIS" stock={stock({ new: 5, added: 1, sold_out: 1 })} quarter="2026-06-30" />)

    const link = screen.getByRole('link', { name: '6 tracked funds buying, 1 selling in Q2 2026' })
    expect(link).toHaveAttribute('href', '/research?symbol=NBIS&tab=funds')
    expect(link.textContent).toBe('▲\u00a06▼\u00a01')
  })

  it('shows a dash for an unknown stock and for one nobody moved', () => {
    const { rerender } = renderWithProviders(<FundBalance ticker="ASML" stock={null} quarter="2026-06-30" />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    rerender(<FundBalance ticker="AAPL" stock={stock({ owners: 3, unchanged: 3 })} quarter="2026-06-30" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
