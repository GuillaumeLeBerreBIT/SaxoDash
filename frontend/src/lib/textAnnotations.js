import { indexForDate } from './trendLines'

export function toTextAnnotationShape(raw) {
  return { id: raw.id, barDate: raw.bar_date, price: Number(raw.price), text: raw.text }
}

export function resolveTextAnnotations(items, { allBars, windowStart, windowLength }) {
  const resolved = []

  for (const item of items) {
    const full = indexForDate(allBars, item.barDate)
    if (full == null) continue
    const index = full - windowStart
    if (index < 0 || index >= windowLength) continue
    resolved.push({ id: item.id, text: item.text, index, price: item.price })
  }

  return resolved
}
