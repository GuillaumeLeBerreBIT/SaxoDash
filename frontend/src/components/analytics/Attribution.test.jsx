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

  it('states contribution in points, never as a percentage of points', () => {
    renderWithProviders(<Attribution positions={positions} />)
    expect(screen.getByText('+30.0 pts')).toBeInTheDocument()
    expect(screen.getByText('-5.0 pts')).toBeInTheDocument()
    expect(screen.queryByText(/pp$/)).not.toBeInTheDocument()
  })

  it('names the largest loss and drops the share of gain when the total is a loss', () => {
    const losing = [
      { ticker: 'NVDA', cost: '1000', pnl: '100' },
      { ticker: 'AAPL', cost: '1000', pnl: '-400' },
    ]
    renderWithProviders(<Attribution positions={losing} />)
    expect(screen.getByText('AAPL is the largest loss, taking 20.0 points off the total return.')).toBeInTheDocument()
    expect(screen.queryByText(/of the total gain/)).not.toBeInTheDocument()
    expect(screen.queryByText('-33%')).not.toBeInTheDocument()
    expect(screen.queryByText('133%')).not.toBeInTheDocument()
  })
})
