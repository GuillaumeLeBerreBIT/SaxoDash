import { fmtPct } from './format'
export const GRADE_ORDER = ['supported', 'unproven', 'no_edge', 'against', 'too_few']

export const GRADE_WORDS = {
  supported: 'Held up in testing',
  unproven: 'Cannot be judged fairly',
  no_edge: 'No edge found',
  against: 'Worked against',
  too_few: 'Too few cases',
}

export const GRADE_HORIZON = 60

const gradeOf = (signal) => (GRADE_ORDER.includes(signal.grade) ? signal.grade : 'too_few')

const count = (value) => Number(value).toLocaleString('en-US')

function signedPercent(fraction) {
  const percent = fraction * 100
  return `${percent >= 0 ? '+' : '-'}${Math.abs(percent).toFixed(1)}%`
}

export function evidenceLine(signal, horizon = GRADE_HORIZON) {
  const figures = signal.horizons?.[String(horizon)]
  if (!signal.grade || !figures) return 'Not tested yet'
  if (signal.grade === 'too_few') return `Only ${count(figures.cases)} cases, too few to judge`
  if (signal.grade === 'no_edge' || figures.mean_excess == null) return `No edge found in ${count(figures.cases)} cases`
  const result = `${signedPercent(figures.mean_excess)} against the average stock over ${horizon} sessions, ${count(figures.cases)} cases`
  if (signal.grade === 'unproven') return `${result}. Companies that failed are missing from the test, which flatters a signal that buys weakness`
  return result
}

export function groupedByGrade(signals) {
  return GRADE_ORDER.map((grade) => ({
    grade,
    signals: (signals ?? []).filter((signal) => gradeOf(signal) === grade),
  })).filter((group) => group.signals.length > 0)
}

export const signalsForListing = (stockSignals, uic) => {
  if (!stockSignals) return null
  if (uic == null || stockSignals.uic == null) return stockSignals
  return Number(stockSignals.uic) === Number(uic) ? stockSignals : null
}

export function activeSignals(stockSignals, signals) {
  if (!stockSignals || !signals) return []
  const active = new Set(stockSignals.active ?? [])
  return signals
    .filter((signal) => active.has(signal.key))
    .map((signal, order) => ({ signal, order }))
    .sort((a, b) => GRADE_ORDER.indexOf(gradeOf(a.signal)) - GRADE_ORDER.indexOf(gradeOf(b.signal)) || a.order - b.order)
    .map(({ signal }) => signal)
}

export const signalGrade = gradeOf

export function standingRows(context) {
  if (!context) return []
  const { below_high_pct: below, momentum_pct: momentum, momentum_rank_pct: rank } = context
  const rows = []
  if (below != null) {
    rows.push({
      key: 'high',
      label: 'Against its 1-year high',
      value: below >= 0 ? 'At the high' : `${fmtPct(below, { decimals: 1 })}`,
    })
  }
  if (momentum != null) {
    rows.push({
      key: 'momentum',
      label: 'Momentum, 12 months skipping the last',
      value: fmtPct(momentum, { decimals: 1 }),
      note: rank == null ? null : `Ahead of ${rank}% of index stocks`,
    })
  }
  return rows
}
