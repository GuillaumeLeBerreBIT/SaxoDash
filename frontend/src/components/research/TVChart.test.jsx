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

  const clickGutter = (utils, y) => {
    const g = utils.getByTestId('price-scale')
    fireEvent.pointerDown(g, { clientY: y, pointerId: 1 })
    fireEvent.pointerUp(g, { clientY: y, pointerId: 1 })
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

  it('places a line on a single click while the line tool is armed', () => {
    const onCreateLine = vi.fn()
    const onPlaced = vi.fn()
    const { container } = renderChart({ lines: [], onCreateLine, tool: 'hline', onPlaced })

    fireEvent.mouseDown(container.firstChild, { detail: 1 })
    fireEvent.click(container.firstChild, { detail: 1, clientX: 100, clientY: 200 })

    const geometry = priceGeometry({ data: bars, ind: computeIndicators(bars), width: 760, height: 360, withBands: false, yScale: 1 })
    expect(onCreateLine).toHaveBeenCalledTimes(1)
    expect(onCreateLine).toHaveBeenCalledWith(roundPrice(geometry.priceAtY(200)))
    expect(onPlaced).toHaveBeenCalledTimes(1)
  })

  it('does not place a line on a single click when the tool is not armed', () => {
    const onCreateLine = vi.fn()
    const { container } = renderChart({ lines: [], onCreateLine })

    fireEvent.click(container.firstChild, { detail: 1, clientX: 100, clientY: 200 })

    expect(onCreateLine).not.toHaveBeenCalled()
  })

  it('creates exactly one line when the armed tool is double-clicked', () => {
    const onCreateLine = vi.fn()
    const { container, rerender } = renderChart({ lines: [], onCreateLine, tool: 'hline', onPlaced: vi.fn() })
    const plot = container.firstChild

    fireEvent.mouseDown(plot, { detail: 1 })
    fireEvent.click(plot, { detail: 1, clientX: 100, clientY: 200 })
    rerender(chart({ lines: [], onCreateLine, tool: 'crosshair', onPlaced: vi.fn() }))
    fireEvent.mouseDown(plot, { detail: 2 })
    fireEvent.click(plot, { detail: 2, clientX: 100, clientY: 200 })
    fireEvent.doubleClick(plot, { detail: 2, clientX: 100, clientY: 200 })

    expect(onCreateLine).toHaveBeenCalledTimes(1)
  })

  it('still creates a line on a later double-click after placing one', () => {
    const onCreateLine = vi.fn()
    const { container, rerender } = renderChart({ lines: [], onCreateLine, tool: 'hline', onPlaced: vi.fn() })
    const plot = container.firstChild

    fireEvent.mouseDown(plot, { detail: 1 })
    fireEvent.click(plot, { detail: 1, clientX: 100, clientY: 200 })
    rerender(chart({ lines: [], onCreateLine }))
    fireEvent.mouseDown(plot, { detail: 1 })
    fireEvent.click(plot, { detail: 1, clientX: 100, clientY: 150 })
    fireEvent.mouseDown(plot, { detail: 2 })
    fireEvent.doubleClick(plot, { detail: 2, clientX: 100, clientY: 150 })

    expect(onCreateLine).toHaveBeenCalledTimes(2)
  })

  it('never places a line from a click in the price-axis gutter', () => {
    const onCreateLine = vi.fn()
    const onPlaced = vi.fn()
    const { container } = renderChart({ lines: [], onCreateLine, tool: 'hline', onPlaced })

    fireEvent.click(container.firstChild, { detail: 1, clientX: 740, clientY: 200 })

    expect(onCreateLine).not.toHaveBeenCalled()
    expect(onPlaced).not.toHaveBeenCalled()
  })

  it('shows a crosshair cursor only while the line tool is armed', () => {
    const armed = renderChart({ lines: [], onCreateLine: vi.fn(), tool: 'hline' })
    const idle = renderChart({ lines: [], onCreateLine: vi.fn() })

    expect(armed.container.firstChild).toHaveStyle({ cursor: 'crosshair' })
    expect(idle.container.firstChild).not.toHaveStyle({ cursor: 'crosshair' })
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
    const utils = renderChart({ lines: [stop], onMoveLine })
    const { getByLabelText, queryByLabelText } = utils

    clickGutter(utils, yOf(stop.price))
    const input = getByLabelText('Line price')
    expect(input).toHaveValue('105.00')

    fireEvent.change(input, { target: { value: '101.5' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onMoveLine).toHaveBeenCalledWith(stop, 101.5)
    expect(queryByLabelText('Line price')).toBeNull()
  })

  it('cancels the editor on text that is not a price', () => {
    const onMoveLine = vi.fn()
    const utils = renderChart({ lines: [stop], onMoveLine })
    const { getByLabelText, queryByLabelText } = utils

    clickGutter(utils, yOf(stop.price))
    const input = getByLabelText('Line price')
    fireEvent.change(input, { target: { value: '12,5' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onMoveLine).not.toHaveBeenCalled()
    expect(queryByLabelText('Line price')).toBeNull()
  })

  it('does not save on Escape even when the field then blurs', () => {
    const onMoveLine = vi.fn()
    const utils = renderChart({ lines: [stop], onMoveLine })
    const { getByLabelText } = utils

    clickGutter(utils, yOf(stop.price))
    const input = getByLabelText('Line price')
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    fireEvent.blur(input)

    expect(onMoveLine).not.toHaveBeenCalled()
  })

  it('starts a scale drag on top of a badge', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId, queryByLabelText } = renderChart({ lines: [stop], onYScaleChange, yScale: 1 })

    const handle = getByTestId('price-scale')
    const y = yOf(stop.price)
    fireEvent.pointerDown(handle, { clientY: y, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: y + 60, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientY: y + 60, pointerId: 1 })

    expect(onYScaleChange).toHaveBeenCalled()
    expect(onYScaleChange.mock.calls.at(-1)[0]).toBeGreaterThan(1)
    expect(queryByLabelText('Line price')).toBeNull()
  })

  it('treats a press with a tiny wobble on a badge as a click', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId, getByLabelText } = renderChart({ lines: [stop], onYScaleChange, yScale: 1 })

    const handle = getByTestId('price-scale')
    const y = yOf(stop.price)
    fireEvent.pointerDown(handle, { clientY: y, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientY: y + 2, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientY: y + 2, pointerId: 1 })

    expect(onYScaleChange).not.toHaveBeenCalled()
    expect(getByLabelText('Line price')).toHaveValue('105.00')
  })

  it('does nothing on a click on bare axis', () => {
    const onYScaleChange = vi.fn()
    const utils = renderChart({ lines: [stop], onYScaleChange })
    const { queryByLabelText } = utils

    const bareY = yOf(stop.price) > 200 ? 30 : 330
    clickGutter(utils, bareY)

    expect(queryByLabelText('Line price')).toBeNull()
    expect(onYScaleChange).not.toHaveBeenCalled()
  })

  it('opens a badge editor even when the scale cannot change', () => {
    const utils = renderChart({ lines: [stop] })
    const { getByLabelText } = utils

    clickGutter(utils, yOf(stop.price))

    expect(getByLabelText('Line price')).toBeInTheDocument()
  })

  it('ignores a right-click on the axis', () => {
    const utils = renderChart({ lines: [stop] })
    const { getByTestId, queryByLabelText } = utils

    const handle = getByTestId('price-scale')
    const y = yOf(stop.price)
    fireEvent.pointerDown(handle, { clientY: y, pointerId: 1, button: 2 })
    fireEvent.pointerUp(handle, { clientY: y, pointerId: 1, button: 2 })

    expect(queryByLabelText('Line price')).toBeNull()
  })

  it('ignores a right-button drag on the axis', () => {
    const onYScaleChange = vi.fn()
    const { getByTestId } = renderChart({ yScale: 1, onYScaleChange })

    const handle = getByTestId('price-scale')
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1, button: 2 })
    fireEvent.pointerMove(handle, { clientY: 160, pointerId: 1, button: 2 })
    fireEvent.pointerUp(handle, { clientY: 160, pointerId: 1, button: 2 })

    expect(onYScaleChange).not.toHaveBeenCalled()
  })

  it('does not open an editor for an off-screen line', () => {
    const price = roundPrice(
      priceGeometry({ data: bars, ind, width: 760, height: 360, withBands: false }).priceAtY(9),
    )
    const utils = renderChart({ lines: [{ ...target, price }] })
    const { getByTestId, queryByLabelText } = utils

    expect(getByTestId('price-edge-target')).toBeInTheDocument()

    clickGutter(utils, 16)

    expect(queryByLabelText('Line price')).toBeNull()
  })

  it('picks the nearest badge when two overlap', () => {
    const utils = renderChart({ lines: [target, { ...stop, price: target.price - 0.5 }] })
    const { getByLabelText } = utils

    clickGutter(utils, yOf(109.5))

    expect(getByLabelText('Line price')).toHaveValue('109.50')
  })

  it('shows the badge price with no decimals from ten thousand up', () => {
    const bigBars = bars.map((b) => ({ ...b, open: b.open * 100, high: b.high * 100, low: b.low * 100, close: b.close * 100 }))
    const { getByTestId } = renderChart({ data: bigBars, ind: computeIndicators(bigBars), lines: [{ id: 'target', kind: 'target', price: 12345.67 }] })

    expect(getByTestId('price-badge-target').textContent).toBe('T 12346')
  })

  it('shows the edge marker price with no decimals from ten thousand up', () => {
    const bigBars = bars.map((b) => ({ ...b, open: b.open * 100, high: b.high * 100, low: b.low * 100, close: b.close * 100 }))
    const { getByTestId } = renderChart({ data: bigBars, ind: computeIndicators(bigBars), lines: [{ id: 'stop', kind: 'stop', price: 99999.5 }] })

    expect(getByTestId('price-edge-stop').textContent).toBe('100000')
  })
})

describe('panning', () => {
  const slot = (760 - 62) / bars.length
  const chartH = 360 - 10 - 6
  const pannable = (props = {}) => renderChart({ onTimeOffsetChange: vi.fn(), onYShiftChange: vi.fn(), ...props })

  const pan = (element, dx, dy) => {
    const length = Math.hypot(dx, dy) || 1
    const x = 300 + (dx / length) * 8
    const y = 200 + (dy / length) * 8
    fireEvent.pointerDown(element, { clientX: 300, clientY: 200, pointerId: 1 })
    fireEvent.pointerMove(element, { clientX: x, clientY: y, pointerId: 1 })
    fireEvent.pointerMove(element, { clientX: x + dx, clientY: y + dy, pointerId: 1 })
    fireEvent.pointerUp(element, { clientX: x + dx, clientY: y + dy, pointerId: 1 })
  }

  it('treats a click with a few pixels of hand movement as a click', () => {
    const onCreateLine = vi.fn()
    const onTimeOffsetChange = vi.fn()
    const onYShiftChange = vi.fn()
    const { container } = pannable({
      lines: [],
      onCreateLine,
      tool: 'hline',
      onPlaced: vi.fn(),
      onTimeOffsetChange,
      onYShiftChange,
    })
    const plot = container.firstChild

    fireEvent.pointerDown(plot, { clientX: 300, clientY: 200, pointerId: 1 })
    fireEvent.pointerMove(plot, { clientX: 304, clientY: 203, pointerId: 1 })
    fireEvent.pointerUp(plot, { clientX: 304, clientY: 203, pointerId: 1 })
    fireEvent.mouseDown(plot, { detail: 1 })
    fireEvent.click(plot, { detail: 1, clientX: 304, clientY: 203 })

    expect(onTimeOffsetChange).not.toHaveBeenCalled()
    expect(onYShiftChange).not.toHaveBeenCalled()
    expect(onCreateLine).toHaveBeenCalledTimes(1)
  })

  it('starts a pan where it is recognised, so the chart does not jump', () => {
    const onYShiftChange = vi.fn()
    const { container } = pannable({ onYShiftChange })
    const plot = container.firstChild

    fireEvent.pointerDown(plot, { clientX: 300, clientY: 200, pointerId: 1 })
    fireEvent.pointerMove(plot, { clientX: 300, clientY: 210, pointerId: 1 })
    fireEvent.pointerMove(plot, { clientX: 300, clientY: 210 + chartH / 4, pointerId: 1 })
    fireEvent.pointerUp(plot, { clientX: 300, clientY: 210 + chartH / 4, pointerId: 1 })

    expect(onYShiftChange.mock.calls.at(-1)[0]).toBeCloseTo(0.25)
  })

  it('goes back in time when the plot is dragged right', () => {
    const onTimeOffsetChange = vi.fn()
    const { container } = pannable({ timeOffset: 4, onTimeOffsetChange })

    pan(container.firstChild, slot * 3, 0)

    expect(onTimeOffsetChange).toHaveBeenLastCalledWith(7)
  })

  it('moves the price window with a vertical drag', () => {
    const onYShiftChange = vi.fn()
    const { container } = pannable({ yShift: 0.1, onYShiftChange })

    pan(container.firstChild, 0, chartH / 4)

    expect(onYShiftChange.mock.calls.at(-1)[0]).toBeCloseTo(0.35)
  })

  it('ignores a jitter smaller than the drag threshold', () => {
    const onTimeOffsetChange = vi.fn()
    const { container } = pannable({ onTimeOffsetChange })
    const plot = container.firstChild

    fireEvent.pointerDown(plot, { clientX: 300, clientY: 200, pointerId: 1 })
    fireEvent.pointerMove(plot, { clientX: 302, clientY: 200, pointerId: 1 })
    fireEvent.pointerUp(plot, { clientX: 302, clientY: 200, pointerId: 1 })

    expect(onTimeOffsetChange).not.toHaveBeenCalled()
  })

  it('neither places a line nor clears the selection after a pan, but the next click does', () => {
    const onCreateLine = vi.fn()
    const { container } = pannable({ lines: [], onCreateLine, tool: 'hline', onPlaced: vi.fn() })
    const plot = container.firstChild

    pan(plot, 60, 0)
    fireEvent.mouseDown(plot, { detail: 1 })
    fireEvent.click(plot, { detail: 1, clientX: 360, clientY: 200 })
    expect(onCreateLine).not.toHaveBeenCalled()

    fireEvent.pointerDown(plot, { clientX: 100, clientY: 200, pointerId: 1 })
    fireEvent.pointerUp(plot, { clientX: 100, clientY: 200, pointerId: 1 })
    fireEvent.mouseDown(plot, { detail: 1 })
    fireEvent.click(plot, { detail: 1, clientX: 100, clientY: 200 })
    expect(onCreateLine).toHaveBeenCalledTimes(1)
  })

  it('moves a dragged line instead of panning', () => {
    const onTimeOffsetChange = vi.fn()
    const onYShiftChange = vi.fn()
    const onMoveLine = vi.fn()
    const free = { id: 7, kind: 'free', price: 115 }
    const { getByTestId } = pannable({ lines: [free], onMoveLine, onTimeOffsetChange, onYShiftChange })

    const handle = getByTestId('price-hit-7')
    fireEvent.pointerDown(handle, { clientX: 200, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 260, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 260, clientY: 140, pointerId: 1 })

    expect(onMoveLine).toHaveBeenCalled()
    expect(onTimeOffsetChange).not.toHaveBeenCalled()
    expect(onYShiftChange).not.toHaveBeenCalled()
  })

  it('does not pan from the price-axis gutter', () => {
    const onTimeOffsetChange = vi.fn()
    const onYShiftChange = vi.fn()
    const { getByTestId } = pannable({ onTimeOffsetChange, onYShiftChange, onYScaleChange: vi.fn() })

    pan(getByTestId('price-scale'), 40, 40)

    expect(onTimeOffsetChange).not.toHaveBeenCalled()
    expect(onYShiftChange).not.toHaveBeenCalled()
  })

  it('resets zoom and shift together on a double-click of the axis', () => {
    const onPriceScaleReset = vi.fn()
    const onYScaleChange = vi.fn()
    const { getByTestId } = pannable({ onYScaleChange, onPriceScaleReset, yShift: 0.4 })

    fireEvent.doubleClick(getByTestId('price-scale'))

    expect(onPriceScaleReset).toHaveBeenCalledTimes(1)
    expect(onYScaleChange).not.toHaveBeenCalled()
  })

  it('pans through time on a horizontal wheel and keeps the page from navigating', () => {
    const onTimeOffsetChange = vi.fn()
    const { container } = pannable({ onTimeOffsetChange })

    const allowed = fireEvent.wheel(container.firstChild, { deltaX: slot * 2, deltaY: 0 })

    expect(allowed).toBe(false)
    const update = onTimeOffsetChange.mock.calls.at(-1)[0]
    expect(update(10)).toBe(8)
  })

  it('leaves a vertical wheel to scroll the page', () => {
    const onTimeOffsetChange = vi.fn()
    const { container } = pannable({ onTimeOffsetChange })

    const allowed = fireEvent.wheel(container.firstChild, { deltaX: 0, deltaY: 120 })

    expect(allowed).toBe(true)
    expect(onTimeOffsetChange).not.toHaveBeenCalled()
  })

  it('offers a way back to the latest bars only while panned', () => {
    const onTimeOffsetChange = vi.fn()
    const { queryByRole, rerender } = pannable({ onTimeOffsetChange, timeOffset: 0 })
    expect(queryByRole('button', { name: 'Jump to latest' })).toBeNull()

    rerender(chart({ onTimeOffsetChange, onYShiftChange: vi.fn(), timeOffset: 5 }))
    fireEvent.click(queryByRole('button', { name: 'Jump to latest' }))

    expect(onTimeOffsetChange).toHaveBeenCalledWith(0)
  })
})

describe('trend lines', () => {
  const ray = { id: 1, label: '', x1: 2, y1: 105, x2: 20, y2: 130 }
  const geometry = () =>
    priceGeometry({ data: bars, ind: computeIndicators(bars), width: 760, height: 360, withBands: false, yScale: 1 })

  const drag = (element, fromY, toY, fromX, toX) => {
    fireEvent.pointerDown(element, { clientX: fromX, clientY: fromY, pointerId: 1 })
    fireEvent.pointerMove(element, { clientX: toX, clientY: toY, pointerId: 1 })
    fireEvent.pointerUp(element, { clientX: toX, clientY: toY, pointerId: 1 })
  }

  it('draws a line from its resolved start to its resolved end', () => {
    const { getByTestId } = renderChart({ trendLines: [ray] })
    const g = geometry()
    const line = getByTestId('trend-line-1')

    expect(line.querySelector('line')).toHaveAttribute('x1', g.xAt(ray.x1).toFixed(2))
    expect(line.querySelector('line')).toHaveAttribute('x2', g.xAt(ray.x2).toFixed(2))
  })

  it('shows a thicker stroke on the visible line once selected', () => {
    const { getByTestId } = renderChart({ trendLines: [ray] })

    fireEvent.click(getByTestId('trend-line-hit-1'))

    expect(getByTestId('trend-line-1').querySelector('line')).toHaveAttribute('stroke-width', '2')
  })

  it('moves the end handle to a new bar and price on drag', () => {
    const onMoveTrendLineEndpoint = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onMoveTrendLineEndpoint })
    const g = geometry()

    const handle = getByTestId('trend-line-handle-1-end')
    drag(handle, g.scaleY(ray.y2), g.scaleY(ray.y2) + 10, g.xAt(ray.x2), g.xAt(5))

    expect(onMoveTrendLineEndpoint).toHaveBeenCalledTimes(1)
    const [line, endpoint, point] = onMoveTrendLineEndpoint.mock.calls[0]
    expect(line).toEqual(ray)
    expect(endpoint).toBe('end')
    expect(point.barDate).toBe(bars[5].date)
    expect(point.price).toBeLessThan(ray.y2)
  })

  it('moves the start handle independently of the end', () => {
    const onMoveTrendLineEndpoint = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onMoveTrendLineEndpoint })
    const g = geometry()

    const handle = getByTestId('trend-line-handle-1-start')
    drag(handle, g.scaleY(ray.y1), g.scaleY(ray.y1) - 10, g.xAt(ray.x1), g.xAt(1))

    const [, endpoint] = onMoveTrendLineEndpoint.mock.calls[0]
    expect(endpoint).toBe('start')
  })

  it('does not move anything on a click without dragging', () => {
    const onMoveTrendLineEndpoint = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onMoveTrendLineEndpoint })
    const g = geometry()
    const handle = getByTestId('trend-line-handle-1-end')

    fireEvent.pointerDown(handle, { clientX: g.xAt(ray.x2), clientY: g.scaleY(ray.y2), pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: g.xAt(ray.x2), clientY: g.scaleY(ray.y2), pointerId: 1 })

    expect(onMoveTrendLineEndpoint).not.toHaveBeenCalled()
  })

  it('deletes the selected ray with the Delete key', () => {
    const onDeleteTrendLine = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onDeleteTrendLine })

    fireEvent.click(getByTestId('trend-line-hit-1'))
    fireEvent.keyDown(window, { key: 'Delete' })

    expect(onDeleteTrendLine).toHaveBeenCalledWith(ray)
  })

  it('does not delete a ray while the user is typing', () => {
    const onDeleteTrendLine = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onDeleteTrendLine })
    const field = document.createElement('textarea')
    document.body.appendChild(field)

    fireEvent.click(getByTestId('trend-line-hit-1'))
    fireEvent.keyDown(field, { key: 'Backspace' })

    expect(onDeleteTrendLine).not.toHaveBeenCalled()
    field.remove()
  })

  it('opens a label editor on a double-click of the line body', () => {
    const { getByTestId, getByLabelText } = renderChart({ trendLines: [{ ...ray, label: 'Support' }] })

    fireEvent.doubleClick(getByTestId('trend-line-hit-1'))

    expect(getByLabelText('Trend line label')).toHaveValue('Support')
  })

  it('saves an edited label on Enter', () => {
    const onEditTrendLineLabel = vi.fn()
    const { getByTestId, getByLabelText } = renderChart({ trendLines: [ray], onEditTrendLineLabel })

    fireEvent.doubleClick(getByTestId('trend-line-hit-1'))
    const input = getByLabelText('Trend line label')
    fireEvent.change(input, { target: { value: 'Resistance' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onEditTrendLineLabel).toHaveBeenCalledWith(ray, 'Resistance')
  })

  it("a double-click on the line body does not also create a horizontal line", () => {
    const onCreateLine = vi.fn()
    const { getByTestId } = renderChart({ trendLines: [ray], onCreateLine })

    fireEvent.doubleClick(getByTestId('trend-line-hit-1'))

    expect(onCreateLine).not.toHaveBeenCalled()
  })
})
