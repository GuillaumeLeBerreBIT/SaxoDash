import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { fmtMoney } from '../../lib/format'
import VerdictCard from './VerdictCard'

const checks = [
  { key: 'roe', label: 'Return on equity', status: 'pass', value: 31.2, threshold: '15%' },
  { key: 'roic', label: 'Return on capital', status: 'unknown', value: null, threshold: '10%' },
  { key: 'margins', label: 'Margins', status: 'pass', value: 22, threshold: '10%' },
  { key: 'earnings_growth', label: 'Earnings growth', status: 'pass', value: 14, threshold: 'above 0' },
  { key: 'revenue_growth', label: 'Revenue growth', status: 'fail', value: 3, threshold: '5% a year' },
  { key: 'debt', label: 'Debt', status: 'pass', value: 0.4, threshold: 'at most 1.0' },
]

const verdict = {
  ticker: 'NVDA',
  name: 'NVIDIA',
  action: 'buy',
  reason: 'Strong business at a cheap price.',
  quality: 'strong',
  valuation: 'cheap',
  as_of: '2026-11-10',
  checks,
  current_pe: 22,
  cheap_below: 120.5,
  expensive_above: 210,
  last_close: 118,
  pct_vs_ma200: -12.04,
  held: false,
  weight_pct: null,
  weight_cap_pct: 10,
}

const renderCard = (state) => render(<VerdictCard verdict={state} />)

describe('VerdictCard', () => {
  it('states the action and both grades in words', () => {
    renderCard({ data: verdict, isLoading: false })
    expect(screen.getByText('Buy')).toBeInTheDocument()
    expect(screen.getByText('Strong business at a cheap price.')).toBeInTheDocument()
    expect(screen.getByText('Quality: Strong')).toBeInTheDocument()
    expect(screen.getByText('Price vs its own history: Cheap')).toBeInTheDocument()
  })

  it('lists six checks, each with a pass, fail or unknown word', () => {
    renderCard({ data: verdict, isLoading: false })
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(6)
    expect(rows[0]).toHaveTextContent('Return on equity 31.2% · needs 15%')
    expect(rows[0]).toHaveTextContent('Pass')
    expect(rows[1]).toHaveTextContent('Return on capital · no figure')
    expect(rows[1]).toHaveTextContent('Unknown')
    expect(rows[4]).toHaveTextContent('Fail')
  })

  it('shows both price levels and the trend', () => {
    renderCard({ data: verdict, isLoading: false })
    expect(screen.getByText(`Cheap below ${fmtMoney(120.5, 'USD')}`)).toBeInTheDocument()
    expect(screen.getByText(`Expensive above ${fmtMoney(210, 'USD')}`)).toBeInTheDocument()
    expect(screen.getByText('12% under its 200-day average')).toBeInTheDocument()
  })

  it('says why there are no price levels', () => {
    renderCard({ data: { ...verdict, valuation: 'not_judged', cheap_below: null, expensive_above: null }, isLoading: false })
    expect(screen.getByText('No price levels: valuation not judged')).toBeInTheDocument()
    expect(screen.queryByText(/Cheap below/)).not.toBeInTheDocument()
  })

  it('shows the date the verdict was computed and the footer', () => {
    renderCard({ data: verdict, isLoading: false })
    expect(screen.getByText('As of 10 Nov 2026')).toBeInTheDocument()
    expect(screen.getByText('Rules, not advice. Sell (review) means check the story, not an order.')).toBeInTheDocument()
  })

  it('shows the weight of a held stock against its cap', () => {
    renderCard({ data: { ...verdict, held: true, weight_pct: 12.5, weight_cap_pct: 10 }, isLoading: false })
    expect(screen.getByText('You hold it at 12.5% of your portfolio (cap 10.0%)')).toBeInTheDocument()
  })

  it('says a stock outside the scan is not covered', () => {
    renderCard({ data: null, isLoading: false })
    expect(screen.getByText('Not covered by the nightly scan')).toBeInTheDocument()
  })

  it('shows the reason for no verdict', () => {
    renderCard({
      data: { ...verdict, action: 'no_verdict', reason: 'Not enough filings to judge.', quality: 'unknown', valuation: 'not_judged' },
      isLoading: false,
    })
    expect(screen.getByText('No verdict')).toBeInTheDocument()
    expect(screen.getByText('Not enough filings to judge.')).toBeInTheDocument()
  })

  it('says the verdict is unavailable when the request failed, not that it is uncovered', () => {
    renderCard({ data: undefined, isError: true, isLoading: false })
    expect(screen.getByText('Verdict unavailable right now')).toBeInTheDocument()
    expect(screen.queryByText('Not covered by the nightly scan')).not.toBeInTheDocument()
  })

  it('omits the held line when the weight is unknown', () => {
    renderCard({ data: { ...verdict, held: true, weight_pct: null }, isLoading: false })
    expect(screen.queryByText(/You hold it/)).not.toBeInTheDocument()
  })

  it('falls back to the raw key for a value it has no label for', () => {
    renderCard({
      data: { ...verdict, action: 'mystery', quality: 'odd', valuation: 'weird', checks: [{ ...checks[0], status: 'maybe' }] },
      isLoading: false,
    })
    expect(screen.getByText('mystery')).toBeInTheDocument()
    expect(screen.getByText('Quality: odd')).toBeInTheDocument()
    expect(screen.getByText('Price vs its own history: weird')).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('maybe')
  })

  it('renders a skeleton while loading', () => {
    renderCard({ data: undefined, isLoading: true })
    expect(screen.getByRole('status', { name: 'Loading verdict' })).toBeInTheDocument()
  })
})
