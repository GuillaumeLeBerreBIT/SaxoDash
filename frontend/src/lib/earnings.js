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

/** The weekday key for `date` (default: now), clamped to a trading day so
 *  the docket opens on today's column - Sat/Sun fall back to Monday. */
export function weekdayKey(date = new Date()) {
  const key = KEY_BY_DOW[date.getDay()]
  return key === 'sat' || key === 'sun' ? 'mon' : key
}

/** "today" / "tomorrow" / "in 4 days" / "past" for an ISO date, relative to
 *  local midnight. Shared by the Earnings and Valuation tabs. */
export function daysUntil(iso) {
  const target = new Date(iso + 'T00:00:00').getTime()
  const midnight = new Date().setHours(0, 0, 0, 0)
  const days = Math.round((target - midnight) / 86_400_000)
  if (days < 0) return 'past'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

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
