import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderWithProviders } from '../../test/renderWithProviders'
import Projection from './Projection'

describe('Projection', () => {
  it('renders the default 10-year projection from the given starting balance', () => {
    renderWithProviders(<Projection start={10000} expectedReturnPct={8} volatilityPct={15} />)

    expect(screen.getByText('Invested by then')).toBeInTheDocument()
    expect(screen.getByText('Median outcome')).toBeInTheDocument()
    expect(screen.getByText('Pessimistic (P10)')).toBeInTheDocument()
    expect(screen.getByText('Optimistic (P90)')).toBeInTheDocument()
  })

  it('recomputes when a different monthly contribution is picked', async () => {
    renderWithProviders(<Projection start={10000} expectedReturnPct={8} volatilityPct={15} />)

    await userEvent.click(screen.getByRole('button', { name: '€2500' }))

    expect(screen.getByText(/€2500\/mo for 10 years/)).toBeInTheDocument()
  })

  it('recomputes when a different year range is picked', async () => {
    renderWithProviders(<Projection start={10000} expectedReturnPct={8} volatilityPct={15} />)

    await userEvent.click(screen.getByRole('button', { name: '30Y' }))

    expect(screen.getByText(/for 30 years/)).toBeInTheDocument()
  })

  it('reveals what Monte Carlo means on keyboard focus, for accessibility', async () => {
    renderWithProviders(<Projection start={10000} expectedReturnPct={8} volatilityPct={15} />)

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await userEvent.tab()
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Monte Carlo simulation/)
  })
})
