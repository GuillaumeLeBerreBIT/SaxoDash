import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/renderWithProviders'
import Attribution from './Attribution'

const positions = [
  { ticker: 'NVDA', cost: '1000', pnl: '600' },
  { ticker: 'AAPL', cost: '1000', pnl: '-100' },
]

describe('Attribution', () => {
  it('ranks holdings by pnl, most contribution first', () => {
    renderWithProviders(<Attribution positions={positions} />)
    const tickers = screen
      .getAllByRole('link')
      .filter((el) => ['NVDA', 'AAPL'].includes(el.textContent))
    expect(tickers.map((el) => el.textContent)).toEqual(['NVDA', 'AAPL'])
  })

  it('names the top contributor in the footnote', () => {
    renderWithProviders(<Attribution positions={positions} />)
    expect(screen.getByText(/NVDA alone produced/)).toBeInTheDocument()
  })

  it('links each ticker to its research page', () => {
    renderWithProviders(<Attribution positions={positions} />)
    expect(screen.getByRole('link', { name: 'NVDA' })).toHaveAttribute(
      'href',
      '/research?symbol=NVDA',
    )
  })
})
