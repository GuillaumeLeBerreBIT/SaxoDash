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

  it('renders with yearly ticks for a given return and volatility', () => {
    renderWithProviders(<Projection start={10000} expectedReturnPct={6} volatilityPct={12} />)

    expect(screen.getByText('Invested by then')).toBeInTheDocument()
  })

  it('lays the four outcome tiles out two across on mobile and four on desktop', () => {
    renderWithProviders(<Projection start={10000} expectedReturnPct={8} volatilityPct={15} />)

    const grid = screen.getByText('Invested by then').closest('.grid')
    expect(grid).toHaveClass('grid-cols-2', 'md:grid-cols-4')
  })

  it('lets the header controls wrap and the amount control wrap', () => {
    renderWithProviders(<Projection start={10000} expectedReturnPct={8} volatilityPct={15} />)

    const amounts = screen.getByRole('button', { name: '€2500' }).parentElement
    expect(amounts).toHaveClass('flex-wrap')
    expect(amounts).not.toHaveClass('overflow-x-auto')
    expect(amounts.parentElement).toHaveClass('flex-wrap', 'gap-2')
    expect(screen.getByRole('button', { name: '30Y' }).parentElement).toHaveClass('flex-wrap')
  })

  it('lets the legend wrap and puts the disclaimer on its own line on mobile', () => {
    renderWithProviders(<Projection start={10000} expectedReturnPct={8} volatilityPct={15} />)

    const note = screen.getByText(/Simulation, not advice/)
    expect(note.parentElement).toHaveClass('flex-wrap')
    expect(note).toHaveClass('w-full', 'md:ml-auto', 'md:w-auto')
    expect(note.parentElement).toHaveClass('gap-y-1', 'md:gap-y-0')
  })

})
