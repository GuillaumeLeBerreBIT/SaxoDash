import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PriceSpark from './PriceSpark'

describe('Discover price sparkline', () => {
  it('centres flat prices and keeps the last marker fully visible', () => {
    render(<PriceSpark values={[90, 90]} cheapBelow={100} expensiveAbove={150} label="Weekly closes" />)
    const chart = screen.getByRole('img')
    const dot = chart.querySelector('circle')
    expect(Number(dot.getAttribute('cy'))).toBe(32)
    expect(Number(dot.getAttribute('cx')) + Number(dot.getAttribute('r'))).toBeLessThanOrEqual(240)
    expect(chart.querySelector('[data-zone="cheap"]')).toHaveAttribute('height', '64')
  })

  it('shows a plain price line when the reference range is incomplete or inverted', () => {
    const chart = (high) => <PriceSpark values={[110, 120]} cheapBelow={130} expensiveAbove={high} label="Weekly closes" />
    const { rerender } = render(chart(null))
    expect(screen.getByRole('img').querySelector('rect')).toBeNull()
    rerender(chart(100))
    expect(screen.getByRole('img').querySelector('rect')).toBeNull()
  })

  it('leaves weekly closes at both exact thresholds unshaded', () => {
    render(<PriceSpark values={[100, 125, 150]} cheapBelow={100} expensiveAbove={150} label="Weekly closes" />)
    expect(screen.getByRole('img').querySelector('rect')).toBeNull()
  })

  it('explains missing history without reserving a blank chart', () => {
    render(<PriceSpark values={[90]} label="Weekly closes" />)
    expect(screen.getByText('Price history unavailable')).toBeVisible()
  })

  it('labels a full-height upper zone when prices all sit above the range', () => {
    render(<PriceSpark values={[190, 200, 195]} cheapBelow={100} expensiveAbove={150} label="Weekly closes" />)
    const chart = screen.getByRole('img', { name: /above the usual P\/E range/ })
    expect(chart.querySelector('[data-zone="expensive"]')).toHaveAttribute('height', '64')
    expect(chart.querySelector('[data-zone="cheap"]')).toBeNull()
  })

  it('identifies both bands, with different gradients for each chart', () => {
    const props = { values: [90, 110, 160], cheapBelow: 100, expensiveAbove: 150, label: 'Weekly closes' }
    render(<><PriceSpark {...props} /><PriceSpark {...props} /></>)
    const charts = screen.getAllByRole('img', { name: /lower band.*upper band/i })
    const fills = charts.flatMap(chart => Array.from(chart.querySelectorAll('[data-zone]'), zone => zone.getAttribute('fill')))
    expect(new Set(fills).size).toBe(4)
    expect(charts[0].querySelectorAll('linearGradient')).toHaveLength(2)
  })
})
