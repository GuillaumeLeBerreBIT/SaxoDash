import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import AnalystRatingCard from './AnalystRatingCard'

const month = (period, strong_buy, buy, hold, sell, strong_sell) => ({ period, strong_buy, buy, hold, sell, strong_sell })
const latest = month('2026-09-01', 12, 22, 15, 3, 1)
const history = [month('2026-06-01', 14, 24, 15, 2, 0), month('2026-07-01', 13, 23, 16, 2, 0), month('2026-08-01', 13, 24, 14, 3, 0), latest]

describe('AnalystRatingCard', () => {
  it('shows the gauge, the counts and how many analysts', () => {
    render(<AnalystRatingCard fundamentals={{ recommendation: latest, recommendation_history: history }} />)

    expect(screen.getByRole('img', { name: /analyst rating: buy/i })).toBeInTheDocument()
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(['Strong sell', 'Sell', 'Hold', 'Buy', 'Strong buy'])
    expect(screen.getByText(/53 analysts/)).toBeInTheDocument()
  })

  it('draws one trend column per month, oldest first', () => {
    render(<AnalystRatingCard fundamentals={{ recommendation: latest, recommendation_history: history }} />)

    const trend = screen.getByRole('list', { name: 'Analyst ratings by month' })
    const months = within(trend).getAllByRole('listitem')
    expect(months).toHaveLength(4)
    expect(months[0]).toHaveAccessibleName(/Jun 26: 14 strong buy, 24 buy, 15 hold, 2 sell, 0 strong sell/i)
  })

  it('leaves the trend out with a single month', () => {
    render(<AnalystRatingCard fundamentals={{ recommendation: latest, recommendation_history: [latest] }} />)

    expect(screen.queryByRole('list', { name: 'Analyst ratings by month' })).not.toBeInTheDocument()
  })

  it('renders nothing without a recommendation', () => {
    const { container } = render(<AnalystRatingCard fundamentals={{ recommendation: null, recommendation_history: [] }} />)

    expect(container).toBeEmptyDOMElement()
  })
})
