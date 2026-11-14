import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { SIGNAL_LANE, SignalCard, SignalLane, placeSignalMarkers } from './SignalLane'

const data = [{ date: '2026-07-01' }, { date: '2026-07-02' }, { date: '2026-07-03' }]
const marker = (date, key, grade = 'supported') => ({
  date, key, code: key.slice(0, 2).toUpperCase(), label: `Label ${key}`, description: `About ${key}`,
  grade, evidence: `Evidence ${key}`,
})
const geometry = { xAt: (index) => 100 + index * 50, chartW: 400 }
const colors = { accent: 'accent', warn: 'warn', axis: 'axis', pane: 'pane', grid: 'grid' }

describe('placeSignalMarkers', () => {
  it('keeps markers whose date is in view and gives them the bar index', () => {
    const placed = placeSignalMarkers([marker('2026-07-02', 'aa'), marker('2026-06-01', 'bb')], data)
    expect(placed.map((item) => [item.key, item.index, item.slot, item.of])).toEqual([['aa', 1, 0, 1]])
  })

  it('numbers two markers on one date so they can sit side by side', () => {
    const placed = placeSignalMarkers([marker('2026-07-03', 'aa'), marker('2026-07-03', 'bb')], data)
    expect(placed.map((item) => [item.key, item.slot, item.of])).toEqual([['aa', 0, 2], ['bb', 1, 2]])
  })

  it('is empty without markers or bars', () => {
    expect(placeSignalMarkers([], data)).toEqual([])
    expect(placeSignalMarkers([marker('2026-07-02', 'aa')], [])).toEqual([])
  })
})

describe('SignalLane', () => {
  const draw = (markers, onInspect = vi.fn()) =>
    render(
      <svg>
        <SignalLane markers={placeSignalMarkers(markers, data)} geometry={geometry} colors={colors} top={300} onInspect={onInspect} />
      </svg>,
    )

  it('draws one labelled marker per signal with its code, coloured by grade', () => {
    draw([marker('2026-07-01', 'aa', 'supported'), marker('2026-07-02', 'bb', 'against'), marker('2026-07-03', 'cc', 'no_edge')])
    const markers = screen.getAllByTestId('signal-marker')
    expect(markers).toHaveLength(3)
    expect(markers[0]).toHaveAttribute('aria-label', expect.stringMatching(/^Label aa on .+\. Held up in testing\.$/))
    expect(markers[0]).toHaveTextContent('AA')
    expect(markers.map((item) => item.querySelector('rect').getAttribute('stroke'))).toEqual(['accent', 'warn', 'axis'])
  })

  it('places two markers on one day beside each other, not on top', () => {
    draw([marker('2026-07-02', 'aa'), marker('2026-07-02', 'bb')])
    const [first, second] = screen.getAllByTestId('signal-marker').map((item) => Number(item.querySelector('rect').getAttribute('x')))
    expect(second - first).toBeGreaterThanOrEqual(17)
  })

  it('reports the marker under the pointer or focus, and clears it', () => {
    const onInspect = vi.fn()
    draw([marker('2026-07-02', 'aa')], onInspect)
    const item = screen.getByTestId('signal-marker')
    fireEvent.focus(item)
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ key: 'aa', index: 1 }))
    fireEvent.blur(item)
    expect(onInspect).toHaveBeenLastCalledWith(null)
  })

  it('has a lane height the chart can reserve', () => {
    expect(SIGNAL_LANE).toBe(20)
  })
})

describe('SignalCard', () => {
  it('names the signal, what it is, its grade and its evidence', () => {
    render(<SignalCard marker={{ ...marker('2026-07-02', 'aa', 'against'), index: 1 }} x={200} bottom={40} width={800} />)
    const card = screen.getByTestId('signal-card')
    expect(card).toHaveTextContent('Label aa')
    expect(card).toHaveTextContent('About aa')
    expect(card).toHaveTextContent('Worked against')
    expect(card).toHaveTextContent('Evidence aa')
  })
})
