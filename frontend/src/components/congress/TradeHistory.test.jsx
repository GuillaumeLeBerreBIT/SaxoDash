import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

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

  it('keeps a long unpriceable asset name to one truncated line with the full name on hover', () => {
    const asset = 'Wise CNTY VA Indl Dev Auth Solid Waste 3.80% Due Nov 1, 2040'
    renderWithProviders(<TradeHistory trades={[trade({ asset, ticker: null, priceable: false })]} />)
    const name = screen.getByText(asset)
    expect(name).toHaveAttribute('title', asset)
    expect(name).toHaveClass('truncate')
  })
})
