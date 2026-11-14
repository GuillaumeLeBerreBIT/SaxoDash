import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { CandleMarks, MarkCard, MomentumBands, OutcomePath, TradePlanBox } from './ChartGuides'

const colors = { accent: 'accent', warn: 'warn', up: 'up', down: 'down', pane: 'pane', axis: 'axis' }
const data = Array.from({ length: 40 }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, '0')}`, open: 100, high: 104, low: 96, close: 102 }))
const geometry = (chartW = 800) => ({
  xAt: (i) => 10 + i * 20, scaleY: (value) => 400 - value * 2, chartH: 300, chartW, candleWidth: 8,
})
const mark = (index, side = 'below', extra = {}) => ({
  key: side === 'below' ? 'volume_thrust' : 'squeeze_breakout', label: side === 'below' ? 'Volume thrust' : 'Squeeze breakout',
  description: 'About it', evidence: '+1.4% against the average stock over 60 sessions, 7,657 cases', grade: side === 'below' ? 'supported' : 'against',
  side, date: data[index].date, index, entryIndex: index + 1, endIndex: 30, sessions: 30 - index, complete: true, outcomePct: 8.44, ...extra,
})
const draw = (node) => render(<svg>{node}</svg>)

describe('CandleMarks', () => {
  it('puts a mark under the candle for a signal that held up and over it for one that worked against', () => {
    draw(<CandleMarks marks={[mark(5), mark(20, 'above', { outcomePct: -12.2 })]} data={data} geometry={geometry()} colors={colors} onInspect={vi.fn()} />)
    const [held, against] = screen.getAllByTestId('candle-mark')
    expect(held.querySelector('polygon')).toHaveAttribute('fill', 'accent')
    expect(against.querySelector('polygon')).toHaveAttribute('fill', 'warn')
    expect(held).toHaveTextContent('+8%')
    expect(against).toHaveTextContent('-12%')
    expect(held).toHaveAttribute('aria-label', expect.stringMatching(/^Volume thrust on .+\. The stock moved \+8\.4% over the next 25 sessions\.$/))
  })

  it('keeps the newer of two marks that would overlap', () => {
    draw(<CandleMarks marks={[mark(5), mark(6, 'below', { outcomePct: 3 })]} data={data} geometry={geometry()} colors={colors} onInspect={vi.fn()} />)
    expect(screen.getAllByTestId('candle-mark')).toHaveLength(1)
    expect(screen.getByTestId('candle-mark')).toHaveTextContent('+3%')
  })

  it('shows no figure for a signal on the latest session, and reports the mark under the pointer', () => {
    const onInspect = vi.fn()
    const latest = mark(39, 'below', { outcomePct: null, entryIndex: null, endIndex: null, sessions: 0, complete: false })
    draw(<CandleMarks marks={[latest]} data={data} geometry={geometry()} colors={colors} onInspect={onInspect} />)
    const item = screen.getByTestId('candle-mark')
    expect(item.querySelector('text')).toBeNull()
    expect(item).toHaveAttribute('aria-label', expect.stringMatching(/Too recent to measure\.$/))
    fireEvent.mouseEnter(item)
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ date: latest.date }))
    fireEvent.mouseLeave(item)
    expect(onInspect).toHaveBeenLastCalledWith(null)
  })
})

describe('OutcomePath and MarkCard', () => {
  it('draws the path from the entry to where the measurement ends', () => {
    draw(<OutcomePath mark={mark(5)} data={data} geometry={geometry()} colors={colors} />)
    const line = screen.getByTestId('outcome-path').querySelector('line')
    expect([line.getAttribute('x1'), line.getAttribute('x2'), line.getAttribute('stroke')]).toEqual(['130', '610', 'up'])
  })

  it('draws nothing when the end is out of view', () => {
    const { container } = draw(<OutcomePath mark={mark(5, 'below', { endIndex: null })} data={data} geometry={geometry()} colors={colors} />)
    expect(container.querySelector('[data-testid="outcome-path"]')).toBeNull()
  })

  it('says what this stock did and what the signal did across all stocks', () => {
    render(<MarkCard mark={mark(5, 'below', { complete: false })} x={100} top={10} width={800} />)
    const card = screen.getByTestId('mark-card')
    expect(card).toHaveTextContent('So far +8.4% in 25 sessions.')
    expect(card).toHaveTextContent('Across all stocks in testing: +1.4% against the average stock over 60 sessions, 7,657 cases')
  })
})

describe('MomentumBands', () => {
  it('shades each period and names a wide one', () => {
    draw(<MomentumBands bands={[{ key: 'momentum_top', label: 'Momentum leader', from: 2, to: 12 }, { key: 'momentum_top', label: 'Momentum leader', from: 30, to: 32 }]} geometry={geometry()} colors={colors} />)
    const bands = screen.getAllByTestId('momentum-band')
    expect(bands).toHaveLength(2)
    expect(bands[0]).toHaveTextContent('Momentum leader')
    expect(bands[1]).not.toHaveTextContent('Momentum leader')
  })
})

describe('TradePlanBox', () => {
  const plan = {
    asOf: data[39].date, price: 102, stop: { price: 92, source: 'atr' }, stopDistancePct: -9.8, target: 132, rewardToRisk: 3,
    currency: 'USD', size: { shares: 16, lossAtStop: 290 },
  }

  it('shades the risk to the stop and the reward to the target, with the size', () => {
    draw(<TradePlanBox plan={plan} data={data} geometry={geometry()} colors={colors} />)
    const box = screen.getByTestId('trade-plan-box')
    expect(box.querySelectorAll('rect[fill="down"], rect[fill="up"]')).toHaveLength(2)
    expect(box).toHaveTextContent(/Stop \S*92\.00 · -9\.8%/)
    expect(box).toHaveTextContent('16 sh · €290 at risk')
    expect(box).toHaveTextContent('Target · 3.0 to 1')
    expect(box.querySelector('line')).toHaveAttribute('stroke-dasharray', '4 3')
  })

  it('keeps to a short stop label on a narrow chart', () => {
    draw(<TradePlanBox plan={plan} data={data} geometry={geometry(360)} colors={colors} />)
    const box = screen.getByTestId('trade-plan-box')
    expect(box).toHaveTextContent('Stop -9.8%')
    expect(box).not.toHaveTextContent('at risk')
  })

  it('is not drawn when the latest bar is out of view, or without a plan', () => {
    const { container } = draw(<TradePlanBox plan={plan} data={data.slice(0, 30)} geometry={geometry()} colors={colors} />)
    expect(container.querySelector('[data-testid="trade-plan-box"]')).toBeNull()
    expect(draw(<TradePlanBox plan={null} data={data} geometry={geometry()} colors={colors} />).container.querySelector('[data-testid="trade-plan-box"]')).toBeNull()
  })
})
