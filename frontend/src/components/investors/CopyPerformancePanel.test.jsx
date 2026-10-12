import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('../../api/queries')
import * as queries from '../../api/queries'
import CopyPerformancePanel from './CopyPerformancePanel'

const measured = {
  available: true, benchmark: 'S&P 500', holdings: 20, since: '2023-02-15', until: '2026-10-09',
  clone_return_pct: 80, benchmark_return_pct: 50, excess_return_pct: 30,
  clone_cagr_pct: 17.5, benchmark_cagr_pct: 11.75, excess_cagr_pct: 5.75,
  coverage_pct: 91.2, periods: 14, skipped_periods: 0,
  series: [['2023-02-15', 100, 100], ['2026-10-09', 180, 150]],
}

const renderPanel = (answer) => {
  queries.useInvestorCopy.mockReturnValue(answer)
  return render(<CopyPerformancePanel slug="berkshire-hathaway" name="Warren Buffett" />)
}

const tile = (label) => within(screen.getByRole('group', { name: 'Copy performance' })).getByText(label).closest('div').parentElement

describe('CopyPerformancePanel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks for the investor on the page', () => {
    renderPanel({ data: measured })
    expect(queries.useInvestorCopy).toHaveBeenCalledWith('berkshire-hathaway')
  })

  it('states both returns, the gap and which side is ahead', () => {
    renderPanel({ data: measured })
    expect(screen.getByRole('heading', { name: 'If you had copied Warren Buffett' })).toBeInTheDocument()
    expect(tile('Copy')).toHaveTextContent('+80.0%')
    expect(tile('Copy')).toHaveTextContent('since 15 Feb 2023')
    expect(tile('S&P 500')).toHaveTextContent('+50.0%')
    expect(tile('Difference')).toHaveTextContent('+30.0 pts')
    expect(tile('Difference')).toHaveTextContent('ahead of the S&P 500')
    expect(tile('Per year')).toHaveTextContent('+5.8 pts')
    expect(tile('Per year')).toHaveTextContent('+17.5% vs +11.8% a year')
  })

  it('says behind in words, not only with a minus sign', () => {
    renderPanel({ data: { ...measured, clone_return_pct: 20, excess_return_pct: -30 } })
    expect(tile('Difference')).toHaveTextContent('-30.0 pts')
    expect(tile('Difference')).toHaveTextContent('behind the S&P 500')
  })

  it('does not annualise a short history', () => {
    renderPanel({ data: { ...measured, clone_cagr_pct: null, benchmark_cagr_pct: null, excess_cagr_pct: null } })
    expect(tile('Per year')).toHaveTextContent('—')
    expect(tile('Per year')).toHaveTextContent('needs a full year of history')
  })

  it('names both lines and states what the number leaves out', () => {
    renderPanel({ data: measured })
    const legend = screen.getByRole('list', { name: 'Chart series' })
    expect(legend).toHaveTextContent('Copy')
    expect(legend).toHaveTextContent('S&P 500')
    expect(screen.getByText(/no dividends, trading costs or taxes/)).toHaveTextContent('could price 91% of')
    expect(screen.getByText(/Top 20 disclosed holdings/)).toBeInTheDocument()
  })

  it('discloses periods spent in cash', () => {
    renderPanel({ data: { ...measured, skipped_periods: 2 } })
    expect(screen.getByText(/2 of 16 filing periods sat in cash/)).toBeInTheDocument()
  })

  it('explains an investor that has not been measured yet', () => {
    renderPanel({ data: { available: false, benchmark: 'S&P 500', holdings: 20 } })
    expect(screen.getByText(/Not measured yet/)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Copy performance' })).toBeNull()
  })

  it('shows a placeholder while loading and nothing if the request failed', () => {
    const { container, unmount } = renderPanel({ isLoading: true })
    expect(container.firstChild).not.toBeNull()
    expect(screen.queryByRole('heading')).toBeNull()
    unmount()
    const failed = renderPanel({ data: undefined, isLoading: false })
    expect(failed.container.firstChild).toBeNull()
  })
})
