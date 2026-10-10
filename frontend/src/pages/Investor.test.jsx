import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import Investor from './Investor'

const move = (kind, ticker, over) => ({
  cusip: ticker, put_call: '', ticker, issuer: `${ticker} INC`, kind, weight: 9, previous_weight: null,
  shares_change_pct: null, value: 1, previous_value: null, ...over,
})
const detail = {
  slug: 'pershing-square', name: 'Bill Ackman', firm: 'Pershing Square', blurb: 'Concentrated activist.',
  styles: ['Activist', 'Concentrated'], followed: false, curated: true, stale: false, import: null,
  quarters: ['2026-06-30', '2026-03-31'], quarter: '2026-06-30', previous_quarter: '2026-03-31', filed_on: '2026-08-14',
  total_value: 14.2e9, positions: 11, top10_weight: 98, top5_weight: 78.4, new_count: 1, exited_count: 1, turnover: 6,
  sectors: [{ sector: 'Consumer', weight: 55 }, { sector: 'Other', weight: 45 }],
  moves: [
    move('new', 'AMZN', { weight: 9.04 }),
    move('added', 'GOOGL', { weight: 15, previous_weight: 11, shares_change_pct: 32.4 }),
    move('trimmed', 'CMG', { weight: 12, previous_weight: 18, shares_change_pct: -18 }),
    move('sold_out', 'NKE', { weight: 0, previous_weight: 4.2, shares_change_pct: -100 }),
  ],
  holdings: [{ cusip: 'C', ticker: 'CMG', issuer: 'CHIPOTLE', class: 'COM', put_call: '', amount_type: 'SH', shares: 1, value: 2.6e9, weight: 18, change: 'trimmed', shares_change_pct: -18, quarters_held: 20, sector: 'Consumer', owned: false, watched: false }],
}

let asked
let state
const follow = vi.fn()
const stop = vi.fn()
vi.mock('../api/queries', () => ({
  useInvestor: (slug, quarter) => { asked = [slug, quarter]; return state },
  useFollowInvestor: () => ({ mutate: follow }),
  useStopTracking: () => ({ mutate: stop, isPending: false, error: null }),
}))
vi.mock('../components/investors/HoldingsTab', () => ({ default: () => <div data-testid="holdings-tab" /> }))
vi.mock('../components/investors/TopHoldings', () => ({ default: () => <div data-testid="top-holdings" /> }))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.pathname + location.search}</p>
}

const renderPage = (route = '/investors/pershing-square') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/investors/:slug" element={<><Investor /><Where /></>} />
        <Route path="/investors" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )

describe('Investor profile', () => {
  beforeEach(() => {
    state = { data: detail, isLoading: false, error: null }
    follow.mockReset()
    stop.mockReset()
  })

  it('opens with who this is', () => {
    renderPage()
    expect(screen.getByRole('link', { name: '← Investors' })).toHaveAttribute('href', '/investors')
    expect(screen.getByRole('heading', { level: 1, name: 'Bill Ackman' })).toBeInTheDocument()
    expect(screen.getByText('Pershing Square')).toBeInTheDocument()
    expect(screen.getByText('Concentrated activist.')).toBeInTheDocument()
    expect(screen.getByText('Activist')).toBeInTheDocument()
  })

  it('shows a search-added investor\'s name once in the hero', () => {
    state = { data: { ...detail, name: 'ACME CAPITAL LP', firm: 'ACME CAPITAL LP' }, isLoading: false, error: null }
    renderPage()
    expect(screen.getAllByText('ACME CAPITAL LP')).toHaveLength(1)
  })

  it('follows from the hero', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Follow Bill Ackman' }))
    expect(follow).toHaveBeenCalledWith({ slug: 'pershing-square', followed: true })
  })

  it('summarises the portfolio in four tiles', () => {
    renderPage()
    const tiles = screen.getByRole('group', { name: 'Portfolio summary' })
    expect(within(tiles).getByText('$14.2B')).toBeInTheDocument()
    expect(within(tiles).getByText('11')).toBeInTheDocument()
    expect(within(tiles).getByText('78.4%')).toBeInTheDocument()
    expect(within(tiles).getByText('Aug 14, 2026')).toBeInTheDocument()
  })

  it('tells the quarter as moves in plain words, in story order', () => {
    renderPage()
    const moves = screen.getByRole('region', { name: 'Latest moves · Q2 2026' })
    expect(within(moves).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'AMZNOpened a 9.0% position',
      'GOOGLAdded 32% more shares · now 15.0%',
      'CMGCut shares by 18% · now 12.0%',
      'NKESold out · was 4.2%',
    ])
  })

  it('shows eight moves and reveals the rest on request', () => {
    const many = Array.from({ length: 11 }, (_, i) => move('new', `T${i}`))
    state = { data: { ...detail, moves: many }, isLoading: false, error: null }
    renderPage()
    const moves = screen.getByRole('region', { name: /Latest moves/ })
    expect(within(moves).getAllByRole('listitem')).toHaveLength(8)
    fireEvent.click(within(moves).getByRole('button', { name: 'Show all 11' }))
    expect(within(moves).getAllByRole('listitem')).toHaveLength(11)
  })

  it('says there is nothing to compare for a first stored quarter', () => {
    state = { data: { ...detail, previous_quarter: null, moves: [] }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText('First stored quarter — there is no earlier filing to compare against.')).toBeInTheDocument()
  })

  it('says nothing changed when a compared quarter has no moves', () => {
    state = { data: { ...detail, moves: [] }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText('No position changed by 1% or more this quarter.')).toBeInTheDocument()
  })

  it('shows sector weights beside the top holdings', () => {
    renderPage()
    const sectors = screen.getByRole('region', { name: 'Sectors' })
    expect(within(sectors).getByText('Consumer')).toBeInTheDocument()
    expect(within(sectors).getByText('55.0%')).toBeInTheDocument()
    expect(screen.getByTestId('top-holdings')).toBeInTheDocument()
    expect(screen.getByTestId('holdings-tab')).toBeInTheDocument()
  })

  it('switches quarter through the URL', () => {
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-03-31' } })
    expect(screen.getByTestId('where').textContent).toBe('/investors/pershing-square?quarter=2026-03-31')
  })

  it('drops the quarter param when the latest quarter is picked again', () => {
    renderPage('/investors/pershing-square?quarter=2026-03-31')
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-06-30' } })
    expect(screen.getByTestId('where').textContent).toBe('/investors/pershing-square')
  })

  it('asks for the quarter named in the URL', () => {
    renderPage('/investors/pershing-square?quarter=2026-03-31')
    expect(asked).toEqual(['pershing-square', '2026-03-31'])
  })

  it('does not offer to stop tracking a curated investor', () => {
    renderPage()
    expect(screen.queryByRole('button', { name: 'Stop tracking' })).not.toBeInTheDocument()
  })

  it('stops tracking an added investor after a confirmation and returns to the hub', () => {
    stop.mockImplementation((slug, options) => options.onSuccess())
    state = { data: { ...detail, curated: false }, isLoading: false, error: null }
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Stop tracking' }))
    expect(stop).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bill Ackman' }))
    expect(stop).toHaveBeenCalledWith('pershing-square', expect.anything())
    expect(screen.getByTestId('where').textContent).toBe('/investors')
  })

  it('flags an investor that stopped filing', () => {
    state = { data: { ...detail, stale: true }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText('No 13F since Q2 2026')).toBeInTheDocument()
  })

  it('names the latest stored quarter, not the viewed one, for a stale investor', () => {
    state = { data: { ...detail, stale: true, quarter: '2026-03-31' }, isLoading: false, error: null }
    renderPage('/investors/pershing-square?quarter=2026-03-31')
    expect(screen.getByText('No 13F since Q2 2026')).toBeInTheDocument()
  })

  it('keeps the limits note and no quarter select when nothing is imported', () => {
    state = { data: { ...detail, quarters: [], quarter: null, holdings: [], moves: [], sectors: [] }, isLoading: false, error: null }
    renderPage()
    expect(screen.queryByRole('combobox', { name: 'Quarter' })).not.toBeInTheDocument()
    expect(screen.getByText(/^13F shows US-listed long positions/)).toBeInTheDocument()
  })

  it('explains an investor with nothing imported yet', () => {
    state = { data: { ...detail, quarters: [], quarter: null, holdings: [], moves: [], sectors: [] }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText('Nothing imported for Bill Ackman yet')).toBeInTheDocument()
  })

  it('reports a failed load with a way back', () => {
    state = { data: undefined, isLoading: false, error: new Error('boom') }
    renderPage()
    expect(screen.getByText(/Could not load this investor/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Investors' })).toBeInTheDocument()
  })
})
