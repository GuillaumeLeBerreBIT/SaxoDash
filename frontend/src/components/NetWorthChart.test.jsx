import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

import { renderWithProviders } from '../test/renderWithProviders'
import NetWorthChart from './NetWorthChart'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const history = [
  { date: '2026-09-01', portfolio_value: 100, bank_total: 50, net_worth: 150 },
  { date: '2026-09-02', portfolio_value: 110, bank_total: 50, net_worth: 160 },
]

describe('NetWorthChart legend', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    queries.useNetWorthHistory.mockReturnValue({ data: history, isLoading: false, error: null })
  })

  it('names every drawn series in the default view', () => {
    renderWithProviders(<NetWorthChart />)
    const legend = screen.getByRole('list', { name: 'Chart series' })

    expect(legend).toHaveTextContent('Positions')
    expect(legend).toHaveTextContent('Cash (bank + Saxo)')
    expect(legend).toHaveTextContent('Total')
  })

  it('lists only the selected series when a view is chosen', () => {
    renderWithProviders(<NetWorthChart />)
    fireEvent.click(screen.getByRole('button', { name: 'Positions' }))
    const legend = screen.getByRole('list', { name: 'Chart series' })

    expect(legend).toHaveTextContent('Positions')
    expect(legend).not.toHaveTextContent('Total')
  })

  it('draws a dashed swatch for a dimmed series in the All view', () => {
    renderWithProviders(<NetWorthChart />)
    const legend = screen.getByRole('list', { name: 'Chart series' })

    const positions = within(legend).getByText('Positions').querySelector('span')
    const total = within(legend).getByText('Total').querySelector('span')
    expect(positions).toHaveStyle({ borderStyle: 'dashed' })
    expect(total).toHaveStyle({ borderStyle: 'solid' })
  })

  it('omits the legend while the chart shows a placeholder', () => {
    queries.useNetWorthHistory.mockReturnValue({ data: [history[0]], isLoading: false, error: null })
    renderWithProviders(<NetWorthChart />)

    expect(screen.queryByRole('list', { name: 'Chart series' })).toBeNull()
  })
})
