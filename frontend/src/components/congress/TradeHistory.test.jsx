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
})
