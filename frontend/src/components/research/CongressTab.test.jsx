import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import CongressTab from './CongressTab'

const ownership = vi.fn()
vi.mock('../../api/queries', () => ({ useCongressOwnership: (ticker) => ownership(ticker) }))

describe('CongressTab', () => {
  it('refuses a non-USD listing without asking', () => {
    ownership.mockReturnValue({ isLoading: false })
    renderWithProviders(<CongressTab symbol="ASML" currency="EUR" />)
    expect(screen.getByText('No House data for ASML')).toBeInTheDocument()
    expect(ownership).toHaveBeenLastCalledWith(null)
  })

  it('lists members and their trades', () => {
    ownership.mockReturnValue({
      isLoading: false,
      data: {
        window_days: 90, ticker: 'NVDA', stock: { holders: 1, buyers: 1, sellers: 0 },
        members: [{ slug: 'nancy-pelosi', name: 'Nancy Pelosi', party: 'Democrat', state_district: 'CA11', holds_weight_pct: 60,
          trades: [{ asset: 'NVIDIA', ticker: 'NVDA', asset_type: 'OP', owner: 'SP', kind: 'purchase', option: 'call', exercise: false,
            traded_on: '2025-01-14', filed_on: '2025-01-17', amount_low: 250001, amount_high: 500000, priceable: true }] }],
      },
    })
    renderWithProviders(<CongressTab symbol="NVDA" currency="USD" />)
    expect(screen.getByRole('link', { name: 'Nancy Pelosi' })).toHaveAttribute('href', '/investors/congress/nancy-pelosi')
    expect(screen.getByText('Bought (call)')).toBeInTheDocument()
    expect(screen.getByText('$250,001–$500,000')).toBeInTheDocument()
    expect(screen.queryByText('Asset')).not.toBeInTheDocument()
  })

  it('says when no member has traded the stock', () => {
    ownership.mockReturnValue({ isLoading: false, data: { window_days: 90, ticker: 'ZZZZ', stock: null, members: [] } })
    renderWithProviders(<CongressTab symbol="ZZZZ" currency="USD" />)
    expect(screen.getByText('No House member has disclosed a ZZZZ trade since 2021')).toBeInTheDocument()
  })
})
