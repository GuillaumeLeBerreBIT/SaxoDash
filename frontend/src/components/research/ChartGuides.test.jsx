import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import * as ChartGuides from './ChartGuides'
import { GapBoxes, GuideTags, HighLine, StopGuide } from './ChartGuides'
import EntryBanner from './EntryBanner'

const colors = { accent: 'accent', up: 'up', down: 'down', warn: 'warn', warnText: 'warnText', axisCategory: 'ink2', pane: 'pane', tooltip: { bg: 'raised' } }
const data = Array.from({ length: 40 }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, open: 100, high: 104, low: 96, close: 102 }))
const geometry = (chartW = 800) => ({ xAt: (i) => 10 + i * 20, scaleY: (value) => 410 - value * 2, chartH: 300, chartW, candleWidth: 8 })
const draw = (node) => render(<svg>{node}</svg>)

const width = 862

describe('GuideTags', () => {
  const tagY = (testId) => Number(screen.getByTestId(testId).querySelector('rect[data-badge]').getAttribute('y'))
  it('pins a high above the visible prices to the top edge with an up marker', () => {
    draw(<GuideTags highs={data.map(() => 250)} data={data} geometry={geometry()} width={width} colors={colors} />)
    expect(tagY('guide-tag-high')).toBe(10)
    expect(screen.getByTestId('guide-tag-high').querySelector('[data-edge="above"]')).not.toBeNull()
  })

  it('says how far the close is below the 52-week high', () => {
    const closing = data.map((bar, i) => (i === data.length - 1 ? { ...bar, close: 156.38 } : bar))
    draw(<GuideTags highs={data.map(() => 243.37)} data={closing} geometry={geometry()} width={width} colors={colors} />)
    expect(screen.getByTestId('guide-tag-high')).toHaveTextContent('52w high −35.7%')
    expect(screen.queryByTestId('guide-tag-growth')).toBeNull()
  })

  it('shows no high tag before 252 sessions', () => {
    draw(<GuideTags highs={data.map(() => null)} data={data} geometry={geometry()} width={width} colors={colors} />)
    expect(screen.queryByTestId('guide-tag-high')).toBeNull()
  })
})

describe('HighLine', () => {
  it('draws a dotted step line of the rolling high in the secondary ink', () => {
    const highs = data.map((_, i) => (i < 10 ? null : i < 20 ? 110 : 120))
    const { container } = draw(<HighLine highs={highs} geometry={geometry()} colors={colors} />)
    const path = container.querySelector('path')
    expect(path).toHaveAttribute('stroke', 'ink2')
    expect(path).toHaveAttribute('stroke-dasharray')
    expect(path.getAttribute('d')).toBe('M 210 190 H 410 V 170 H 790')
  })

  it('draws nothing when no visible bar has 252 sessions behind it', () => {
    const { container } = draw(<HighLine highs={data.map(() => null)} geometry={geometry()} colors={colors} />)
    expect(container.querySelector('path')).toBeNull()
  })
})

describe('GapBoxes', () => {
  const gaps = [
    { index: 5, up: true, from: 100, to: 104, end: 12, filled: true, rvol: 3.1 },
    { index: 20, up: false, from: 120, to: 112, end: 39, filled: false, rvol: 2.6 },
    { index: 25, up: true, from: 110, to: 115, end: 39, filled: false, rvol: 2.6 },
  ]

  it('boxes each gap from the gap day to its end, between the previous close and the open', () => {
    const { container } = draw(<GapBoxes gaps={gaps} geometry={geometry()} colors={colors} />)
    const rects = container.querySelectorAll('rect')
    expect(rects).toHaveLength(3)
    expect(rects[0]).toHaveAttribute('x', '110')
    expect(rects[0]).toHaveAttribute('width', '140')
    expect(rects[0]).toHaveAttribute('y', '202')
    expect(rects[0]).toHaveAttribute('height', '8')
    expect(rects[0]).toHaveAttribute('fill', 'up')
    expect(rects[0]).toHaveAttribute('opacity', '0.12')
    expect(rects[0]).not.toHaveAttribute('stroke-dasharray')
    expect(rects[1]).toHaveAttribute('fill', 'down')
    expect(rects[1]).toHaveAttribute('opacity', '0.22')
    expect(rects[1]).toHaveAttribute('stroke-dasharray')
  })

  it('labels the gaps that are still open', () => {
    const { container } = draw(<GapBoxes gaps={gaps} geometry={geometry()} colors={colors} />)
    const labels = [...container.querySelectorAll('text')].map((label) => label.textContent)
    expect(labels).toEqual(['Gap down 2.6x vol', 'Gap up 2.6x vol'])
  })

  it('keeps a label inside the plot when its box starts left of view or runs to the right edge', () => {
    const open = (index) => ({ index, up: false, from: 120, to: 112, end: 39, filled: false, rvol: 2.6 })
    const { container } = draw(<GapBoxes gaps={[open(-3), open(38)]} geometry={geometry(400)} colors={colors} />)
    const [left, right] = [...container.querySelectorAll('text')].map((label) => Number(label.getAttribute('x')))
    expect(left).toBe(3)
    expect(right + 'Gap down 2.6x vol'.length * 6).toBeLessThanOrEqual(400)
  })
})

it('no longer draws flat price zones or a past P/E band', () => {
  expect(ChartGuides.PriceZones).toBeUndefined()
  expect(ChartGuides.ValueZones).toBeUndefined()
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
