import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import InvestorStocks from './InvestorStocks'

const row = (over) => ({
  cusip: 'N', ticker: 'NVDA', issuer: 'NVIDIA CORP', sector: 'Technology', owners: 24, bought: 7, sold: 2, new: 3,
  value: 12.4e9, investors: [{ slug: 'pershing-square', name: 'Bill Ackman' }], ...over,
})

let asked
let state
vi.mock('../api/queries', () => ({
  useInvestorStocks: (view, quarter) => { asked = [view, quarter]; return state },
}))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.search}</p>
}

const renderPage = (route = '/investors/stocks') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/investors/stocks" element={<><InvestorStocks /><Where /></>} /></Routes>
    </MemoryRouter>,
  )

describe('InvestorStocks', () => {
  beforeEach(() => {
    state = {
      data: { quarter: '2026-06-30', signal_quarter: '2026-06-30', quarters: ['2026-06-30', '2026-03-31'], view: 'bought', rows: [row(), row({ cusip: 'X', ticker: null, issuer: 'UNLISTED CO', owners: 3, bought: 1, sold: 0, new: 0, value: 5e6 })] },
      isLoading: false, error: null,
    }
  })

  it('asks for most bought in the signal quarter by default', () => {
    renderPage()
    expect(asked).toEqual(['bought', undefined])
    expect(screen.getByRole('heading', { level: 1, name: 'Stocks' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Investors' })).toHaveAttribute('href', '/investors')
  })

  it('shows the counts and who holds each stock', () => {
    renderPage()
    const nvda = screen.getByRole('row', { name: /NVDA/ })
    expect(within(nvda).getByText('24')).toBeInTheDocument()
    expect(within(nvda).getByText('7')).toBeInTheDocument()
    expect(within(nvda).getByText('$12.4B')).toBeInTheDocument()
    expect(within(nvda).getByRole('link', { name: 'NVDA' })).toHaveAttribute('href', '/research?symbol=NVDA')
  })

  it('shows the issuer and no research link for an unresolved ticker', () => {
    renderPage()
    const unlisted = screen.getByRole('row', { name: /UNLISTED CO/ })
    expect(within(unlisted).getByText('UNLISTED CO')).toBeInTheDocument()
    expect(within(unlisted).queryByRole('link', { name: 'UNLISTED CO' })).not.toBeInTheDocument()
  })

  it('reads the view and quarter from the URL', () => {
    renderPage('/investors/stocks?view=sold&quarter=2026-03-31')
    expect(asked).toEqual(['sold', '2026-03-31'])
  })

  it('switches view through the URL', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Most owned' }))
    expect(screen.getByTestId('where').textContent).toBe('?view=owned')
  })

  it('switches quarter through the URL', () => {
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-03-31' } })
    expect(screen.getByTestId('where').textContent).toBe('?quarter=2026-03-31')
  })

  it('can reach a newer quarter than the one the signals describe', () => {
    state = { ...state, data: { ...state.data, quarter: '2026-03-31', signal_quarter: '2026-03-31' } }
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-06-30' } })
    expect(screen.getByTestId('where').textContent).toBe('?quarter=2026-06-30')
  })

  it('drops the param when returning to the signal quarter', () => {
    state = { ...state, data: { ...state.data, quarter: '2026-03-31' } }
    renderPage('/investors/stocks?quarter=2026-03-31')
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-06-30' } })
    expect(screen.getByTestId('where').textContent).toBe('')
  })

  it('treats an unknown view as most bought', () => {
    renderPage('/investors/stocks?view=hot')
    expect(asked[0]).toBe('bought')
  })

  it('says so when nothing matches', () => {
    state = { data: { ...state.data, rows: [] }, isLoading: false, error: null }
    renderPage()
    expect(screen.getByText('No stocks with that activity in Q2 2026.')).toBeInTheDocument()
  })

  it('reports a failed load', () => {
    state = { data: undefined, isLoading: false, error: new Error('boom') }
    renderPage()
    expect(screen.getByText(/Could not load stock activity/)).toBeInTheDocument()
  })
})
