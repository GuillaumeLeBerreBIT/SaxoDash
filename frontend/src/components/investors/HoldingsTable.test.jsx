import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import HoldingsTable from './HoldingsTable'

const holdings = [
  { cusip: '037833100', ticker: 'AAPL', issuer: 'APPLE INC', put_call: '', shares: 227917808, value: 65950296923, weight: 22.04, change: 'trimmed', shares_change_pct: -7.2, quarters_held: 20, owned: true, watched: false },
  { cusip: '67066G104', ticker: 'NVDA', issuer: 'NVIDIA CORP', put_call: 'CALL', shares: 100, value: 5000, weight: 11.02, change: 'new', shares_change_pct: null, quarters_held: 1, owned: false, watched: true },
  { cusip: '999999999', ticker: null, issuer: 'LIBERTY LATIN AMERICA LTD', put_call: '', shares: 10, value: 10, weight: 0.1, change: 'unchanged', shares_change_pct: 0, quarters_held: 20, owned: false, watched: false },
]

const renderTable = (props = {}) =>
  render(
    <MemoryRouter initialEntries={['/investors/berkshire-hathaway']}>
      <Routes>
        <Route path="/investors/:slug" element={<HoldingsTable holdings={holdings} showChange {...props} />} />
        <Route path="/research" element={<p>Research page</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('HoldingsTable', () => {
  it('links a resolved ticker to Research', () => {
    renderTable()
    expect(screen.getByRole('link', { name: 'AAPL' })).toHaveAttribute('href', '/research?symbol=AAPL&tab=overview')
  })

  it('shows an unresolved holding by issuer with no link', () => {
    renderTable()
    expect(screen.getByText('LIBERTY LATIN AMERICA LTD')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /LIBERTY/ })).toBeNull()
  })

  it('opens Research from anywhere on a resolved row', () => {
    renderTable()
    fireEvent.click(screen.getByText('$66.0B'))
    expect(screen.getByText('Research page')).toBeInTheDocument()
  })

  it('shows weight, value, shares, change, tenure and your badges', () => {
    renderTable()
    expect(screen.getByText('22.0%')).toBeInTheDocument()
    expect(screen.getByText('227,917,808')).toBeInTheDocument()
    expect(screen.getByText('▼ Trimmed 7%')).toBeInTheDocument()
    expect(screen.getAllByText('20q')).toHaveLength(2)
    expect(screen.getByText('You own')).toBeInTheDocument()
    expect(screen.getByText('Call')).toBeInTheDocument()
  })

  it('drops the change column for a first stored quarter', () => {
    renderTable({ showChange: false })
    expect(screen.queryByRole('columnheader', { name: 'Change' })).toBeNull()
  })
})
