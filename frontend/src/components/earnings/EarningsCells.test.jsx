import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { CompanyCell, EpsCell, MoveCell, RevenueCell } from './EarningsCells'

const ev = (o = {}) => ({
  symbol: 'AAPL', name: 'Apple Inc', date: '2099-01-01', session: 'amc',
  eps_estimate: 1.5, eps_actual: null, eps_surprise_pct: null,
  revenue_estimate: 2e9, revenue_actual: null, revenue_surprise_pct: null,
  move_pct: null, move_basis: null, also: [], ...o,
})

describe('EarningsCells', () => {
  it('an upcoming EPS shows the estimate marked e', () => {
    render(<EpsCell event={ev()} />)
    expect(screen.getByText('1.50')).toBeInTheDocument()
    expect(screen.getByText('e')).toBeInTheDocument()
  })

  it('a reported EPS shows the actual and a surprise chip', () => {
    render(<EpsCell event={ev({ eps_actual: 1.8, eps_surprise_pct: 20 })} />)
    expect(screen.getByText('1.80')).toBeInTheDocument()
    expect(screen.getByText(/▲/)).toHaveTextContent('20.0%')
  })

  it('a move shows its sign and window; no move is a dash', () => {
    const { rerender } = render(<MoveCell event={ev({ move_pct: -3.4, move_basis: '2d' })} />)
    expect(screen.getByText('2d')).toBeInTheDocument()
    rerender(<MoveCell event={ev()} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('revenue with nothing known is a dash', () => {
    render(<RevenueCell event={ev({ revenue_estimate: null })} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('the company cell shows ticker, name and merged share classes', () => {
    render(<CompanyCell event={ev({ also: ['GOOG'], symbol: 'GOOGL', name: 'Alphabet Inc' })} />)
    expect(screen.getByText('GOOGL')).toBeInTheDocument()
    expect(screen.getByText('Alphabet Inc')).toBeInTheDocument()
    expect(screen.getByText('+GOOG')).toBeInTheDocument()
  })
})
