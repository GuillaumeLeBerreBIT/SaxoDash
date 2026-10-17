import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import CongressActivity from './CongressActivity'

describe('CongressActivity', () => {
  it('shows buyers and sellers and links to the Research Congress tab', () => {
    renderWithProviders(<CongressActivity ticker="NVDA" stock={{ holders: 2, buyers: 3, sellers: 1 }} windowDays={90} />)
    const link = screen.getByRole('link', { name: /3 members of Congress bought and 1 sold/ })
    expect(link).toHaveAttribute('href', '/research?symbol=NVDA&tab=congress')
    expect(link).toHaveTextContent('3 ↑ / 1 ↓')
  })

  it('shows a dash for an unknown ticker or a stock nobody trades or holds', () => {
    const { rerender } = renderWithProviders(<CongressActivity ticker="ASML" stock={null} windowDays={90} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    rerender(<CongressActivity ticker="AAPL" stock={{ holders: 0, buyers: 0, sellers: 0 }} windowDays={90} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows how many members hold a stock nobody traded recently', () => {
    renderWithProviders(<CongressActivity ticker="NVDA" stock={{ holders: 2, buyers: 0, sellers: 0 }} windowDays={90} />)
    const link = screen.getByRole('link', { name: /2 members of Congress hold it/ })
    expect(link).toHaveAttribute('href', '/research?symbol=NVDA&tab=congress')
    expect(link).toHaveTextContent('2 holding')
  })
})
