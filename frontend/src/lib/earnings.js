export const WEEKDAYS = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
]

const KEY_BY_DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Group date-sorted events by weekday key. Weekend keys appear only when
 *  they carry events; each list keeps its input order. */
export function groupByWeekday(events) {
  const groups = {}
  for (const event of events) {
    const key = KEY_BY_DOW[new Date(event.date + 'T00:00:00').getDay()]
    groups[key] = groups[key] || []
    groups[key].push(event)
  }
  return groups
}

/** "Oct 26 – 30 · October 2026" from a {from, to} window; the month is
 *  collapsed on the right when both ends share it. */
export function weekLabel(window) {
  if (!window || !window.from || !window.to) return ''
  const from = new Date(window.from + 'T00:00:00')
  const to = new Date(window.to + 'T00:00:00')
  const short = (d) => d.toLocaleDateString(undefined, { month: 'short' })
  const monthYear = to.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const left = `${short(from)} ${from.getDate()}`
  const right = from.getMonth() === to.getMonth() ? `${to.getDate()}` : `${short(to)} ${to.getDate()}`
  return `${left} – ${right} · ${monthYear}`
}
