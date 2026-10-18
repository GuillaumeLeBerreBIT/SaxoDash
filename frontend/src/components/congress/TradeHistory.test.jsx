import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import TradeHistory from './TradeHistory'

const trade = (over) => ({
  asset: 'NVIDIA Corporation', ticker: 'NVDA', owner: 'self', kind: 'purchase', option: '', exercise: false,
  traded_on: '2026-09-01', filed_on: '2026-09-20', amount_low: 15001, amount_high: 50000, priceable: true, amended: false, ...over,
})

describe('TradeHistory', () => {
  it('marks only trades from an amended report', () => {
    renderWithProviders(<TradeHistory trades={[trade({ amended: true }), trade({ ticker: 'AAPL' })]} />)
    expect(screen.getAllByText('Amended')).toHaveLength(1)
  })

  it('shows the stock\'s logo inside its ticker link', () => {
    renderWithProviders(<TradeHistory trades={[trade()]} />)
    const link = screen.getByRole('link', { name: 'NVDA' })
    expect(link).toHaveAttribute('href', '/research?symbol=NVDA&tab=congress')
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://api.elbstream.com/logos/symbol/NVDA')
  })

  it('gives an asset without a ticker a letter mark instead of a logo', () => {
    renderWithProviders(<TradeHistory trades={[trade({ asset: 'Vidant bonds', ticker: null, priceable: false })]} />)
    const cell = screen.getByText('Vidant bonds').closest('td')
    expect(cell.querySelector('img')).toBeNull()
    expect(within(cell).getByText('V')).toBeInTheDocument()
  })

  it('keeps a long unpriceable asset name to one truncated line with the full name on hover', () => {
    const asset = 'Wise CNTY VA Indl Dev Auth Solid Waste 3.80% Due Nov 1, 2040'
    renderWithProviders(<TradeHistory trades={[trade({ asset, ticker: null, priceable: false })]} />)
    const name = screen.getByText(asset)
    expect(name).toHaveAttribute('title', asset)
    expect(name).toHaveClass('truncate')
  })
})
