import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import HoldingsTab from './HoldingsTab'

const holdings = Array.from({ length: 50 }, (_, i) => ({
  cusip: `C${i}`, ticker: `T${i}`, issuer: `Issuer ${i}`, put_call: i === 1 ? 'CALL' : '', shares: 10, value: 1000 - i,
  weight: 2, change: i < 3 ? 'new' : 'unchanged', shares_change_pct: null, quarters_held: 2, owned: i === 4, watched: false,
}))
const detail = { previous_quarter: '2026-03-31', holdings }

const renderTab = () => render(<MemoryRouter><HoldingsTab detail={detail} /></MemoryRouter>)
const bodyRows = () => screen.getAllByRole('row').length - 1

describe('HoldingsTab', () => {
  it('shows 15 rows, then 25 more at a time', () => {
    renderTab()
    expect(bodyRows()).toBe(15)
    expect(screen.getByText('Showing 15 of 50')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show 25 more' }))
    expect(bodyRows()).toBe(40)
    fireEvent.click(screen.getByRole('button', { name: 'Show 10 more' }))
    expect(bodyRows()).toBe(50)
    expect(screen.queryByRole('button', { name: /more/ })).toBeNull()
  })

  it('filters by chip and by search, starting the paging over', () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: 'Show 25 more' }))
    expect(bodyRows()).toBe(40)
    fireEvent.click(screen.getByRole('button', { name: 'Yours' }))
    expect(bodyRows()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(bodyRows()).toBe(15)
    fireEvent.click(screen.getByRole('button', { name: 'Show 25 more' }))
    fireEvent.click(screen.getByRole('button', { name: 'New' }))
    expect(bodyRows()).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    expect(bodyRows()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Yours' }))
    expect(bodyRows()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search holdings' }), { target: { value: 'issuer 4' } })
    expect(screen.getByText('Showing 11 of 11')).toBeInTheDocument()
  })

  it('explains an empty filter', () => {
    renderTab()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search holdings' }), { target: { value: 'zzz' } })
    expect(screen.getByText('No holding matches this filter.')).toBeInTheDocument()
  })

  it('shows an unresolved holding by issuer without a link', () => {
    const unresolved = { ...holdings[0], cusip: 'U', ticker: null, issuer: 'LIBERTY LATIN AMERICA LTD' }
    render(<MemoryRouter><HoldingsTab detail={{ previous_quarter: '2026-03-31', holdings: [unresolved] }} /></MemoryRouter>)
    expect(screen.getByText('LIBERTY LATIN AMERICA LTD')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('offers the change chips only when there is a previous quarter', () => {
    render(<MemoryRouter><HoldingsTab detail={{ previous_quarter: null, holdings }} /></MemoryRouter>)
    ;['All', 'Options', 'Yours'].forEach((name) => expect(screen.getByRole('button', { name })).toBeInTheDocument())
    ;['New', 'Added', 'Trimmed'].forEach((name) => expect(screen.queryByRole('button', { name })).toBeNull())
  })

  it('keeps a filtered holding bar relative to the whole portfolio', () => {
    const rows = [{ ...holdings[0], weight: 40 }, { ...holdings[1], weight: 4, owned: true }]
    const { container } = render(<MemoryRouter><HoldingsTab detail={{ previous_quarter: '2026-03-31', holdings: rows }} /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Yours' }))
    expect(container.querySelector('[data-fill]').style.width).toBe('10%')
  })

  it('drops the footer when nothing matches', () => {
    renderTab()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search holdings' }), { target: { value: 'zzz' } })
    expect(screen.queryByText(/Showing/)).toBeNull()
  })

  it('hides the Change column without a previous quarter', () => {
    render(<MemoryRouter><HoldingsTab detail={{ previous_quarter: null, holdings }} /></MemoryRouter>)
    expect(screen.queryByRole('columnheader', { name: 'Change' })).toBeNull()
  })
})
