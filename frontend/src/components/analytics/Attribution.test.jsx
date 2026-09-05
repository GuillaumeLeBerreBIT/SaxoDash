import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Attribution from './Attribution'

const positions = [
  { ticker: 'NVDA', cost: '1000', pnl: '600' },
  { ticker: 'AAPL', cost: '1000', pnl: '-100' },
]

describe('Attribution', () => {
  it('ranks holdings by pnl, most contribution first', () => {
    render(<Attribution positions={positions} />)
    const tickers = screen.getAllByText((content, el) => el.tagName === 'SPAN' && (content === 'NVDA' || content === 'AAPL'))
    expect(tickers.map((el) => el.textContent)).toEqual(['NVDA', 'AAPL'])
  })

  it('names the top contributor in the footnote', () => {
    render(<Attribution positions={positions} />)
    expect(screen.getByText(/NVDA alone produced/)).toBeInTheDocument()
  })
})
