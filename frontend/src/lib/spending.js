import { OTHER_SLICE } from './charts'
import { fmtEur } from './format'

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
  const absorbed = []
  for (const item of items) {
    if ((item.name === otherName && !item.category) || item.value / total < threshold) {
      folded += item.value
      foldedAny = foldedAny || item.value > 0
      if (item.category) absorbed.push(item.category)
    } else {
      kept.push(item)
    }
  }
  return foldedAny && folded > 0 ? [...kept, { name: otherName, value: folded, color: otherColor, folded: true, categories: absorbed }] : kept
}

export function trendTooltipRow(value) {
  return value == null ? 'No data' : fmtEur(value)
}

export function trendTooltipLabel(label, bar) {
  return bar?.current ? `${label} (so far)` : label
}

export function trendBars(rows) {
  const list = rows ?? []
  return list.map((row, index) => ({
    month: row.month,
    label: monthLabel(row.month),
    total: row.total == null ? null : Number(row.total),
    partial: Boolean(row.partial),
    current: Boolean(row.partial) && index === list.length - 1,
  }))
}

export function spendingTransactionsPath(category, { date_from: from, date_to: to }) {
  const params = new URLSearchParams(category ? { category, from, to } : { from, to })
  return `/spending/transactions?${params}`
}
