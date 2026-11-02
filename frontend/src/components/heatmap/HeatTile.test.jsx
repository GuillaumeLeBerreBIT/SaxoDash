import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Link, MemoryRouter } from 'react-router-dom'

import HeatTile from './HeatTile'

describe('HeatTile', () => {
  it('prints the ticker and the signed move at full size', () => {
    render(<HeatTile ticker="NVDA" pct={1.234} fill="rgb(1, 2, 3)" aria-label="NVDA +1.2%" />)
    expect(screen.getByText('NVDA')).toBeInTheDocument()
    expect(screen.getByText('+1.2%')).toBeInTheDocument()
  })

  it('shows a dash for an unknown move, never 0%', () => {
    render(<HeatTile ticker="KO" pct={null} fill={null} aria-label="KO" />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('gives a tile with no move the tile surface and a line ring, so it shows on a white pane', () => {
    render(<HeatTile ticker="KO" pct={null} fill={null} aria-label="KO" />)
    const tile = screen.getByRole('button', { name: 'KO' })
    expect(tile).toHaveClass('bg-tile', 'ring-1', 'ring-inset', 'ring-line')
    expect(tile.style.background).toBe('')
  })

  it('keeps a coloured tile on its own fill, without the neutral surface', () => {
    render(<HeatTile ticker="NVDA" pct={1.2} fill="rgb(1, 2, 3)" aria-label="NVDA" />)
    const tile = screen.getByRole('button', { name: 'NVDA' })
    expect(tile.style.background).toBe('rgb(1, 2, 3)')
    expect(tile).not.toHaveClass('bg-tile')
  })

  it('drops the move when only the ticker fits', () => {
    render(<HeatTile ticker="NVDA" pct={1.2} level="ticker" aria-label="NVDA" />)
    expect(screen.queryByText('+1.2%')).not.toBeInTheDocument()
  })

  it('keeps an unlabeled tile reachable by its accessible name', () => {
    render(<HeatTile ticker="NVDA" pct={1.2} level="none" aria-label="NVDA +1.2%" />)
    expect(screen.getByRole('button', { name: 'NVDA +1.2%' })).toBeInTheDocument()
    expect(screen.queryByText('NVDA')).not.toBeInTheDocument()
  })

  it('marks the active tile', () => {
    render(<HeatTile ticker="NVDA" pct={1.2} active aria-label="NVDA" />)
    expect(screen.getByRole('button', { name: 'NVDA' })).toHaveAttribute('aria-current', 'true')
  })

  it('renders as a link when given one', () => {
    render(
      <MemoryRouter>
        <HeatTile as={Link} to="/research?symbol=NVDA" ticker="NVDA" pct={1.2} aria-label="NVDA" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'NVDA' })).toHaveAttribute('href', '/research?symbol=NVDA')
  })
})
