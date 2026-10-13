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

  it('puts the reading under the indicator name and only the vote word in the signal cell', () => {
    render(<TechnicalsTable votes={votes} />)

    const [rsi, macd, sma] = bodyRows()
    expect(within(rsi).getByRole('rowheader')).toHaveTextContent('RSI (14)Overbought')
    expect(within(rsi).getAllByRole('cell').at(-1)).toHaveTextContent(/^Sell$/)
    expect(within(rsi).getByText('Sell')).toHaveClass('text-red-400')
    expect(within(macd).getByRole('rowheader')).toHaveTextContent('MACD (12, 26)Above signal')
    expect(within(macd).getByText('Buy')).toHaveClass('text-emerald-400')
    expect(within(sma).getAllByRole('cell').at(-1)).toHaveTextContent(/^Neutral$/)
    expect(within(sma).getByText('Neutral')).toHaveClass('text-zinc-400')
  })

  it('lets the indicator column wrap so the table fits a narrow panel', () => {
    render(<TechnicalsTable votes={votes} />)

    expect(within(bodyRows()[0]).getByRole('rowheader')).not.toHaveClass('whitespace-nowrap')
  })

  it('renders nothing for no votes', () => {
    const { container } = render(<TechnicalsTable votes={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
