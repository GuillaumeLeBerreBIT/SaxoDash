import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'

import { computeIndicators } from '../../lib/indicators'
import { DOWN, UP, priceGeometry } from '../../lib/chartGeometry'
import { roundPrice } from '../../lib/priceLines'
import { TVChart } from './TVChart'

const bars = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-08-${String(i + 1).padStart(2, '0')}`,
  open: 100 + i,
  high: 104 + i,
  low: 98 + i,
  close: 102 + i,
  volume: 1_000_000 + i,
}))

const overlays = { ma20: false, ma50: false, ma200: false, ema9: false, bb: false, vwap: false }

const chart = (props = {}) => (
  <TVChart
    data={bars}
    ind={computeIndicators(bars)}
    type="candles"
    overlays={overlays}
    hover={null}
    setHover={vi.fn()}
    {...props}
  />
)

const renderChart = (props = {}) => render(chart(props))

describe('TVChart', () => {
  it('draws one body per candle', () => {
    const { container } = renderChart()

    // Each candle is a wick line plus a body rect; the last-price tag adds one
    // more rect, so bodies are counted by their fill colours.
    const bodies = container.querySelectorAll(`rect[fill="${UP}"], rect[fill="${DOWN}"]`)
    expect(bodies).toHaveLength(bars.length)
  })

  it('renders nothing rather than throwing on an empty dataset', () => {
    const { container } = renderChart({ data: [], ind: computeIndicators([]) })

    expect(container.querySelector('svg')).toBeNull()
  })

  it('draws a moving average only when its overlay is on', () => {
    const off = renderChart()
    expect(off.container.querySelector('path[stroke="#f59e0b"]')).toBeNull()

    const on = renderChart({ overlays: { ...overlays, ma20: true } })
    expect(on.container.querySelector('path[stroke="#f59e0b"]')).not.toBeNull()
  })

  it('shows the crosshair only while a bar is hovered', () => {
    const idle = renderChart()
    const hovered = renderChart({ hover: 10 })

    const dashed = (c) => c.querySelectorAll('line[stroke="#71717a"]').length
    expect(dashed(idle.container)).toBe(0)
    expect(dashed(hovered.container)).toBe(2)
  })
})

describe('earnings markers', () => {
  it('draws a beat marker in the beat colour', () => {
    const { container } = renderChart({
      earningsMarkers: [{ index: 10, date: bars[10].date, sign: 1, actual: 1.1, estimate: 1.0 }],
    })
    expect(container.querySelector('polygon[fill="#34d399"]')).not.toBeNull()
  })

  it('draws a miss marker in the miss colour', () => {
    const { container } = renderChart({
      earningsMarkers: [{ index: 10, date: bars[10].date, sign: -1, actual: 0.9, estimate: 1.0 }],
    })
    expect(container.querySelector('polygon[fill="#f87171"]')).not.toBeNull()
  })

  it('renders none when no markers are given', () => {
    const { container } = renderChart()
    expect(container.querySelector('polygon[fill="#34d399"], polygon[fill="#f87171"], polygon[fill="#3b82f6"]')).toBeNull()
  })
})

describe('price-axis scaling', () => {
  it('has no scale handle unless the parent can change the scale', () => {
    const { container } = renderChart()

    expect(container.querySelector('[data-testid="price-scale"]')).toBeNull()
  })

  it('compresses the scale when the axis is dragged down', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ yScale: 1, onYScaleChange })

    const handle = getByTestId('price-scale')
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: 160, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientY: 160, pointerId: 1 })

    expect(onYScaleChange).toHaveBeenCalled()
    expect(onYScaleChange.mock.calls.at(-1)[0]).toBeGreaterThan(1)
  })

  it('ignores pointer movement over the axis when no drag started', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ yScale: 1, onYScaleChange })

    fireEvent.pointerMove(getByTestId('price-scale'), { clientY: 160, pointerId: 1 })

    expect(onYScaleChange).not.toHaveBeenCalled()
  })

  it('resets the scale on a double-click of the axis', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ yScale: 4, onYScaleChange })

    fireEvent.doubleClick(getByTestId('price-scale'))

    expect(onYScaleChange).toHaveBeenCalledWith(1)
  })

  it('clips the candles to the plot area', () => {
    const { container } = renderChart({ yScale: 0.2, onYScaleChange: vi.fn() })

    const clipped = container.querySelector('g[clip-path]')
    expect(clipped).not.toBeNull()
    expect(clipped.querySelectorAll(`rect[fill="${UP}"], rect[fill="${DOWN}"]`)).toHaveLength(bars.length)
  })
})

describe('price lines', () => {
  const target = { id: 'target', kind: 'target', price: 110 }
  const stop = { id: 'stop', kind: 'stop', price: 105 }
  const free = { id: 7, kind: 'free', price: 115 }
  const ind = computeIndicators(bars)
  const yOf = (price, yScale = 1) =>
    priceGeometry({ data: bars, ind, width: 760, height: 360, withBands: false, yScale }).scaleY(price)

  const drag = (element, fromY, toY) => {
    fireEvent.pointerDown(element, { clientY: fromY, pointerId: 1 })
    fireEvent.pointerMove(element, { clientY: toY, pointerId: 1 })
    fireEvent.pointerUp(element, { clientY: toY, pointerId: 1 })
  }

  it('draws target, stop and freeform lines', () => {
    const { getByTestId } = renderChart({ lines: [target, stop, free] })

    expect(getByTestId('price-line-target')).toBeInTheDocument()
    expect(getByTestId('price-line-stop')).toBeInTheDocument()
    expect(getByTestId('price-line-7')).toBeInTheDocument()
  })

  it('shows an edge marker instead of a line for a price outside the visible range', () => {
    const { queryByTestId, getByTestId } = renderChart({ lines: [{ ...target, price: 1000 }] })

    expect(queryByTestId('price-line-target')).toBeNull()
    expect(getByTestId('price-edge-target')).toBeInTheDocument()
  })

  it('saves a lower price when a line is dragged down', () => {
    const onMoveLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [target], onMoveLine })

    const y = yOf(target.price)
    drag(getByTestId('price-hit-target'), y, y + 30)

    expect(onMoveLine).toHaveBeenCalledTimes(1)
    const [line, price] = onMoveLine.mock.calls[0]
    expect(line).toEqual(target)
    expect(price).toBeLessThan(target.price)
    expect(Number(price.toFixed(2))).toBe(price)
  })

  it('does not save when a line is clicked without moving', () => {
    const onMoveLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [free], onMoveLine })

    const hit = getByTestId('price-hit-7')
    fireEvent.pointerDown(hit, { clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(hit, { clientY: 100, pointerId: 1 })
    fireEvent.click(hit)

    expect(onMoveLine).not.toHaveBeenCalled()
  })

  it('does not save a jitter smaller than the drag threshold', () => {
    const onMoveLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [target], onMoveLine })

    const y = yOf(target.price)
    drag(getByTestId('price-hit-target'), y, y + 2)

    expect(onMoveLine).not.toHaveBeenCalled()
  })

  it('moves a line by the pointer offset, not to the cursor', () => {
    const onMoveLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [target], onMoveLine })

    const lineY = yOf(target.price)
    drag(getByTestId('price-hit-target'), lineY + 4, lineY + 4 + 30)

    const expected = roundPrice(
      priceGeometry({ data: bars, ind, width: 760, height: 360, withBands: false, yScale: 1 }).priceAtY(lineY + 30),
    )
    expect(onMoveLine).toHaveBeenCalledWith(target, expected)
  })

  it('holds a dropped line where it was dropped until its saved price changes', () => {
    const onMoveLine = vi.fn()
    const { getByTestId, rerender } = renderChart({ lines: [free], onMoveLine })
    const hitY = () => Number(getByTestId('price-hit-7').getAttribute('y1'))

    const lineY = yOf(free.price)
    drag(getByTestId('price-hit-7'), lineY, lineY + 30)
    const [, dropped] = onMoveLine.mock.calls[0]

    expect(hitY()).toBeCloseTo(yOf(dropped))
    rerender(chart({ lines: [{ ...free, price: dropped }], onMoveLine }))
    expect(hitY()).toBeCloseTo(yOf(dropped))
    rerender(chart({ lines: [free], onMoveLine }))
    expect(hitY()).toBeCloseTo(yOf(free.price))
  })

  it('clamps a line dragged below zero to the minimum price', () => {
    const onMoveLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [target], onMoveLine, yScale: 20, onYScaleChange: vi.fn() })

    drag(getByTestId('price-hit-target'), yOf(target.price, 20), 353)

    expect(onMoveLine).toHaveBeenCalledWith(target, 0.01)
  })

  it('creates a freeform line where the plot is double-clicked', () => {
    const onCreateLine = vi.fn()
    const { container } = renderChart({ lines: [], onCreateLine })

    fireEvent.doubleClick(container.firstChild, { clientX: 100, clientY: 200 })

    expect(onCreateLine).toHaveBeenCalledTimes(1)
    expect(onCreateLine.mock.calls[0][0]).toBeGreaterThan(0)
  })

  it('does nothing on a double-click when lines cannot be created', () => {
    const onError = vi.fn()
    window.addEventListener('error', onError)
    const { container } = renderChart({ lines: [] })

    fireEvent.doubleClick(container.firstChild, { clientX: 100, clientY: 200 })

    window.removeEventListener('error', onError)
    expect(onError).not.toHaveBeenCalled()
  })

  it('double-clicking the axis does not create a line', () => {
    const onCreateLine = vi.fn()
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ lines: [], onCreateLine, onYScaleChange })

    fireEvent.doubleClick(getByTestId('price-scale'), { clientX: 740, clientY: 200 })

    expect(onYScaleChange).toHaveBeenCalledWith(1)
    expect(onCreateLine).not.toHaveBeenCalled()
  })

  it('double-clicking a line does not create another', () => {
    const onCreateLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [free], onCreateLine })

    fireEvent.doubleClick(getByTestId('price-hit-7'), { clientX: 100, clientY: yOf(free.price) })

    expect(onCreateLine).not.toHaveBeenCalled()
  })

  it('deletes the selected freeform line with the Delete key', () => {
    const onDeleteLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [free], onDeleteLine })

    fireEvent.click(getByTestId('price-hit-7'))
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onDeleteLine).toHaveBeenCalledWith(free)
  })

  it('does not delete a line while the user is typing in a field', () => {
    const onDeleteLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [free], onDeleteLine })
    const field = document.createElement('textarea')
    document.body.appendChild(field)

    fireEvent.click(getByTestId('price-hit-7'))
    fireEvent.keyDown(field, { key: 'Backspace' })

    expect(onDeleteLine).not.toHaveBeenCalled()
    field.remove()
  })

  it('never selects the target or stop for deletion', () => {
    const onDeleteLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [target], onDeleteLine })

    fireEvent.click(getByTestId('price-hit-target'))
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onDeleteLine).not.toHaveBeenCalled()
  })

  it('clears the selection when the empty plot is clicked', () => {
    const onDeleteLine = vi.fn()
    const { container, getByTestId } = renderChart({ lines: [free], onDeleteLine })

    fireEvent.click(getByTestId('price-hit-7'))
    fireEvent.click(container.firstChild)
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onDeleteLine).not.toHaveBeenCalled()
  })

  it('forgets the selection once the user presses anywhere outside the chart', () => {
    const onDeleteLine = vi.fn()
    const { getByTestId } = renderChart({ lines: [free], onDeleteLine })

    fireEvent.click(getByTestId('price-hit-7'))
    fireEvent.pointerDown(document.body)
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onDeleteLine).not.toHaveBeenCalled()
  })

  it('keeps the selection when the press lands inside the chart', () => {
    const onDeleteLine = vi.fn()
    const { container, getByTestId } = renderChart({ lines: [free], onDeleteLine })

    fireEvent.click(getByTestId('price-hit-7'))
    fireEvent.pointerDown(container.querySelector('svg'))
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onDeleteLine).toHaveBeenCalledWith(free)
  })

  it('saves an exact price typed into the badge editor', () => {
    const onMoveLine = vi.fn()
    const { getByTestId, getByLabelText, queryByLabelText } = renderChart({ lines: [stop], onMoveLine })

    fireEvent.click(getByTestId('price-badge-stop'))
    const input = getByLabelText('Line price')
    expect(input).toHaveValue('105.00')

    fireEvent.change(input, { target: { value: '101.5' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onMoveLine).toHaveBeenCalledWith(stop, 101.5)
    expect(queryByLabelText('Line price')).toBeNull()
  })

  it('cancels the editor on text that is not a price', () => {
    const onMoveLine = vi.fn()
    const { getByTestId, getByLabelText, queryByLabelText } = renderChart({ lines: [stop], onMoveLine })

    fireEvent.click(getByTestId('price-badge-stop'))
    const input = getByLabelText('Line price')
    fireEvent.change(input, { target: { value: '12,5' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onMoveLine).not.toHaveBeenCalled()
    expect(queryByLabelText('Line price')).toBeNull()
  })

  it('does not save on Escape even when the field then blurs', () => {
    const onMoveLine = vi.fn()
    const { getByTestId, getByLabelText } = renderChart({ lines: [stop], onMoveLine })

    fireEvent.click(getByTestId('price-badge-stop'))
    const input = getByLabelText('Line price')
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)

    expect(onMoveLine).not.toHaveBeenCalled()
  })
})
