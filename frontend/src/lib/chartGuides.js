import { evidenceLine } from './signals'

export const OUTCOME_SESSIONS = 60
export const BAND_GAP_SESSIONS = 5
export const BAND_MIN_SESSIONS = 3
const MARKED_GRADES = { supported: 'below', against: 'above' }

export function candleMarks(stockSignals, signals, bars) {
  if (!stockSignals || !signals || !bars?.length) return []
  const indexByDate = new Map(bars.map((bar, index) => [bar.date, index]))
  const last = bars.length - 1
  const marks = []
  for (const signal of signals) {
    const side = MARKED_GRADES[signal.grade]
    if (!side || signal.kind !== 'event') continue
    for (const date of stockSignals.events?.[signal.key] ?? []) {
      const index = indexByDate.get(date)
      if (index == null) continue
      const entry = bars[index + 1]
      const end = Math.min(index + OUTCOME_SESSIONS, last)
      const measurable = entry && entry.open > 0 && end > index
      marks.push({
        key: signal.key, label: signal.label, description: signal.description, grade: signal.grade,
        evidence: evidenceLine(signal), side, date,
        entryDate: measurable ? entry.date : null,
        endDate: measurable ? bars[end].date : null,
        sessions: measurable ? end - index : 0,
        complete: index + OUTCOME_SESSIONS <= last,
        outcomePct: measurable ? (bars[end].close / entry.open - 1) * 100 : null,
      })
    }
  }
  return marks.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export function momentumBands(stockSignals, signals) {
  if (!stockSignals?.runs || !signals) return []
  return signals
    .filter((signal) => signal.kind !== 'event' && signal.grade === 'supported')
    .flatMap((signal) =>
      (stockSignals.runs[signal.key] ?? []).map(([start, end]) => ({ key: signal.key, label: signal.label, start, end })),
    )
}

export function placeBands(bands, data) {
  if (!bands.length || !data.length) return []
  const placed = []
  for (const band of bands) {
    const from = data.findIndex((bar) => bar.date >= band.start)
    let to = -1
    for (let i = data.length - 1; i >= 0; i -= 1) {
      if (data[i].date <= band.end) {
        to = i
        break
      }
    }
    if (from === -1 || to < from) continue
    const previous = placed[placed.length - 1]
    if (previous && previous.key === band.key && from - previous.to <= BAND_GAP_SESSIONS) previous.to = Math.max(previous.to, to)
    else placed.push({ key: band.key, label: band.label, from, to })
  }
  const atEdge = (band) => band.from === 0 || band.to === data.length - 1
  return placed.filter((band) => atEdge(band) || band.to - band.from + 1 >= BAND_MIN_SESSIONS)
}

export function placeMarks(marks, data) {
  if (!marks.length || !data.length) return []
  const indexByDate = new Map(data.map((bar, index) => [bar.date, index]))
  const at = (date) => (date == null ? null : indexByDate.get(date) ?? null)
  return marks.flatMap((mark) => {
    const index = at(mark.date)
    return index == null ? [] : [{ ...mark, index, entryIndex: at(mark.entryDate), endIndex: at(mark.endDate) }]
  })
}
