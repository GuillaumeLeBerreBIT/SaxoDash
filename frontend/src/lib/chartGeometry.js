import { useLayoutEffect, useRef, useState } from 'react'

/** Geometry and colours for the hand-drawn Research chart.
 *
 *  Separate from the components that use it because the SVG panes need the
 *  same maths and the same scales - and because a module that exports both
 *  components and plain functions breaks React Fast Refresh.
 */

export const UP = '#26a17b'
export const DOWN = '#e5484d'

export const OVERLAY_STROKES = {
  ma20: '#f59e0b',
  ma50: '#38bdf8',
  ema9: '#e879f9',
  bb: '#a78bfa',
  vwap: '#facc15',
}

// Right-hand gutter reserved for the price axis and the last-price tag.
export const PAD_R = 62
export const PAD_T = 10
const PAD_B = 6

// jsdom and the first paint have no layout; this keeps both drawable.
const FALLBACK_WIDTH = 760

/** An SVG path through a series, lifting the pen wherever a value is null. */
export function linePath(values, xAt, scaleY) {
  let d = ''
  let pen = false

  values.forEach((value, i) => {
    if (value == null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(2)} ${scaleY(value).toFixed(2)} `
    pen = true
  })

  return d.trim()
}

export function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(FALLBACK_WIDTH)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new ResizeObserver(() => setWidth(element.clientWidth || FALLBACK_WIDTH))
    observer.observe(element)
    setWidth(element.clientWidth || FALLBACK_WIDTH)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

/** Everything the price pane needs to place a bar: scales, slots and ticks.
 *
 *  Computed once per dataset and handed to both the chart body and the
 *  crosshair, so hovering does not recompute the scale for every frame.
 */
export function priceGeometry({ data, ind, width, height, withBands }) {
  const chartH = height - PAD_T - PAD_B
  const chartW = Math.max(80, width - PAD_R)
  const slot = chartW / Math.max(1, data.length)

  let max = -Infinity
  let min = Infinity
  const consider = (value) => {
    if (value == null) return
    if (value > max) max = value
    if (value < min) min = value
  }

  for (const bar of data) {
    consider(bar.high)
    consider(bar.low)
  }
  if (withBands && ind?.bb) {
    ind.bb.up.forEach(consider)
    ind.bb.lo.forEach(consider)
  }

  const pad = (max - min) * 0.07 || 1
  const top = max + pad
  const bottom = min - pad

  return {
    slot,
    chartW,
    chartH,
    candleWidth: Math.max(1, Math.min(14, slot * 0.68)),
    xAt: (i) => i * slot + slot / 2,
    scaleY: (value) => PAD_T + ((top - value) / (top - bottom)) * chartH,
    ticks: Array.from({ length: 6 }, (_, i) => bottom + ((top - bottom) * i) / 5),
  }
}

/** The horizontal layout every lower pane shares with the price pane.
 *
 *  All four panes must put bar i at the same x as the price chart does, or the
 *  crosshair lies; deriving that from one place is what guarantees it.
 */
export function paneGeometry(width, length) {
  const chartW = Math.max(80, width - PAD_R)
  const slot = chartW / Math.max(1, length)

  return {
    chartW,
    slot,
    barWidth: Math.max(1, Math.min(14, slot * 0.68)),
    xAt: (i) => i * slot + slot / 2,
  }
}

/** Which bar the pointer is over, clamped to the dataset. */
export function indexFromPointer(event, slot, length) {
  const box = event.currentTarget.getBoundingClientRect()
  const index = Math.floor((event.clientX - box.left) / slot)
  return Math.max(0, Math.min(length - 1, index))
}
