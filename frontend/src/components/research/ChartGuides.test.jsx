import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { PriceZones, StopGuide } from './ChartGuides'
import EntryBanner from './EntryBanner'

const colors = { up: 'up', down: 'down', warn: 'warn', warnText: 'warnText', axisCategory: 'ink2', pane: 'pane' }
const data = Array.from({ length: 40 }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, open: 100, high: 104, low: 96, close: 102 }))
const geometry = (chartW = 800) => ({ xAt: (i) => 10 + i * 20, scaleY: (value) => 410 - value * 2, chartH: 300, chartW, candleWidth: 8 })
const draw = (node) => render(<svg>{node}</svg>)

describe('PriceZones', () => {
  it('shades below the buy price and above the expensive price, each named in words', () => {
    draw(<PriceZones zones={{ buyBelow: 80, expensiveAbove: 150, buyable: true }} currency="USD" geometry={geometry()} colors={colors} />)
    expect(screen.getByTestId('buy-zone').querySelector('rect')).toHaveAttribute('fill', 'up')
    expect(screen.getByTestId('expensive-zone').querySelector('rect')).toHaveAttribute('fill', 'warn')
    expect(screen.getByTestId('price-zones')).toHaveTextContent(/BUY ZONE · cheap for this company below \S*80\.00/)
    expect(screen.getByTestId('price-zones')).toHaveTextContent(/EXPENSIVE for this company above \S*150\.00/)
  })

  it('points at a zone that is out of view instead of shading it', () => {
    draw(<PriceZones zones={{ buyBelow: 20, expensiveAbove: 400, buyable: true }} currency="USD" geometry={geometry()} colors={colors} />)
    expect(screen.queryByTestId('buy-zone')).not.toBeInTheDocument()
    expect(screen.queryByTestId('expensive-zone')).not.toBeInTheDocument()
    expect(screen.getByTestId('price-zones')).toHaveTextContent(/↓ BUY ZONE/)
    expect(screen.getByTestId('price-zones')).toHaveTextContent(/↑ EXPENSIVE/)
  })

  it('does not call a cheap price a buy zone for a company that fails the checks', () => {
    draw(<PriceZones zones={{ buyBelow: 80, expensiveAbove: 150, buyable: false }} currency="USD" geometry={geometry()} colors={colors} />)
    expect(screen.getByTestId('price-zones')).toHaveTextContent(/CHEAP for this company below/)
    expect(screen.getByTestId('price-zones')).not.toHaveTextContent('BUY ZONE')
    expect(screen.getByTestId('buy-zone').querySelector('rect')).toHaveAttribute('fill', 'ink2')
    expect(screen.getByTestId('buy-zone').querySelector('line')).toHaveAttribute('stroke', 'ink2')
  })

  it('writes the zone labels at 12px, the expensive one in the warn text colour', () => {
    draw(<PriceZones zones={{ buyBelow: 80, expensiveAbove: 150, buyable: true }} currency="USD" geometry={geometry()} colors={colors} />)
    const labels = [...screen.getByTestId('price-zones').querySelectorAll('text')]
    expect(labels.map((label) => label.getAttribute('font-size'))).toEqual(['12', '12'])
    expect(labels[1]).toHaveAttribute('fill', 'warnText')
  })

  it('shortens the labels on a phone-width chart so they are not clipped', () => {
    draw(<PriceZones zones={{ buyBelow: 80, expensiveAbove: 150, buyable: true }} currency="USD" geometry={geometry(330)} colors={colors} />)
    expect(screen.getByTestId('price-zones')).toHaveTextContent(/BUY ZONE below \S*80\.00/)
    expect(screen.getByTestId('price-zones')).toHaveTextContent(/EXPENSIVE above \S*150\.00/)
    expect(screen.getByTestId('price-zones')).not.toHaveTextContent('for this company')
  })

  it('shortens the cheap label too when the company is not a buy', () => {
    draw(<PriceZones zones={{ buyBelow: 80, expensiveAbove: 150, buyable: false }} currency="USD" geometry={geometry(330)} colors={colors} />)
    expect(screen.getByTestId('price-zones')).toHaveTextContent(/CHEAP below \S*80\.00/)
  })

  it('draws nothing without zones', () => {
    const { container } = draw(<PriceZones zones={null} currency="USD" geometry={geometry()} colors={colors} />)
    expect(container.querySelector('[data-testid="price-zones"]')).toBeNull()
  })
})

describe('StopGuide', () => {
  const plan = { asOf: data[39].date, stop: { price: 92, source: 'atr' }, stopDistancePct: -9.8, currency: 'USD', size: { shares: 16, lossAtStop: 290 } }

  it('draws a suggested stop-loss as a dashed line and says how far below today it is', () => {
    draw(<StopGuide plan={plan} data={data} geometry={geometry()} colors={colors} />)
    const guide = screen.getByTestId('stop-guide')
    expect(guide.querySelector('line')).toHaveAttribute('stroke-dasharray', '6 4')
    expect(guide).toHaveTextContent(/Stop-loss \S*92\.00 · 9\.8% below today's close/)
  })

  it('leaves the line to your own stop line', () => {
    draw(<StopGuide plan={{ ...plan, stop: { price: 92, source: 'yours' } }} data={data} geometry={geometry()} colors={colors} />)
    expect(screen.getByTestId('stop-guide').querySelector('line')).toBeNull()
  })

  it('is short on a narrow chart and absent when the latest bar or the stop is out of view', () => {
    draw(<StopGuide plan={plan} data={data} geometry={geometry(360)} colors={colors} />)
    expect(screen.getByTestId('stop-guide')).not.toHaveTextContent('below')
    expect(draw(<StopGuide plan={plan} data={data.slice(0, 30)} geometry={geometry()} colors={colors} />).container.querySelector('[data-testid="stop-guide"]')).toBeNull()
    expect(draw(<StopGuide plan={{ ...plan, stop: { price: 10, source: 'atr' } }} data={data} geometry={geometry()} colors={colors} />).container.querySelector('[data-testid="stop-guide"]')).toBeNull()
  })
})

describe('EntryBanner', () => {
  it('shows the word in its tone, the reason, the price that changes it and the risk', () => {
    render(<EntryBanner sentence={{ word: 'BUY', tone: 'up', why: 'Strong company, cheap price.', next: 'In the buy zone.', risk: 'Stop at $90.' }} />)
    expect(screen.getByText('BUY')).toHaveClass('text-up')
    expect(screen.getByTestId('entry-banner')).toHaveTextContent('Strong company, cheap price.In the buy zone.Stop at $90.')
  })

  it('is absent without a sentence', () => {
    const { container } = render(<EntryBanner sentence={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
