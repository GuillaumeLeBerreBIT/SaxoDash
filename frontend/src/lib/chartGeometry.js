import { useLayoutEffect, useRef, useState } from 'react'

import { NEGATIVE, POSITIVE } from './charts'

/** Geometry and colours for the hand-drawn Research chart.
 *
 *  Separate from the components that use it because the SVG panes need the
 *  same maths and the same scales - and because a module that exports both
 *  components and plain functions breaks React Fast Refresh.
 */

// Candle/volume up-down aliased to the app's one gain/loss pair - this used
// to be its own distinct '#26a17b'/'#e5484d', a different green/red than
// every DayChange/badge/table cell elsewhere in the app for the identical
// signal. lib/charts.js's policy is one green and one red, full stop.
export const UP = POSITIVE
export const DOWN = NEGATIVE

export const OVERLAY_STROKES = {
  ma20: '#f59e0b',
  ma50: '#38bdf8',
  ma200: '#94a3b8',
  ema9: '#e879f9',
  bb: '#a78bfa',
  vwap: '#facc15',
}

// Right-hand gutter reserved for the price axis and the last-price tag.
export const PAD_R = 62
export const PAD_T = 10
const PAD_B = 6

export const MIN_Y_SCALE = 0.1
export const MAX_Y_SCALE = 20

export const DRAG_THRESHOLD = 3

export function scaleFromDrag(startScale, dy) {
  return Math.min(MAX_Y_SCALE, Math.max(MIN_Y_SCALE, startScale * Math.exp(dy / 150)))
}

export function svgY(event) {
  return event.clientY - event.currentTarget.closest('svg').getBoundingClientRect().top
}

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

export function useSize() {
  const ref = useRef(null)
  const [size, setSize] = useState({ width: FALLBACK_WIDTH, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const measure = () =>
      setSize((current) => {
        const width = element.clientWidth || FALLBACK_WIDTH
        const height = element.clientHeight
        return width === current.width && height === current.height ? current : { width, height }
      })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])

  return [ref, size]
}

export function useWidth() {
  const [ref, size] = useSize()
  return [ref, size.width]
}

const LEGEND_HEIGHT = 26
const TIME_AXIS_HEIGHT = 22
const CANVAS_PADDING = 4
export const MIN_PRICE_HEIGHT = 240

export function pricePaneHeight({ total, panes, paneHeights }) {
  const lower = Object.keys(panes)
    .filter((key) => panes[key])
    .reduce((sum, key) => sum + paneHeights[key] + 1, 0)
  return Math.max(MIN_PRICE_HEIGHT, Math.floor(total - LEGEND_HEIGHT - TIME_AXIS_HEIGHT - CANVAS_PADDING - lower))
}

/** Everything the price pane needs to place a bar: scales, slots and ticks.
 *
 *  Computed once per dataset and handed to both the chart body and the
 *  crosshair, so hovering does not recompute the scale for every frame.
 */
export function priceGeometry({ data, ind, width, height, withBands, yScale = 1 }) {
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
  const mid = (max + min) / 2
  const half = ((max - min) / 2 + pad) * yScale
  const top = mid + half
  const bottom = mid - half

  return {
    slot,
    chartW,
    chartH,
    candleWidth: Math.max(1, Math.min(14, slot * 0.68)),
    xAt: (i) => i * slot + slot / 2,
    scaleY: (value) => PAD_T + ((top - value) / (top - bottom)) * chartH,
    priceAtY: (y) => top - ((y - PAD_T) / chartH) * (top - bottom),
    top,
    bottom,
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

const DONUT_MAX_RADIUS = 112
const DONUT_MIN_RADIUS = 56

export function donutOuterRadius(width, reserve) {
  return Math.min(DONUT_MAX_RADIUS, Math.max(DONUT_MIN_RADIUS, width / 2 - reserve))
}
