import { Children } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../test/renderWithProviders'
import HistoryAreaChart from './HistoryAreaChart'

vi.mock('../api/queries')
import * as queries from '../api/queries'

const yAxisProps = vi.hoisted(() => [])

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal()
  const spyOnYAxis = (actual) =>
    function SpyChart({ children }) {
      Children.forEach(children, (child) => {
        if (child?.type === actual.YAxis) yAxisProps.push(child.props)
      })
      return null
    }
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => children,
    AreaChart: spyOnYAxis(actual),
    LineChart: spyOnYAxis(actual),
  }
})

const stringHistory = [
  { date: '2026-09-01', portfolio_value: '60000.00', net_worth: '100000.00' },
  { date: '2026-09-02', portfolio_value: '62000.00', net_worth: '103000.00' },
  { date: '2026-09-03', portfolio_value: '63000.00', net_worth: '105000.00' },
]

function domainOf() {
  return yAxisProps.at(-1).domain
}

describe('history charts with string-decimal rows', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    yAxisProps.length = 0
    queries.useNetWorthHistory.mockReturnValue({ data: stringHistory, isLoading: false, error: null })
  })

  it('HistoryAreaChart sets a domain that does not start at zero', () => {
    renderWithProviders(<HistoryAreaChart title="Portfolio" subtitle="s" dataKey="portfolio_value" name="Portfolio" color="#123456" />)
    expect(domainOf()[0]).toBeGreaterThan(0)
  })
})
