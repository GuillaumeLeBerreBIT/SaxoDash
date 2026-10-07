import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectValidHeadingOutline } from '../test/headingOutline'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import Investor from './Investor'

const detail = {
  slug: 'berkshire-hathaway', name: 'Warren Buffett', firm: 'Berkshire Hathaway', stale: false, import: null,
  quarters: ['2026-06-30', '2026-03-31'], quarter: '2026-06-30', previous_quarter: '2026-03-31', filed_on: '2026-08-14',
  total_value: 299253556246, positions: 1, top10_weight: 100, new_count: 0, exited_count: 0, turnover: 1.2,
  holdings: [{ cusip: 'C', ticker: 'AAPL', issuer: 'APPLE INC', put_call: '', shares: 1, value: 299253556246, weight: 100, change: 'unchanged', shares_change_pct: 0, quarters_held: 20, owned: false, watched: false }],
}
let lastQuarter
let detailState
let loading = false
vi.mock('../api/queries', () => ({
  useInvestor: (slug, quarter) => { lastQuarter = quarter; return { data: detailState, isLoading: loading, error: null } },
  useInvestorChanges: () => ({ data: { quarter: '2026-06-30', previous_quarter: '2026-03-31', new: [], added: [], trimmed: [], sold_out: [] }, isLoading: false, error: null }),
}))

function Where() {
  const location = useLocation()
  return <p data-testid="where">{location.search}</p>
}

const renderPage = (route = '/investors/berkshire-hathaway') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes><Route path="/investors/:slug" element={<><Investor /><Where /></>} /></Routes>
    </MemoryRouter>,
  )

describe('Investor', () => {
  beforeEach(() => { detailState = detail; loading = false })

  it('has exactly one h1 and no skipped heading level', () => {
    const { container } = renderPage()
    expectValidHeadingOutline(container)
  })

  it('keeps one h1 and no skipped level while loading', () => {
    detailState = undefined
    const { container } = renderPage()
    expectValidHeadingOutline(container)
  })

  it('heads the page with a back link, the name and the firm', () => {
    renderPage()
    expect(screen.getByRole('link', { name: '← Investors' })).toHaveAttribute('href', '/investors?investor=berkshire-hathaway')
    expect(screen.getByRole('heading', { name: 'Warren Buffett', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Berkshire Hathaway')).toBeInTheDocument()
  })

  it('picks a quarter through the URL', () => {
    renderPage()
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-03-31' } })
    expect(screen.getByTestId('where')).toHaveTextContent('quarter=2026-03-31')
    expect(lastQuarter).toBe('2026-03-31')
  })

  it('keeps the quarter picker while the next quarter loads', () => {
    loading = true
    renderPage()
    expect(screen.getByRole('combobox', { name: 'Quarter' })).toBeInTheDocument()
  })

  it('opens on Holdings and switches to Changes', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'AAPL' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Changes' }))
    expect(screen.getByTestId('where')).toHaveTextContent('tab=changes')
    expect(screen.getByRole('region', { name: 'New' })).toBeInTheDocument()
  })

  it('states the 13F limits', () => {
    renderPage()
    expect(screen.getByText(/US-listed long positions and listed options/)).toBeInTheDocument()
  })

  it('names the latest stored quarter on a stale filer viewed at an older one', () => {
    detailState = { ...detail, stale: true, quarters: ['2025-09-30', '2025-06-30'], quarter: '2025-06-30' }
    renderPage('/investors/berkshire-hathaway?quarter=2025-06-30')
    expect(screen.getByText('No 13F since Q3 2025')).toBeInTheDocument()
  })

  it('shows an empty state when nothing is imported', () => {
    detailState = { ...detail, quarter: null, quarters: [], holdings: [], previous_quarter: null }
    renderPage()
    expect(screen.getByText('Nothing imported for Warren Buffett yet')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Quarter' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Holdings' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Changes' })).toBeNull()
    expect(screen.getByText(/US-listed long positions and listed options/)).toBeInTheDocument()
  })

  it('clears the quarter from the URL when the latest is picked', () => {
    detailState = { ...detail, quarter: '2026-03-31' }
    renderPage('/investors/berkshire-hathaway?quarter=2026-03-31')
    fireEvent.change(screen.getByRole('combobox', { name: 'Quarter' }), { target: { value: '2026-06-30' } })
    expect(screen.getByTestId('where')).not.toHaveTextContent('quarter=')
  })
})
