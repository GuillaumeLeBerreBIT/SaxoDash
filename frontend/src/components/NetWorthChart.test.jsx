import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

import { renderWithProviders } from '../test/renderWithProviders'
import NetWorthChart from './NetWorthChart'
import { chartPalette } from '../lib/charts'
import { DEFAULT_APPEARANCE } from '../lib/theme'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const history = [
  { date: '2026-09-01', portfolio_value: 100, bank_total: 50, net_worth: 150 },
  { date: '2026-09-02', portfolio_value: 110, bank_total: 50, net_worth: 160 },
]

const asCss = (color) => {
  const probe = document.createElement('span')
  probe.style.borderColor = color
  return probe.style.borderColor
}

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

  it('colours the series from the categorical palette, not the move colours', () => {
    const c = chartPalette(DEFAULT_APPEARANCE)
    renderWithProviders(<NetWorthChart />)
    const legend = screen.getByRole('list', { name: 'Chart series' })
    const swatch = (name) => within(legend).getByText(name).querySelector('span').style.borderColor
    expect(swatch('Positions')).toBe(asCss(c.series[0]))
    expect(swatch('Cash (bank + Saxo)')).toBe(asCss(c.series[1]))
    expect(swatch('Total')).toBe(asCss(c.series[2]))
    expect(swatch('Positions')).not.toBe(asCss(c.up))
  })

  it('keeps view pill labels on one line', () => {
    renderWithProviders(<NetWorthChart />)
    expect(screen.getByRole('button', { name: 'Cash (bank + Saxo)' })).toHaveClass('whitespace-nowrap')
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
