import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/renderWithProviders'
import CongressDirectory from './CongressDirectory'

vi.mock('../../api/queries', () => ({
  useCongressMembers: () => ({
    isLoading: false,
    data: {
      window_days: 90,
      most_bought: [{ ticker: 'NVDA', buyers: 4, sellers: 1 }],
      members: [
        { slug: 'nancy-pelosi', name: 'Nancy Pelosi', party: 'Democrat', state_district: 'CA11', photo_url: '', trades: 40, last_filed: '2026-10-02', excess_cagr_pct: 12.3 },
        { slug: 'dan-crenshaw', name: 'Dan Crenshaw', party: 'Republican', state_district: 'TX02', photo_url: '', trades: 12, last_filed: '2026-09-01', excess_cagr_pct: null },
        { slug: 'ro-khanna', name: 'Ro Khanna', party: 'Democrat', state_district: 'CA17', photo_url: '', trades: 5, last_filed: '2026-08-01', excess_cagr_pct: 20.1 },
        { slug: 'tom-suozzi', name: 'Tom Suozzi', party: 'Democrat', state_district: 'NY03', photo_url: '', trades: 3, last_filed: '2026-07-01', excess_cagr_pct: -4.2 },
      ],
    },
  }),
}))

describe('CongressDirectory', () => {
  it('lists members with party, trades and copy edge, linking to their page', () => {
    renderWithProviders(<CongressDirectory />)
    const pelosi = screen.getByRole('link', { name: 'Nancy Pelosi' })
    expect(pelosi).toHaveAttribute('href', '/investors/congress/nancy-pelosi')
    expect(screen.getByText('D-CA11')).toBeInTheDocument()
    expect(screen.getByText('+12.3 pts')).toBeInTheDocument()
  })

  it('shows the most bought shelf with its window', () => {
    renderWithProviders(<CongressDirectory />)
    expect(screen.getByRole('heading', { name: 'Most bought by Congress, last 90 days' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /NVDA/ })).toHaveAttribute('href', '/research?symbol=NVDA&tab=congress')
  })

  const order = () => screen.getAllByRole('row').slice(1).map((row) => row.querySelector('a').textContent)

  it('orders by copy edge, best first, with members lacking one last', () => {
    renderWithProviders(<CongressDirectory />)
    expect(order()).toEqual(['Ro Khanna', 'Nancy Pelosi', 'Tom Suozzi', 'Dan Crenshaw'])
  })

  it('sorts by name from the Member header', () => {
    renderWithProviders(<CongressDirectory />)
    fireEvent.click(screen.getByRole('button', { name: 'Member' }))
    expect(order()).toEqual(['Dan Crenshaw', 'Nancy Pelosi', 'Ro Khanna', 'Tom Suozzi'])
    fireEvent.click(screen.getByRole('button', { name: 'Member' }))
    expect(order()).toEqual(['Tom Suozzi', 'Ro Khanna', 'Nancy Pelosi', 'Dan Crenshaw'])
  })
})
