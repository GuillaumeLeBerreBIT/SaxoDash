import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import { renderWithProviders } from '../test/renderWithProviders'
import CongressMember from './CongressMember'

const measured = {
  available: true, benchmark: 'S&P 500', holdings: null, since: '2021-02-15', until: '2026-10-09',
  clone_return_pct: 80, benchmark_return_pct: 50, excess_return_pct: 30,
  clone_cagr_pct: 17.5, benchmark_cagr_pct: 11.75, excess_cagr_pct: 5.75,
  coverage_pct: 91.2, periods: 14, skipped_periods: 0,
  series: [['2021-02-15', 100, 100], ['2026-10-09', 180, 150]],
}

let override = {}

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
      ...override,
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
  beforeEach(() => { override = {} })

  it('congress copy performance shows clone vs S&P and what was left out', () => {
    override = { copy: measured, basis: { trades: 40, since: '2021-01-01', unpriced: 3, unseen_sales: 2 } }
    render()
    const figures = screen.getByRole('group', { name: 'Copy performance' })
    const tile = (label) => within(figures).getByText(label).closest('div').parentElement
    expect(tile('Copy')).toHaveTextContent('+80.0%')
    expect(tile('S&P 500')).toHaveTextContent('+50.0%')
    expect(tile('Difference')).toHaveTextContent('+30.0 pts')
    expect(tile('Left out')).toHaveTextContent('3')
    expect(tile('Left out')).toHaveTextContent('unpriced trades · 2 unseen sales')
    expect(screen.getByText(/no dividends, trading costs or taxes/)).toHaveTextContent('could price 91% of')
    expect(screen.getByRole('list', { name: 'Chart series' })).toHaveTextContent('S&P 500')
  })

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
