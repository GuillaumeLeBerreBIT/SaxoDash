import { describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import PositionsPanel from './PositionsPanel'

const position = (over) => ({ ticker: 'NVDA', name: 'NVIDIA', value: '1000', pnl_pct: '2', weight: '12.34', currency: 'USD', ...over })

function renderPanel(positions) {
  return render(
    <MemoryRouter>
      <PositionsPanel summary={{ total_value: '1000' }} positions={positions} quotes={new Map()} />
    </MemoryRouter>,
  )
}

describe('PositionsPanel top holding', () => {
  it('states the weight when it is known', () => {
    renderPanel([position()])
    expect(screen.getByText('12.3% of portfolio')).toBeInTheDocument()
  })

  it('shows a dash rather than 0.0% when the weight is unknown', () => {
    renderPanel([position({ weight: null })])
    expect(screen.queryByText(/0\.0% of portfolio/)).not.toBeInTheDocument()
    expect(screen.queryByText(/% of portfolio/)).not.toBeInTheDocument()
    const withoutWeight = screen.getAllByText('—').length
    cleanup()
    renderPanel([position()])
    expect(withoutWeight - screen.getAllByText('—').length).toBe(2)
  })
})
