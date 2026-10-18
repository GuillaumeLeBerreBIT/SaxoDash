import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { renderWithProviders } from '../test/renderWithProviders'
import CongressMember from './CongressMember'

vi.mock('../api/queries', () => ({
  useCongressMember: () => ({
    isLoading: false,
    data: {
      slug: 'nancy-pelosi', name: 'Nancy Pelosi', party: 'Democrat', state_district: 'CA11', photo_url: '',
      last_filed: '2026-10-02', excess_cagr_pct: null,
      basis: { trades: 2, paper_reports: 1, since: '2021-01-01' },
      holdings: [{ ticker: 'NVDA', value: 1000, weight_pct: 100 }],
      trades: [{ asset: 'NVIDIA Corporation (NVDA)', ticker: 'NVDA', asset_type: 'OP', owner: 'SP', kind: 'purchase', option: 'call', exercise: false,
        traded_on: '2025-01-14', filed_on: '2025-01-17', amount_low: 250001, amount_high: 500000, priceable: true }],
      copy: { available: false, benchmark: 'S&P 500', holdings: null },
    },
  }),
}))

function render() {
  return renderWithProviders(
    <Routes><Route path="/investors/congress/:slug" element={<CongressMember />} /></Routes>,
    { route: '/investors/congress/nancy-pelosi' },
  )
}

describe('CongressMember', () => {
  it('shows the member, the estimated basis and the holdings', () => {
    render()
    expect(screen.getByRole('heading', { level: 1, name: 'Nancy Pelosi' })).toBeInTheDocument()
    expect(screen.getByText(/Estimated from 2 disclosed trades since 2021/)).toBeInTheDocument()
    expect(screen.getByText(/1 paper report not included/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'NVDA' })[0]).toHaveAttribute('href', '/research?symbol=NVDA&tab=congress')
  })

  it('shows each holding with its logo', () => {
    render()
    const holdings = screen.getByRole('table', { name: 'Estimated holdings' })
    const link = within(holdings).getByRole('link', { name: 'NVDA' })
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://api.elbstream.com/logos/symbol/NVDA')
  })

  it('lists trades with owner, label and range', () => {
    render()
    expect(screen.getByText('Bought (call)')).toBeInTheDocument()
    expect(screen.getByText('$250,001–$500,000')).toBeInTheDocument()
    expect(screen.getByText('Spouse')).toBeInTheDocument()
  })
})
