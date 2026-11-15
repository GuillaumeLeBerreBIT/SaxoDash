import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import AnswerCard from './AnswerCard'

const check = (key, label, status, value = 20) => ({ key, label, status, value, threshold: '15%' })
const PASSING = [
  check('roe', 'Return on equity', 'pass'), check('roic', 'Return on capital', 'pass'), check('margins', 'Margins', 'pass'),
]
const verdictData = (over = {}) => ({
  action: 'hold', quality: 'strong', valuation: 'expensive', as_of: '2026-11-14', reason: 'x',
  cheap_below: 249.55, expensive_above: 316.01, pct_vs_ma200: 12.3, checks: PASSING,
  held: true, weight_pct: 11.1, weight_cap_pct: 15, ...over,
})
const sentence = { word: 'HOLD', tone: undefined, why: 'Strong company, expensive price.', next: 'Buy would show below US$249.55.', earnings: null }
const position = { qty: 10, value: '3232.00', pnl: '215.00', pnl_pct: 7.1, weight: 11.1, avg_cost: 301.2, currency: 'USD', price_source: 'live' }

const renderCard = (over = {}) =>
  render(<AnswerCard symbol="AAPL" verdict={{ isLoading: false, data: verdictData() }} sentence={sentence} position={position} {...over} />)

describe('AnswerCard', () => {
  it('says what to do and why in one line', () => {
    renderCard()
    const card = screen.getByTestId('answer-card')
    expect(within(card).getByText('HOLD')).toBeInTheDocument()
    expect(within(card).getByText('Strong company, expensive price.')).toBeInTheDocument()
    expect(within(card).getByText('Buy would show below US$249.55.')).toBeInTheDocument()
  })

  it('counts the checks and keeps the list closed until asked', () => {
    renderCard()
    expect(screen.getByText('3 of 3 checks pass')).toBeInTheDocument()
    expect(screen.queryByText(/Return on equity 20%/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show the checks' }))
    expect(screen.getByText(/Return on equity 20%/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide the checks' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('names the checks that fail', () => {
    const checks = [check('roe', 'Return on equity', 'pass'), check('debt', 'Debt', 'fail', 2.4), check('cash', 'Cash behind the profit', 'unknown', null)]
    renderCard({ verdict: { isLoading: false, data: verdictData({ quality: 'weak', checks }) } })
    expect(screen.getByText('1 of 2 checks fail')).toBeInTheDocument()
    expect(screen.getByText('Fails: Debt.')).toBeInTheDocument()
    expect(screen.getByText('No figure for: Cash behind the profit.')).toBeInTheDocument()
  })

  it('gives both price levels and where the price stands against them', () => {
    renderCard()
    const cell = screen.getByTestId('answer-price')
    expect(within(cell).getByText('Expensive')).toBeInTheDocument()
    expect(within(cell).getByText('Cheap for this company below US$249.55')).toBeInTheDocument()
    expect(within(cell).getByText('Expensive above US$316.01')).toBeInTheDocument()
  })

  it('shows what you hold, the result and the weight against the cap', () => {
    renderCard()
    const cell = screen.getByTestId('answer-you')
    expect(within(cell).getByText('10 shares · €3,232')).toBeInTheDocument()
    expect(within(cell).getByText('+€215')).toHaveClass('text-up')
    expect(within(cell).getByText('11.1% of your portfolio, cap 15.0%')).toBeInTheDocument()
  })

  it('says so when the stock is not held', () => {
    renderCard({ position: null })
    expect(within(screen.getByTestId('answer-you')).getByText('Not in your portfolio')).toBeInTheDocument()
  })

  it('keeps your position when there is no verdict', () => {
    renderCard({ verdict: { isLoading: false, data: null }, sentence: null })
    expect(screen.getByText('No verdict: not covered by the nightly scan.')).toBeInTheDocument()
    expect(within(screen.getByTestId('answer-you')).getByText('10 shares · €3,232')).toBeInTheDocument()
    expect(screen.queryByTestId('answer-price')).toBeNull()
  })

  it('offers a retry when the verdict cannot be loaded', () => {
    const refetch = vi.fn()
    renderCard({ verdict: { isLoading: false, isError: true, refetch }, sentence: null })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('explains why an instrument without company data has no verdict', () => {
    renderCard({ verdict: undefined, sentence: null, note: 'This is an ETF, so there is no company to judge.' })
    expect(screen.getByText('This is an ETF, so there is no company to judge.')).toBeInTheDocument()
  })
})
