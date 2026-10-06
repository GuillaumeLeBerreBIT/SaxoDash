import { OTHER_SLICE } from './charts'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function monthLabel(month) {
  const match = /^(\d{4})-(\d{2})$/.exec(month ?? '')
  const name = match && MONTH_NAMES[Number(match[2]) - 1]
  if (!name) return month
  return `${name} '${match[1].slice(2)}`
}

export function topCategory(categories) {
  return (categories ?? [])
    .filter((c) => c.category !== 'OTHER')
    .reduce((best, c) => (!best || Number(c.amount) > Number(best.amount) ? c : best), undefined)
}

export function foldSmallSlices(items, { threshold = 0.03, otherName = 'Other', otherColor = OTHER_SLICE } = {}) {
  const total = items.reduce((sum, i) => sum + i.value, 0)
  if (total <= 0) return items

  const kept = []
  let folded = 0
  let foldedAny = false
  for (const item of items) {
    if (item.name === otherName || item.value / total < threshold) {
      folded += item.value
      foldedAny = true
    } else {
      kept.push(item)
    }
  }
  return foldedAny ? [...kept, { name: otherName, value: folded, color: otherColor }] : kept
}

export function trendBars(rows) {
  return (rows ?? []).map((row) => ({
    month: row.month,
    label: monthLabel(row.month),
    total: row.total == null ? null : Number(row.total),
    partial: Boolean(row.partial),
  }))
}
