import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import SetupCard from './SetupCard'

const period = { from: '2023-02-15', to: '2026-08-20' }
const signal = (key, label, grade, mean_excess, cases) => ({
  key, code: key.slice(0, 2).toUpperCase(), label, description: `About ${label}`, kind: 'event', grade, period,
  horizons: { 60: { mean_excess, cases } },
})
const SIGNALS = [
  signal('macd_cross_up', 'MACD bullish cross', 'no_edge', 0.001, 4352),
  signal('momentum_top', 'Momentum leader', 'supported', 0.029, 27280),
  signal('squeeze_breakout', 'Squeeze breakout', 'against', -0.024, 1075),
]
const stock = (active) => ({ ticker: 'NVDA', uic: 211, as_of: '2026-11-13', active, events: {} })

describe('SetupCard', () => {
  it('lists what is active on the latest session, signals that held up first, each with its evidence', () => {
    render(<SetupCard stockSignals={stock(['macd_cross_up', 'momentum_top'])} signals={SIGNALS} />)
    expect(screen.getByRole('heading', { name: 'Setup' })).toBeInTheDocument()
    expect(screen.getByText('Active on the latest session')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Momentum leader')).toBeInTheDocument()
    expect(within(items[0]).getByText('Held up in testing')).toBeInTheDocument()
    expect(within(items[0]).getByText('+2.9% against the average stock over 60 sessions, 27,280 cases')).toBeInTheDocument()
    expect(within(items[1]).getByText('No edge found')).toBeInTheDocument()
    expect(within(items[1]).getByText('No edge found in 4,352 cases')).toBeInTheDocument()
  })

  it('shows where the price stands when the figures exist', () => {
    const standing = { below_high_pct: -12.5, momentum_pct: 40, momentum_rank_pct: 82 }
    render(<SetupCard stockSignals={{ ...stock([]), context: standing }} signals={SIGNALS} />)
    const block = screen.getByTestId('price-standing')
    expect(within(block).getByText('-12.5%')).toBeInTheDocument()
    expect(within(block).getByText('Ahead of 82% of index stocks')).toBeInTheDocument()
  })

  it('leaves the standing out when there are no figures', () => {
    render(<SetupCard stockSignals={stock([])} signals={SIGNALS} />)
    expect(screen.queryByTestId('price-standing')).not.toBeInTheDocument()
  })

  it('says so when nothing is active', () => {
    render(<SetupCard stockSignals={stock([])} signals={SIGNALS} />)
    expect(screen.getByText('No signals active on the latest session')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('states the test period and that results are before costs', () => {
    render(<SetupCard stockSignals={stock([])} signals={SIGNALS} />)
    const footer = screen.getByText(/before costs/)
    expect(footer).toHaveTextContent('against the average stock')
    expect(footer).toHaveTextContent('does not promise')
    expect(footer.textContent).toMatch(/2023/)
  })

  it('never tells the reader to buy or sell', () => {
    const { container } = render(<SetupCard stockSignals={stock(['momentum_top', 'squeeze_breakout'])} signals={SIGNALS} />)
    expect(container.textContent).not.toMatch(/\b(buy|sell)\b/i)
  })

  it('renders nothing without a stock answer or a catalogue', () => {
    expect(render(<SetupCard stockSignals={null} signals={SIGNALS} />).container).toBeEmptyDOMElement()
    expect(render(<SetupCard stockSignals={stock([])} signals={undefined} />).container).toBeEmptyDOMElement()
  })
})
