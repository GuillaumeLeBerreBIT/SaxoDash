import { fmtPct } from './format'

const NO_HISTORY = 'Not enough history yet to state a return.'
const IN_LINE_POINTS = 0.05

const lead = (label) => (/^(since|year to date)/i.test(label) ? label : `Over ${label}`)
const pct = (value) => fmtPct(value, { decimals: 1 })

export function comparablePeriods(periods = []) {
  const shown = periods.filter((row) => row.portfolio_pct != null)
  return { shown, waiting: periods.length - shown.length }
}

export function performanceSentence(periods, benchmarkName) {
  const { shown } = comparablePeriods(periods ?? [])
  const withIndex = shown.filter((row) => row.benchmark_pct != null)
  const row = withIndex[withIndex.length - 1] ?? shown[shown.length - 1]
  if (!row) return NO_HISTORY
  const opening = `${lead(row.label)} your portfolio returned ${pct(row.portfolio_pct)}`
  if (row.benchmark_pct == null) return `${opening}. ${benchmarkName} has no figure for that period.`
  const gap = Number(row.portfolio_pct) - Number(row.benchmark_pct)
  const index = `${benchmarkName} (${pct(row.benchmark_pct)})`
  if (Math.abs(gap) < IN_LINE_POINTS) return `${opening}, in line with ${index}.`
  return `${opening}, ${Math.abs(gap).toFixed(1)} points ${gap > 0 ? 'ahead of' : 'behind'} ${index}.`
}
