import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import TechnicalsTable from './TechnicalsTable'

const votes = [
  { key: 'rsi', label: 'RSI (14)', vote: 'sell', value: 74.256, reading: 'Overbought' },
  { key: 'macd', label: 'MACD (12, 26)', vote: 'buy', value: 1.5, reading: 'Above signal' },
  { key: 'sma50', label: 'SMA 50', vote: 'neutral', value: 120.1, reading: 'Price at' },
]

const bodyRows = () => within(screen.getAllByRole('rowgroup')[1]).getAllByRole('row')

describe('TechnicalsTable', () => {
  it('has the three column headers', () => {
    render(<TechnicalsTable votes={votes} />)

    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((header) => header.textContent)).toEqual(['Indicator', 'Value', 'Signal'])
    headers.forEach((header) => expect(header).toHaveAttribute('scope', 'col'))
  })

  it('has one row per vote', () => {
    render(<TechnicalsTable votes={votes} />)

    expect(bodyRows()).toHaveLength(3)
    expect(within(bodyRows()[0]).getByText('RSI (14)')).toBeInTheDocument()
  })

  it('shows the value with two decimals', () => {
    render(<TechnicalsTable votes={votes} />)

    expect(screen.getByText('74.26')).toBeInTheDocument()
    expect(screen.getByText('1.50')).toBeInTheDocument()
    expect(screen.getByText('120.10')).toBeInTheDocument()
  })

  it('shows the reading followed by the vote word, coloured by vote', () => {
    render(<TechnicalsTable votes={votes} />)

    const [rsi, macd, sma] = bodyRows()
    expect(rsi).toHaveTextContent(/Overbought.*Sell/)
    expect(within(rsi).getByText('Sell')).toHaveClass('text-red-400')
    expect(macd).toHaveTextContent(/Above signal.*Buy/)
    expect(within(macd).getByText('Buy')).toHaveClass('text-emerald-400')
    expect(sma).toHaveTextContent(/Price at.*Neutral/)
    expect(within(sma).getByText('Neutral')).toHaveClass('text-zinc-400')
  })

  it('renders nothing for no votes', () => {
    const { container } = render(<TechnicalsTable votes={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
