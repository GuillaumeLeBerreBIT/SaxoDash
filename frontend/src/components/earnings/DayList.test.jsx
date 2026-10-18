import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import DayList from './DayList'

const ev = (o = {}) => ({
  symbol: 'X', name: null, date: '2099-01-05', session: 'amc', quarter: 4, year: 2098,
  eps_estimate: 1, eps_actual: null, eps_surprise_pct: null,
  revenue_estimate: 1e9, revenue_actual: null, revenue_surprise_pct: null,
  held: false, watched: false, mine: false, market_cap: null,
  move_pct: null, move_basis: null, also: [], ...o,
})

describe('DayList', () => {
  it('ranks my names first, then by market cap, within a session', () => {
    render(
      <DayList
        day="mon"
        events={[ev({ symbol: 'SMALL', market_cap: 1 }), ev({ symbol: 'BIG', market_cap: 9 }), ev({ symbol: 'MINE', held: true, mine: true })]}
        scope="all"
        focusSession={null}
        onOpen={() => {}}
        onViewAll={() => {}}
      />,
    )
    const group = screen.getByRole('group', { name: 'After close' })
    expect(within(group).getAllByRole('button').map((b) => within(b).getByText(/^[A-Z]+$/).textContent)).toEqual(['MINE', 'BIG', 'SMALL'])
  })

  it('keeps every column before the report, as dashes', () => {
    render(<DayList day="mon" events={[ev({ symbol: 'UPC' })]} scope="all" focusSession={null} onOpen={() => {}} onViewAll={() => {}} />)
    const row = screen.getByRole('button', { name: /UPC/ })
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })

  it('shows market cap compactly', () => {
    render(<DayList day="mon" events={[ev({ symbol: 'CAP', market_cap: 3_500_000 })]} scope="all" focusSession={null} onOpen={() => {}} onViewAll={() => {}} />)
    expect(screen.getByText('3.50T')).toBeInTheDocument()
  })

  it('an empty day in Mine scope offers View all', async () => {
    const onViewAll = vi.fn()
    render(<DayList day="mon" events={[]} scope="mine" focusSession={null} onOpen={() => {}} onViewAll={onViewAll} />)
    await userEvent.click(screen.getByRole('button', { name: /View all/ }))
    expect(onViewAll).toHaveBeenCalled()
  })

  it('an empty day in All scope says nobody reports', () => {
    render(<DayList day="mon" events={[]} scope="all" focusSession={null} onOpen={() => {}} onViewAll={() => {}} />)
    expect(screen.getByText('No companies report this day.')).toBeInTheDocument()
  })

  it('labels its columns', () => {
    render(<DayList day="mon" events={[ev()]} scope="all" focusSession={null} onOpen={() => {}} onViewAll={() => {}} />)
    for (const label of ['Company', 'Mkt cap', 'Qtr', 'EPS · est', 'Revenue', 'Move']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('scrolls to the session a grid cell picked, folding during-hours and unset into one', () => {
    const scrolled = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function () {
      scrolled.push(this.getAttribute('aria-label'))
    }
    try {
      render(
        <DayList
          day="mon"
          events={[ev({ symbol: 'AAA', session: 'bmo' }), ev({ symbol: 'BBB', session: null })]}
          scope="all"
          focusSession="other"
          onOpen={() => {}}
          onViewAll={() => {}}
        />,
      )
    } finally {
      Element.prototype.scrollIntoView = original
    }
    expect(scrolled).toEqual(['Time not set'])
  })
})
