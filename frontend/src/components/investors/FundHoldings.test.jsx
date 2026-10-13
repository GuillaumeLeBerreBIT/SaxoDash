import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import { FundChange, FundShares } from './FundHoldings'

const stock = (overrides = {}) => ({
  owners: 6, new: 0, added: 0, trimmed: 0, sold_out: 0, unchanged: 0, shares: 0, shares_change: 0, shares_change_pct: null,
  ...overrides,
})

describe('FundShares', () => {
  it('shows the total tracked funds hold and links to the Funds tab', () => {
    renderWithProviders(<FundShares ticker="NBIS" stock={stock({ shares: 1_240_000 })} quarter="2026-06-30" />)

    const link = screen.getByRole('link', { name: 'Tracked funds hold 1,240,000 shares at the end of Q2 2026' })
    expect(link).toHaveAttribute('href', '/research?symbol=NBIS&tab=funds')
    expect(link).toHaveTextContent('1.2M')
  })

  it('shows a dash for an unknown stock and for one nobody holds', () => {
    const { rerender } = renderWithProviders(<FundShares ticker="ASML" stock={undefined} quarter="2026-06-30" />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    rerender(<FundShares ticker="AAPL" stock={stock()} quarter="2026-06-30" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('FundChange', () => {
  it('shows a net purchase with an up arrow, a plus and its percent', () => {
    renderWithProviders(
      <FundChange ticker="NBIS" stock={stock({ shares: 1_240_000, shares_change: 180_000, shares_change_pct: 17.0 })} quarter="2026-06-30" />,
    )

    const link = screen.getByRole('link', { name: 'Tracked funds net bought 180,000 shares in Q2 2026' })
    expect(link).toHaveAttribute('href', '/research?symbol=NBIS&tab=funds')
    expect(link.textContent).toBe('▲\u00a0+180K+17.0%')
  })

  it('shows a net sale with a down arrow and a minus', () => {
    renderWithProviders(
      <FundChange ticker="MSFT" stock={stock({ shares: 5_310_000, shares_change: -420_000, shares_change_pct: -7.3 })} quarter="2026-06-30" />,
    )

    expect(screen.getByRole('link').textContent).toBe('▼\u00a0-420K-7.3%')
  })

  it('leaves the percent out when nothing was held before', () => {
    renderWithProviders(
      <FundChange ticker="NBIS" stock={stock({ shares: 10, shares_change: 10, shares_change_pct: null })} quarter="2026-06-30" />,
    )

    expect(screen.getByRole('link').textContent).toBe('▲\u00a0+10')
  })

  it('leaves the percent out when it is absurdly large', () => {
    renderWithProviders(
      <FundChange ticker="NBIS" stock={stock({ shares: 10, shares_change: 10, shares_change_pct: 76194 })} quarter="2026-06-30" />,
    )

    expect(screen.getByRole('link').textContent).toBe('▲\u00a0+10')
  })

  it('shows a dash when nothing changed and for an unknown stock', () => {
    const { rerender } = renderWithProviders(
      <FundChange ticker="AAPL" stock={stock({ shares: 2_000_000 })} quarter="2026-06-30" />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    rerender(<FundChange ticker="ASML" stock={null} quarter="2026-06-30" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
