import { CATEGORY_AXIS_TEXT, NEGATIVE, POSITIVE } from './charts'

export const LINE_STROKES = { target: POSITIVE, stop: NEGATIVE, free: CATEGORY_AXIS_TEXT }

export const MIN_PRICE = 0.01

const PRICE_TEXT = /^(\d+\.?\d*|\.\d+)$/

function toPrice(value) {
  if (value == null || value === '') return null
  const price = Number(value)
  return Number.isFinite(price) && price > 0 ? price : null
}

export function chartLines(note, freeLines = []) {
  const lines = []
  const target = toPrice(note?.target_price)
  const stop = toPrice(note?.stop_price)

  if (target != null) lines.push({ id: 'target', kind: 'target', price: target })
  if (stop != null) lines.push({ id: 'stop', kind: 'stop', price: stop })
  for (const line of freeLines) {
    const price = toPrice(line.price)
    if (price != null) lines.push({ id: line.id, kind: 'free', price })
  }

  return lines
}

export function roundPrice(value) {
  return Math.max(MIN_PRICE, Math.round(value * 100) / 100)
}

export function parsePriceInput(text) {
  const trimmed = String(text).trim()
  if (!PRICE_TEXT.test(trimmed)) return null
  const price = Number(trimmed)
  return price > 0 ? roundPrice(price) : null
}

export function edgeOf(price, { top, bottom }) {
  if (price > top) return 'above'
  if (price < bottom) return 'below'
  return null
}

export function isTypingTarget(element) {
  if (!element?.tagName) return false
  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return element.isContentEditable === true || element.getAttribute('contenteditable') === 'true'
}

export function linePatch(line, price) {
  const value = roundPrice(price).toFixed(2)
  if (line.kind === 'target') return { target_price: value }
  if (line.kind === 'stop') return { stop_price: value }
  return null
}
