import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import YourWeek from './YourWeek'

const ev = (o = {}) => ({
  symbol: 'X', name: null, date: '2099-01-05', session: 'amc', quarter: 4, year: 2098,
  eps_estimate: 1, eps_actual: null, eps_surprise_pct: null,
  revenue_estimate: 1e9, revenue_actual: null, revenue_surprise_pct: null,
  held: false, watched: false, mine: false, weight_pct: null, value: null,
  market_cap: null, move_pct: null, move_basis: null, pnl_impact: null, also: [], ...o,
})

describe('YourWeek', () => {
  it('lists holdings before the watchlist and leaves the market out', () => {
    render(
      <YourWeek
        events={[
          ev({ symbol: 'WAT', watched: true, mine: true }),
          ev({ symbol: 'HLD', held: true, mine: true, weight_pct: 12.5, value: 5000 }),
          ev({ symbol: 'MKT' }),
        ]}
        nextMine={null}
        onOpen={() => {}}
      />,
    )
    const rows = screen.getAllByRole('button')
    expect(rows.map((r) => within(r).getByText(/^[A-Z]{3}$/).textContent)).toEqual(['HLD', 'WAT'])
    expect(screen.getByText('Held')).toBeInTheDocument()
    expect(screen.getByText('Watching')).toBeInTheDocument()
    expect(screen.getByText('12.5%')).toBeInTheDocument()
  })

  it('headlines the tally', () => {
    render(
      <YourWeek
        events={[
          ev({ symbol: 'AAA', held: true, mine: true, eps_actual: 2, eps_surprise_pct: 10 }),
          ev({ symbol: 'BBB', held: true, mine: true }),
        ]}
        nextMine={null}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('2 of yours report · 1 reported, 1 beat')).toBeInTheDocument()
  })

  it('shows the P/L impact of a holding that moved', () => {
    render(
      <YourWeek
        events={[ev({ symbol: 'HLD', held: true, mine: true, value: 1000, move_pct: 5, move_basis: '1d', pnl_impact: 50 })]}
        nextMine={null}
        onOpen={() => {}}
      />,
    )
    expect(screen.getByText('+€50.00')).toBeInTheDocument()
  })

  it('a quiet week names the next holding report', () => {
    render(<YourWeek events={[ev()]} nextMine={{ symbol: 'AAPL', date: '2026-10-30' }} onOpen={() => {}} />)
    expect(screen.getByText(/None of yours report this week\./)).toBeInTheDocument()
    expect(screen.getByText(/Next: AAPL/)).toBeInTheDocument()
  })

  it('a quiet week with nothing ahead says only that', () => {
    render(<YourWeek events={[]} nextMine={null} onOpen={() => {}} />)
    expect(screen.getByText('None of yours report this week.')).toBeInTheDocument()
  })

  it('opens the symbol', async () => {
    const onOpen = vi.fn()
    render(<YourWeek events={[ev({ symbol: 'HLD', held: true, mine: true })]} nextMine={null} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith('HLD')
  })

  it('is titled Your week as a section heading', () => {
    render(<YourWeek events={[]} nextMine={null} onOpen={() => {}} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Your week' })).toBeInTheDocument()
  })
})
