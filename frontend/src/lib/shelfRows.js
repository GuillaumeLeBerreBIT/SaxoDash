const ACTION_ORDER = ['buy', 'add', 'hold', 'trim', 'not_a_fit', 'sell_review', 'no_verdict']

export function mergeShareClasses(items) {
  const byName = new Map()
  const merged = []
  items.forEach((item) => {
    const first = item.name ? byName.get(item.name) : undefined
    if (first) {
      first.also.push(item.ticker)
      return
    }
    const kept = { ...item, also: [] }
    if (item.name) byName.set(item.name, kept)
    merged.push(kept)
  })
  return merged
}

function rank(verdict) {
  const at = verdict ? ACTION_ORDER.indexOf(verdict.action) : -1
  return at < 0 ? ACTION_ORDER.length : at
}

export function bestActionFirst(items, verdicts) {
  if (!verdicts) return items
  return items
    .map((item, index) => ({ item, index, rank: rank(verdicts[item.ticker]) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item)
}
