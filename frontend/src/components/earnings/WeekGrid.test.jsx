import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import WeekGrid, { CELL_LIMIT } from './WeekGrid'
import { buildWeekGrid } from '../../lib/earnings'

const ev = (symbol, o = {}) => ({
  symbol, date: '2026-10-26', session: 'bmo', held: false, watched: false, mine: false,
  market_cap: null, revenue_estimate: null, eps_actual: null, eps_surprise_pct: null, ...o,
})
const renderGrid = (events, props = {}) =>
  render(
    <WeekGrid
      grid={buildWeekGrid(events)}
      windowFrom="2026-10-26"
      selectedDay="mon"
      onSelect={props.onSelect || (() => {})}
      onOpen={props.onOpen || (() => {})}
    />,
  )

describe('WeekGrid', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-26T09:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows at most six logos and a +N more for the rest', () => {
    renderGrid(Array.from({ length: 9 }, (_, i) => ev(`S${i}`)))
    expect(CELL_LIMIT).toBe(6)
    expect(screen.getAllByRole('button', { name: /^Open S\d$/ })).toHaveLength(6)
    expect(screen.getByRole('button', { name: '+3 more' })).toBeInTheDocument()
  })

  it('labels the session rows and counts each cell', () => {
    renderGrid([ev('A'), ev('B')])
    expect(screen.getByText('Before open')).toBeInTheDocument()
    expect(screen.getByText('After close')).toBeInTheDocument()
    expect(screen.getByLabelText('Mon before open: 2 reporting')).toBeInTheDocument()
  })

  it('a day header selects the day; +N more selects the cell', async () => {
    const onSelect = vi.fn()
    renderGrid(Array.from({ length: 7 }, (_, i) => ev(`S${i}`)), { onSelect })
    await userEvent.click(screen.getByRole('button', { name: /^Tue 27/ }))
    expect(onSelect).toHaveBeenLastCalledWith('tue', null)
    await userEvent.click(screen.getByRole('button', { name: '+1 more' }))
    expect(onSelect).toHaveBeenLastCalledWith('mon', 'bmo')
  })

  it('the corner count is a button that selects the cell', async () => {
    const onSelect = vi.fn()
    renderGrid([ev('A'), ev('B')], { onSelect })
    await userEvent.click(screen.getByRole('button', { name: 'Show Mon before open' }))
    expect(onSelect).toHaveBeenCalledWith('mon', 'bmo')
  })

  it('a logo opens its company', async () => {
    const onOpen = vi.fn()
    renderGrid([ev('AAPL')], { onOpen })
    await userEvent.click(screen.getByRole('button', { name: 'Open AAPL' }))
    expect(onOpen).toHaveBeenCalledWith('AAPL')
  })

  it('marks the selected day', () => {
    renderGrid([ev('A')])
    expect(screen.getByRole('button', { name: /^Mon 26/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('names a reported outcome, not only its colour', () => {
    renderGrid([ev('WIN', { date: '2000-01-03', eps_actual: 2, eps_surprise_pct: 5 })])
    expect(screen.getByRole('button', { name: 'Open WIN, beat' })).toBeInTheDocument()
  })

  it('your cell in the week grid is marked in the earnings colour with words', () => {
    renderGrid([ev('VST', { name: 'Vistra', mine: true, held: true }), ev('OTH')])
    const words = screen.getByText('Vistra, yours')
    expect(words).toHaveClass('text-earn')
    expect(screen.getByLabelText(/^Mon before open: 2 reporting/)).toHaveClass('bg-earn-subtle')
  })

  it('counts several of yours in a cell instead of naming one', () => {
    renderGrid([ev('AAA', { mine: true }), ev('BBB', { mine: true })])
    expect(screen.getByText('2 yours')).toHaveClass('text-earn')
  })
})
