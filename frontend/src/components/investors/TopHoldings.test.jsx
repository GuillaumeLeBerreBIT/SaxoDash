import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import TopHoldings from './TopHoldings'

const holding = (i, over = {}) => ({
  cusip: `C${i}`, ticker: `T${i}`, issuer: `Issuer ${i}`, put_call: '', shares: 10, value: 1000 - i * 10,
  weight: 10 - i * 0.1, change: 'unchanged', shares_change_pct: 0, quarters_held: 4, owned: false, watched: false, ...over,
})
const detail = (count) => ({
  slug: 'berkshire-hathaway', quarter: '2026-06-30', positions: count, total_value: 20000, top10_weight: count > 10 ? 86.4 : 100,
  holdings: Array.from({ length: count }, (_, i) => holding(i, i === 0 ? { owned: true, change: 'new' } : {})),
})

const renderTop = (d) => render(<MemoryRouter><TopHoldings detail={d} /></MemoryRouter>)

describe('TopHoldings', () => {
  beforeEach(() => localStorage.clear())

  it('shows ten tiles with weight, change and your badge by default', () => {
    renderTop(detail(29))
    expect(screen.getAllByTestId('holding-tile')).toHaveLength(10)
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('You own')).toBeInTheDocument()
  })

  it('states the remaining positions', () => {
    renderTop(detail(29))
    expect(screen.getByText(/Remaining 19 positions/)).toBeInTheDocument()
  })

  it('says a small portfolio is shown whole', () => {
    renderTop(detail(4))
    expect(screen.getAllByTestId('holding-tile')).toHaveLength(4)
    expect(screen.getByText("That's the whole portfolio: 4 positions.")).toBeInTheDocument()
  })

  it('switches to the list and remembers the choice', () => {
    renderTop(detail(29))
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getAllByRole('row')).toHaveLength(11)
    expect(localStorage.getItem('saxodash:investors-top10-view')).toBe('list')
  })

  it('shows the donut with an Other slice in its legend', () => {
    localStorage.setItem('saxodash:investors-top10-view', 'donut')
    renderTop(detail(29))
    expect(screen.getByText('Other')).toBeInTheDocument()
    expect(screen.getByText('Total value')).toBeInTheDocument()
  })

  it('shows an unresolved holding by issuer in a tile', () => {
    renderTop({ ...detail(3), holdings: [holding(0, { ticker: null, issuer: 'LIBERTY LATIN AMERICA LTD' })] })
    expect(screen.getByText('LIBERTY LATIN AMERICA LTD')).toBeInTheDocument()
  })
})
