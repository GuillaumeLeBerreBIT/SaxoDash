const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: false })

const NUMERIC = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/

function normalise(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isNaN(value) ? null : { kind: 'number', value }
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? null : { kind: 'number', value: time }
  }
  const text = String(value)
  if (NUMERIC.test(text)) return { kind: 'number', value: Number(text) }
  if (ISO_DATE.test(text)) {
    const time = Date.parse(text)
    if (!Number.isNaN(time)) return { kind: 'number', value: time }
  }
  return { kind: 'text', value: text }
}

function compare(a, b) {
  if (a.kind === 'number' && b.kind === 'number') return a.value - b.value
  if (a.kind === 'number') return -1
  if (b.kind === 'number') return 1
  return collator.compare(a.value, b.value)
}

export function sortRows(rows, sort, accessors) {
  const accessor = sort && accessors ? accessors[sort.key] : null
  if (!accessor) return [...rows]
  const sign = sort.direction === 'desc' ? -1 : 1
  return rows
    .map((row, index) => ({ row, index, key: normalise(accessor(row)) }))
    .sort((x, y) => {
      if (x.key === null && y.key === null) return x.index - y.index
      if (x.key === null) return 1
      if (y.key === null) return -1
      return sign * compare(x.key, y.key) || x.index - y.index
    })
    .map((entry) => entry.row)
}

export function nextSort(current, key) {
  if (!current || current.key !== key) return { key, direction: 'asc' }
  if (current.direction === 'asc') return { key, direction: 'desc' }
  return null
}
