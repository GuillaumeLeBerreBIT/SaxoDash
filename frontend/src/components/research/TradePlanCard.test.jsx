import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import TradePlanCard from './TradePlanCard'

const BARS = [{ high: 100, low: 99, close: 99.5 }, ...Array.from({ length: 14 }, () => ({ high: 101.25, low: 98.75, close: 100 }))]
const base = { bars: BARS, currency: 'USD', positions: [{ currency: 'USD', fx_rate: '1' }], portfolioValue: 50000 }
const row = (label) => screen.getByText(label).closest('div')

describe('TradePlanCard', () => {
  beforeEach(() => window.localStorage.clear())

  it('suggests a stop two average ranges below the close and sizes the position, held to the weight cap', () => {
    render(<TradePlanCard {...base} />)
    expect(screen.getByRole('heading', { name: 'Trade plan' })).toBeInTheDocument()
    expect(row('Stop')).toHaveTextContent('$95.00')
    expect(row('Stop')).toHaveTextContent('2 × the average daily range (14 sessions)')
    expect(row('Distance to the stop')).toHaveTextContent('-5.0%')
    expect(row('Size at 1% risk')).toHaveTextContent('75 shares')
    expect(row('Size at 1% risk')).toHaveTextContent('15.0% of your portfolio')
    expect(row('Loss if the stop is hit')).toHaveTextContent('375')
    expect(screen.queryByText('Reward for each unit of risk')).not.toBeInTheDocument()
  })

  it('uses your own stop and target', () => {
    render(<TradePlanCard {...base} note={{ stop_price: '92', target_price: '124' }} />)
    expect(row('Stop')).toHaveTextContent('Your stop')
    expect(row('Reward for each unit of risk')).toHaveTextContent('3.0 to 1')
  })

  it('resizes when another risk is chosen and remembers the choice', () => {
    render(<TradePlanCard {...base} />)
    fireEvent.click(screen.getByRole('button', { name: '0.5%' }))
    expect(row('Size at 0.5% risk')).toHaveTextContent('50 shares')
    expect(window.localStorage.getItem('saxodash:trade-risk-pct')).toBe('0.5')
  })

  it('opens with the risk chosen last time', () => {
    window.localStorage.setItem('saxodash:trade-risk-pct', '2')
    render(<TradePlanCard {...base} />)
    expect(screen.getByRole('button', { name: '2%' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Size at 2% risk')).toBeInTheDocument()
  })

  it('counts what you already hold against the same portfolio value the size uses', () => {
    render(<TradePlanCard {...base} position={{ value: '6000', weight: '40' }} />)
    expect(row('Size at 1% risk')).toHaveTextContent('15 shares')
    expect(row('Loss if the stop is hit')).toHaveTextContent('Size limited by the weight cap')
  })

  it('leaves the size out without a portfolio value or an exchange rate', () => {
    render(<TradePlanCard {...base} positions={[]} />)
    expect(row('Stop')).toHaveTextContent('$95.00')
    expect(screen.queryByText(/Size at/)).not.toBeInTheDocument()
  })

  it('warns when the company reports within ten days', () => {
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    render(<TradePlanCard {...base} nextEarnings={{ date: soon }} />)
    expect(screen.getByText(/the price can gap past a stop/)).toBeInTheDocument()
  })

  it('draws nothing without enough bars', () => {
    const { container } = render(<TradePlanCard {...base} bars={BARS.slice(0, 5)} />)
    expect(container).toBeEmptyDOMElement()
  })
})
