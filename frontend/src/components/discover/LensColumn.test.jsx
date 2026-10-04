import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import LensColumn from './LensColumn'

const item = (i, reasons) => ({
  ticker: `T${i}`, name: `Stock ${i}`, uic: i + 1, asset_type: 'Stock', last_close: 10 + i, change_1d: -1, sparkline: [],
  reasons: reasons ?? [
    { field: 'pct_vs_ma200', label: 'vs 200D', value: 12, format: 'signed_pct' },
    { field: 'rsi14', label: 'RSI', value: 81, format: 'number' },
  ],
})
const shelf = (total, count, extra = {}) => ({
  key: 'overbought', title: 'Overbought', short: 'Overbought', subtitle: 'RSI 14 ≥ 70', order: 'Ordered by RSI 14, highest first',
  empty: 'No stocks match these criteria in the last session.', sort: { field: 'rsi14', descending: true },
  total, items: Array.from({ length: count }, (_, i) => item(i)), ...extra,
})
const renderColumn = (s) => render(<MemoryRouter><LensColumn shelf={s} /></MemoryRouter>)

describe('LensColumn', () => {
  it('lists the first five stocks in the lens order', () => {
    renderColumn(shelf(20, 20))
    const rows = within(screen.getByRole('list', { name: 'Overbought stocks' })).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent.match(/T\d+/)[0])).toEqual(['T0', 'T1', 'T2', 'T3', 'T4'])
  })

  it('shows the value the lens is ordered by', () => {
    renderColumn(shelf(1, 1))
    expect(screen.getByRole('listitem')).toHaveTextContent('RSI 81')
    expect(screen.getByRole('listitem')).not.toHaveTextContent('vs 200D')
  })

  it('drops the price and keeps ticker, day change and lead reason', () => {
    renderColumn(shelf(1, 1))
    const row = screen.getByRole('listitem')
    expect(row).not.toHaveTextContent('US$')
    expect(row).toHaveTextContent('T0')
    expect(row).toHaveTextContent('1')
    expect(row).toHaveTextContent('RSI 81')
  })

  it('opens Research for the exact instrument', () => {
    renderColumn(shelf(1, 1))
    expect(screen.getByRole('link', { name: /T0/ })).toHaveAttribute('href', '/research?symbol=T0&tab=overview&uic=1&assetType=Stock')
  })

  it('carries no rank numbers', () => {
    renderColumn(shelf(3, 3))
    screen.getAllByRole('listitem').forEach((row) => expect(row.textContent).toMatch(/^\s*T\d/))
  })

  it('says an empty lens is empty and offers no See all', () => {
    renderColumn(shelf(0, 0))
    expect(screen.getByText('No stocks match these criteria in the last session.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /See all/ })).not.toBeInTheDocument()
  })

  it('keeps the jump target id of the lens', () => {
    renderColumn(shelf(1, 1))
    expect(screen.getByRole('heading', { level: 3, name: 'Overbought' })).toHaveAttribute('id', 'shelf-overbought')
  })
})
