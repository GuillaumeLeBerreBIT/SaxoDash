export const GRADE_ORDER = ['supported', 'no_edge', 'against', 'too_few']

export const GRADE_WORDS = {
  supported: 'Held up in testing',
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
  return `${signedPercent(figures.mean_excess)} against the average stock over ${horizon} sessions, ${count(figures.cases)} cases`
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

export function signalMarkers(stockSignals, chosen, signals) {
  if (!stockSignals || !signals) return []
  const markers = []
  signals.forEach((signal, order) => {
    if (!chosen?.[signal.key]) return
    for (const date of stockSignals.events?.[signal.key] ?? []) {
      markers.push({ date, key: signal.key, code: signal.code, label: signal.label, grade: gradeOf(signal), order })
    }
  })
  return markers.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order))
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
