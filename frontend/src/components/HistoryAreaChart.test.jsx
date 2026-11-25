import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../test/renderWithProviders'
import HistoryAreaChart from './HistoryAreaChart'

vi.mock('../api/queries')
import * as queries from '../api/queries'

function renderChart(data) {
  queries.useNetWorthHistory.mockReturnValue({ data, isLoading: false, error: null })
  renderWithProviders(
    <HistoryAreaChart title="Portfolio value" subtitle="over time" dataKey="portfolio_value" name="Portfolio" color="#123456" />,
  )
}

describe('HistoryAreaChart', () => {
  it('does not count rows without a value toward the minimum points', () => {
    renderChart([
      { date: '2026-06-01', portfolio_value: null },
      { date: '2026-06-02', portfolio_value: null },
      { date: '2026-06-03', portfolio_value: 100 },
    ])
    expect(screen.getByText(/Only one day of history/)).toBeInTheDocument()
  })

  it('shows the no-data placeholder when every row is null', () => {
    renderChart([
      { date: '2026-06-01', portfolio_value: null },
      { date: '2026-06-02', portfolio_value: null },
    ])
    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })

  it('draws once two rows carry a value', () => {
    renderChart([
      { date: '2026-06-01', portfolio_value: null },
      { date: '2026-06-02', portfolio_value: 100 },
      { date: '2026-06-03', portfolio_value: 110 },
    ])
    expect(screen.queryByText(/Only one day of history/)).toBeNull()
    expect(screen.queryByText('No data yet')).toBeNull()
  })
})
