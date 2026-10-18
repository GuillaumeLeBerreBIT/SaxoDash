import { fmtCompact, fmtDate, fmtPct } from './format'

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

export function currentWeekLabel(date = new Date()) {
  const day = date.getDay()
  return day === 0 || day === 6 ? 'Upcoming week' : 'This week'
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

/** 'reported' (an actual is in) / 'pending' (the report date has passed but
 *  Finnhub's calendar hasn't posted an actual yet - it lags, sometimes by
 *  days) / 'upcoming' (the report hasn't happened yet). Without this split,
 *  "pending" and "upcoming" render identically (estimate only), which reads
 *  as "no data" for a company that already reported. `today` is injectable
 *  for tests; defaults to the real clock. */
export function reportStatus(event, today = new Date()) {
  if (event.eps_actual != null) return 'reported'
  const target = new Date(event.date + 'T00:00:00').getTime()
  const midnight = new Date(today).setHours(0, 0, 0, 0)
  return target < midnight ? 'pending' : 'upcoming'
}

/** Group date-sorted events by weekday key. Weekend keys appear only when
 *  they carry events; each list keeps its input order. */
export function groupByWeekday(events) {
  const groups = {}
  for (const event of events) {
    const key = weekdayKeyOf(event.date)
    groups[key] = groups[key] || []
    groups[key].push(event)
  }
  return groups
}

function dateWords(iso) {
  const [day, month, year] = fmtDate(iso).split(' ')
  return { day: String(Number(day)), month, year }
}

export function weekLabel(window) {
  if (!window || !window.from || !window.to) return ''
  const from = dateWords(window.from)
  const to = dateWords(window.to)
  if (from.year !== to.year) return `${from.day} ${from.month} ${from.year} – ${to.day} ${to.month} ${to.year}`
  if (from.month !== to.month) return `${from.day} ${from.month} – ${to.day} ${to.month} ${to.year}`
  return `${from.day} – ${to.day} ${to.month} ${to.year}`
}

export const SESSIONS = [
  ['bmo', 'Before open'],
  ['dmh', 'During hours'],
  ['amc', 'After close'],
]

export const SESSION_LABEL = Object.fromEntries(SESSIONS)

const UNSET_SESSION = 'Time not set'

export function sessionWords(session) {
  return SESSION_LABEL[session] || UNSET_SESSION
}

export function splitBySession(events) {
  const known = new Set(SESSIONS.map(([key]) => key))
  const sections = SESSIONS.map(([key, label]) => ({
    key,
    label,
    rows: events.filter((event) => event.session === key),
  }))
  sections.push({
    key: 'unset',
    label: UNSET_SESSION,
    rows: events.filter((event) => !known.has(event.session)),
  })
  return sections.filter((section) => section.rows.length > 0)
}

export function eventKey(event) {
  return [event.symbol, event.date, event.year ?? '', event.quarter ?? ''].join('-')
}

export function fmtRevenue(dollars) {
  if (dollars == null) return '—'
  const millions = dollars / 1e6
  if (millions > 0 && millions < 1) return '<1M'
  if (Math.abs(millions) < 10 && millions !== 0) return `${millions.toFixed(1)}M`
  return fmtCompact(millions)
}

export function dayDate(windowFrom, key) {
  const offset = WEEKDAYS.findIndex(([k]) => k === key)
  if (!windowFrom || offset < 0) return null
  const date = new Date(windowFrom + 'T00:00:00')
  date.setDate(date.getDate() + offset)
  return date.getDate()
}

export function weekdayKeyOf(iso) {
  return KEY_BY_DOW[new Date(iso + 'T00:00:00').getDay()]
}

const tier = (event) => (event.held ? 0 : event.watched ? 1 : 2)
const desc = (a, b) => (b ?? -Infinity) - (a ?? -Infinity)

export function rankEvents(events) {
  return [...events].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      (tier(a) === 0 ? desc(a.weight_pct, b.weight_pct) : 0) ||
      desc(a.market_cap, b.market_cap) ||
      desc(a.revenue_estimate, b.revenue_estimate) ||
      String(a.symbol).localeCompare(String(b.symbol)),
  )
}

export const GRID_SESSIONS = [
  ['bmo', SESSION_LABEL.bmo],
  ['amc', SESSION_LABEL.amc],
  ['other', `${SESSION_LABEL.dmh} / ${UNSET_SESSION.toLowerCase()}`],
]

export function gridSessionKey(session) {
  return session === 'bmo' || session === 'amc' ? session : 'other'
}

export function buildWeekGrid(events) {
  const busyDays = new Set(events.map((event) => weekdayKeyOf(event.date)))
  const days = WEEKDAYS.filter(([key], index) => index < 5 || busyDays.has(key))
  const busySessions = new Set(events.map((event) => gridSessionKey(event.session)))
  const sessions = GRID_SESSIONS.filter(([key]) => key !== 'other' || busySessions.has('other'))

  const cells = Object.fromEntries(sessions.map(([s]) => [s, Object.fromEntries(days.map(([d]) => [d, []]))]))
  for (const event of events) cells[gridSessionKey(event.session)][weekdayKeyOf(event.date)].push(event)
  for (const [s] of sessions) for (const [d] of days) cells[s][d] = rankEvents(cells[s][d])
  return { days, sessions, cells }
}

export function moveLabel(event) {
  if (event.move_pct == null) return null
  return { text: fmtPct(event.move_pct, { decimals: 1 }), basis: event.move_basis }
}

export function yourWeekTally(events) {
  const mine = events.filter((event) => event.mine)
  const reported = mine.filter((event) => event.eps_actual != null)
  return {
    count: mine.length,
    reported: reported.length,
    beat: reported.filter((event) => event.eps_surprise_pct > 0).length,
  }
}
