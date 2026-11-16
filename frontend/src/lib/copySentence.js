import { fmtPct } from './format'

const IN_LINE_POINTS = 0.05
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthAndYear(iso) {
  const [year, month] = String(iso).split('-')
  return `${MONTHS[Number(month) - 1]} ${year}`
}

export function copySentence(copy, name) {
  if (!copy?.available || copy.clone_return_pct == null) {
    return `Too few priced trades to say what copying ${name} would have returned.`
  }
  const result = Number(copy.clone_return_pct)
  const opening = `If you had copied ${name} since ${monthAndYear(copy.since)} you would be ${result >= 0 ? 'up' : 'down'} ${Math.abs(result).toFixed(1)}%`
  if (copy.benchmark_return_pct == null) return `${opening}.`
  const gap = Number(copy.excess_return_pct ?? result - Number(copy.benchmark_return_pct))
  const index = `the ${copy.benchmark} (${fmtPct(copy.benchmark_return_pct, { decimals: 1 })})`
  if (Math.abs(gap) < IN_LINE_POINTS) return `${opening}, in line with ${index}.`
  return `${opening}, ${Math.abs(gap).toFixed(1)} points ${gap > 0 ? 'ahead of' : 'behind'} ${index}.`
}
