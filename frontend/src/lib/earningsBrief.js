const NUMBER_WORDS = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const SESSION_WORDS = { bmo: 'before the open', amc: 'after the close', dmh: 'during the session' }
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
const SHORT_DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const RESULT = [
  { word: 'Missed', tone: 'down' },
  { word: 'In line', tone: 'flat' },
  { word: 'Beat', tone: 'up' },
]

const dateOf = (iso) => new Date(`${String(iso).slice(0, 10)}T00:00:00`)

function daysFrom(iso, today) {
  const midnight = new Date(today)
  midnight.setHours(0, 0, 0, 0)
  return Math.round((dateOf(iso).getTime() - midnight.getTime()) / 86_400_000)
}

function dayWords(iso, today) {
  const days = daysFrom(iso, today)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `on ${WEEKDAY.format(dateOf(iso))}`
}

export function whenWords(event, today = new Date()) {
  const session = SESSION_WORDS[event.session]
  return session ? `${dayWords(event.date, today)} ${session}` : dayWords(event.date, today)
}

export function earningsHeadline(mine, nextMine, today = new Date()) {
  if (!mine.length) {
    const next = nextMine ? ` The next is ${nextMine.symbol} on ${SHORT_DAY.format(dateOf(nextMine.date)).replace(',', '')}.` : ''
    return `None of your stocks report this week.${next}`
  }
  if (mine.length === 1) {
    const [only] = mine
    return `${only.name || only.symbol}, which you ${only.held ? 'own' : 'watch'}, reports ${whenWords(only, today)}.`
  }
  const ordered = [...mine].sort((a, b) => a.date.localeCompare(b.date))
  const parts = ordered.map((event) => `${event.symbol} ${dayWords(event.date, today)}`)
  const listed = parts.length === 2 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  const count = NUMBER_WORDS[mine.length] ?? String(mine.length)
  return `${count} of your stocks report this week: ${listed}.`
}

export function marketSentence(stats) {
  if (!stats?.total) return null
  const base = `${stats.total} companies report this week`
  if (!stats.reported) return `${base}.`
  return `${base}; ${Math.round((stats.beat / stats.reported) * 100)}% of those already out beat what analysts expected.`
}

const REPORTED = { word: 'Reported', tone: 'flat' }

const sign = (value) => (value === 0 ? 0 : value > 0 ? 1 : -1)
const surpriseResult = (surprise) => (surprise == null ? REPORTED : RESULT[sign(surprise) + 1])

export function resultWord(event, today = new Date()) {
  if (event.eps_actual != null) return surpriseResult(event.eps_surprise_pct)
  if (event.eps_estimate == null) return null
  return daysFrom(event.date, today) < 0 ? { word: 'Waiting', tone: 'warn' } : { word: 'Due', tone: 'flat' }
}

export function lastResults(history, count = 4) {
  return (history ?? [])
    .filter((row) => row.eps_actual != null)
    .slice(-count)
    .map((row) => ({ date: row.date, ...surpriseResult(row.eps_surprise_pct) }))
}
