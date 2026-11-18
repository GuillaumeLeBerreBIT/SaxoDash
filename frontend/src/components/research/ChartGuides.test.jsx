import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import * as ChartGuides from './ChartGuides'
import { GapBoxes, GrowthLine, GuideTags, HighLine, StopGuide, UsualLine, ValueZones } from './ChartGuides'
import EntryBanner from './EntryBanner'

const colors = { accent: 'accent', up: 'up', down: 'down', warn: 'warn', warnText: 'warnText', axisCategory: 'ink2', pane: 'pane', tooltip: { bg: 'raised' } }
const data = Array.from({ length: 40 }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, open: 100, high: 104, low: 96, close: 102 }))
const geometry = (chartW = 800) => ({ xAt: (i) => 10 + i * 20, scaleY: (value) => 410 - value * 2, chartH: 300, chartW, candleWidth: 8 })
const draw = (node) => render(<svg>{node}</svg>)

const step = (from, price, extra = {}) => ({ from, price, pe: 24, growth: 24.1, eps_ttm: 4.2, capped: false, ...extra })
const width = 862
const lineEnd = (from) => ({ from, price: null, pe: null, growth: null, eps_ttm: null, capped: false })

describe('GrowthLine', () => {
  it('draws one amber stepped line with no fill, clipped to the first visible bar', () => {
    const { container } = draw(<GrowthLine line={[step('2026-06-01', 120), step('2026-07-20', 130)]} data={data} geometry={geometry()} colors={colors} />)
    const paths = container.querySelectorAll('path')
    expect(paths).toHaveLength(1)
    expect(paths[0]).toHaveAttribute('stroke', 'warn')
    expect(paths[0]).toHaveAttribute('fill', 'none')
    expect(container.querySelector('rect')).toBeNull()
    expect(paths[0].getAttribute('d')).toBe('M 10 170 H 390 V 150 H 790')
  })

  it('breaks the line where trailing earnings stop being positive and resumes after', () => {
    const line = [step('2026-06-01', 120), lineEnd('2026-07-11'), step('2026-07-21', 130)]
    const { container } = draw(<GrowthLine line={line} data={data} geometry={geometry()} colors={colors} />)
    expect(container.querySelector('path').getAttribute('d')).toBe('M 10 170 H 190 M 410 150 H 790')
  })

  it('draws nothing without steps', () => {
    const { container } = draw(<GrowthLine line={[]} data={data} geometry={geometry()} colors={colors} />)
    expect(container.querySelector('path')).toBeNull()
  })
})

describe('ValueZones', () => {
  const box = (rect) => ['x', 'y', 'width', 'height'].map((key) => Math.round(Number(rect.getAttribute(key)) * 100) / 100)
  const rounded = (d) => d.replace(/\d+\.\d+/g, (n) => String(Math.round(Number(n) * 100) / 100))
  const zones = (container, kind) => [...container.querySelectorAll(`rect[data-zone="${kind}"]`)]

  it('marks where cheap starts with a green line and a green zone fading below it', () => {
    const { container } = draw(<ValueZones line={[step('2026-06-01', 100), step('2026-07-20', 120)]} data={data} geometry={geometry()} colors={colors} />)
    const edge = container.querySelector('path[data-edge="cheap"]')
    expect(edge).toHaveAttribute('stroke', 'up')
    expect(rounded(edge.getAttribute('d'))).toBe('M 10 230 H 390 V 194 H 790')
    const cheap = zones(container, 'cheap')
    expect(cheap.map(box)).toEqual([[10, 230, 380, 20], [390, 194, 400, 24]])
    expect(cheap[0].getAttribute('fill')).toMatch(/^url\(#.*cheap\)$/)
  })

  it('marks where expensive starts with a red line and a red zone fading above it', () => {
    const { container } = draw(<ValueZones line={[step('2026-06-01', 100)]} data={data} geometry={geometry()} colors={colors} />)
    const edge = container.querySelector('path[data-edge="expensive"]')
    expect(edge).toHaveAttribute('stroke', 'down')
    expect(rounded(edge.getAttribute('d'))).toBe('M 10 190 H 790')
    expect(zones(container, 'expensive').map(box)).toEqual([[10, 170, 780, 20]])
  })

  it('leaves the fair stretch between the two lines clear', () => {
    const { container } = draw(<ValueZones line={[step('2026-06-01', 100)]} data={data} geometry={geometry()} colors={colors} />)
    for (const rect of container.querySelectorAll('rect')) {
      const [, y, , height] = box(rect)
      expect(y + height <= 190 || y >= 230).toBe(true)
    }
  })

  it('has no expensive side on a capped step, since above the floor is not expensive', () => {
    const { container } = draw(<ValueZones line={[step('2026-06-01', 100, { pe: 30, capped: true })]} data={data} geometry={geometry()} colors={colors} />)
    expect(container.querySelector('path[data-edge="expensive"]')).toBeNull()
    expect(zones(container, 'expensive')).toHaveLength(0)
    expect(zones(container, 'cheap')).toHaveLength(1)
  })

  it('leaves a gap where the line has ended', () => {
    const line = [step('2026-06-01', 100), lineEnd('2026-07-11'), step('2026-07-21', 100)]
    const { container } = draw(<ValueZones line={line} data={data} geometry={geometry()} colors={colors} />)
    expect(zones(container, 'cheap').map(box).map(([x, , w]) => [x, x + w])).toEqual([[10, 190], [410, 790]])
  })

  it('draws nothing without steps', () => {
    const { container } = draw(<ValueZones line={[]} data={data} geometry={geometry()} colors={colors} />)
    expect(container.querySelector('g')).toBeNull()
  })
})

describe('UsualLine', () => {
  it('steps with trailing earnings at the usual P/E in the accent colour', () => {
    const line = [step('2026-06-01', 100, { eps_ttm: 4 }), step('2026-07-20', 120, { eps_ttm: 5 })]
    const { container } = draw(<UsualLine line={line} usual={30} data={data} geometry={geometry()} colors={colors} />)
    const path = container.querySelector('path')
    expect(path).toHaveAttribute('data-testid', 'usual-line')
    expect(path).toHaveAttribute('stroke', 'accent')
    expect(path).toHaveAttribute('stroke-dasharray', '6 3')
    expect(path).toHaveAttribute('fill', 'none')
    expect(path.getAttribute('d')).toBe('M 10 170 H 390 V 110 H 790')
  })

  it('draws nothing without a usual P/E', () => {
    const { container } = draw(<UsualLine line={[step('2026-06-01', 100)]} usual={null} data={data} geometry={geometry()} colors={colors} />)
    expect(container.querySelector('path')).toBeNull()
  })
})

describe('GuideTags', () => {
  const tagY = (testId) => Number(screen.getByTestId(testId).querySelector('rect[data-badge]').getAttribute('y'))

  it('names the latest step in words with its price on the right axis', () => {
    draw(<GuideTags line={[step('2026-06-01', 90), step('2026-07-20', 120)]} highs={null} data={data} geometry={geometry()} width={width} colors={colors} />)
    const tag = screen.getByTestId('guide-tag-growth')
    expect(tag).toHaveTextContent('Growth-fair · P/E 24')
    expect(tag).toHaveTextContent('120.00')
    expect(tagY('guide-tag-growth')).toBe(170 - 8)
    expect(tag.querySelector('rect[data-badge]')).toHaveAttribute('x', String(width - 62 + 2))
    expect(tag.querySelector('rect[data-badge]')).toHaveAttribute('fill', 'raised')
    expect(tag.querySelector('rect[data-badge]')).toHaveAttribute('stroke', 'warn')
  })

  it('shows the P/E as a whole number', () => {
    draw(<GuideTags line={[step('2026-06-01', 120, { pe: 22.86 })]} highs={null} data={data} geometry={geometry()} width={width} colors={colors} />)
    expect(screen.getByTestId('guide-tag-growth').textContent).toMatch(/Growth-fair · P\/E 23(?!\.)/)
  })

  it('has no growth tag once the line has ended', () => {
    const { container } = draw(<GuideTags line={[step('2026-06-01', 120), lineEnd('2026-07-20')]} highs={null} data={data} geometry={geometry()} width={width} colors={colors} />)
    expect(screen.queryByTestId('guide-tag-growth')).toBeNull()
    expect(container.querySelector('[data-testid="guide-tags"]')).toBeNull()
  })

  it('calls a capped step a floor', () => {
    draw(<GuideTags line={[step('2026-06-01', 120, { pe: 30, capped: true })]} highs={null} data={data} geometry={geometry()} width={width} colors={colors} />)
    expect(screen.getByTestId('guide-tag-growth')).toHaveTextContent('Growth floor · P/E 30+')
  })

  it('pins a tag above the visible prices to the top edge with an up marker', () => {
    draw(<GuideTags line={[step('2026-06-01', 400)]} highs={null} data={data} geometry={geometry()} width={width} colors={colors} />)
    expect(tagY('guide-tag-growth')).toBe(10)
    expect(screen.getByTestId('guide-tag-growth').querySelector('[data-edge="above"]')).not.toBeNull()
  })

  it('pushes tags that would overlap apart', () => {
    const highs = data.map(() => 122.5)
    draw(<GuideTags line={[step('2026-06-01', 120)]} highs={highs} data={data} geometry={geometry()} width={width} colors={colors} />)
    expect(Math.abs(tagY('guide-tag-growth') - tagY('guide-tag-high'))).toBeGreaterThanOrEqual(16)
  })

  it('says how far the close is below the 52-week high', () => {
    const closing = data.map((bar, i) => (i === data.length - 1 ? { ...bar, close: 156.38 } : bar))
    draw(<GuideTags line={null} highs={data.map(() => 243.37)} data={closing} geometry={geometry()} width={width} colors={colors} />)
    expect(screen.getByTestId('guide-tag-high')).toHaveTextContent('52w high −35.7%')
    expect(screen.queryByTestId('guide-tag-growth')).toBeNull()
  })

  it('tags the usual P/E line with its price', () => {
    draw(<GuideTags line={[step('2026-06-01', 120, { eps_ttm: 4 })]} usual={61} highs={null} data={data} geometry={geometry()} width={width} colors={colors} />)
    const tag = screen.getByTestId('guide-tag-usual')
    expect(tag).toHaveTextContent('Usual P/E 61')
    expect(tag).toHaveTextContent('244.00')
    expect(tag.querySelector('rect[data-badge]')).toHaveAttribute('stroke', 'accent')
  })

  it('shows no high tag before 252 sessions', () => {
    draw(<GuideTags line={null} highs={data.map(() => null)} data={data} geometry={geometry()} width={width} colors={colors} />)
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

it('no longer draws flat price zones', () => {
  expect(ChartGuides.PriceZones).toBeUndefined()
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
