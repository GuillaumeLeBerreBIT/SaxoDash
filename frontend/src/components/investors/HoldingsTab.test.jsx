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
})
