import { UNKNOWN, fmtNum, fmtPct } from './format'

const FIELD_FORMATS = {
  number: (v) => fmtNum(v, 0),
  pct: (v) => fmtPct(v, { sign: false, decimals: 0 }),
  signed_pct: (v) => fmtPct(v, { decimals: 1 }),
  ratio: (v) => fmtNum(v, 1),
  multiple: (v) => `${fmtNum(v, 1)}×`,
}

export function formatFieldValue(format, value) {
  if (value == null) return UNKNOWN
  return (FIELD_FORMATS[format] ?? ((v) => fmtNum(v, 2)))(value)
}

export const formatReason = ({ label, value, format }) => `${label} ${formatFieldValue(format, value)}`

export const reasonsLine = (reasons) => reasons.map(formatReason).join(' · ')

export const stockCount = (total) => `${total} ${total === 1 ? 'stock' : 'stocks'}`

export function shelfNote({ order, total }, shownCount) {
  const shown = shownCount < total ? ` Showing the first ${shownCount} of ${total}.` : ''
  return `${order}.${shown} A filter on the last scan, not a recommendation.`
}

export const SCANNING_POLL_MS = 10_000

export const discoverPollInterval = (data) => (data?.health?.progress ? SCANNING_POLL_MS : false)

export const scanProgressLabel = ({ done, total }) =>
  total == null ? 'Starting scan…' : `Scanning stocks · ${done} of ${total}`

const asDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export const reasonParts = ({ label, value, format }) => ({ label, value: formatFieldValue(format, value) })

export const SPARKLINE_PERIOD = '3M'

export const REFRESH_HINT = 'Rescans every stock in the S&P 500 and Nasdaq-100. Takes several minutes.'

export function scanEtaLabel(progress, now = new Date()) {
  const { done, total, started_at: startedAt } = progress ?? {}
  if (!startedAt || !done || total == null) return null
  const elapsed = now - new Date(startedAt)
  if (!(elapsed > 0)) return null
  const perStock = elapsed / done
  const remaining = perStock * (total - done)
  if (!Number.isFinite(remaining) || remaining < 0) return null
  if (remaining < MINUTE_MS) return 'Less than a minute left'
  return `About ${Math.ceil(remaining / MINUTE_MS)} min left`
}

const CARD_WIDTH = 224
const CARD_GAP = 12
export const GRID_MIN_WIDTH = 640

export function cardsThatFit(width) {
  if (!width || width < GRID_MIN_WIDTH) return null
  return Math.max(1, Math.floor((width + CARD_GAP) / (CARD_WIDTH + CARD_GAP)))
}

export function updatedLabel(iso, now = new Date()) {
  if (!iso) return 'Not scanned yet'
  const elapsed = now - new Date(iso)
  if (elapsed < MINUTE_MS) return 'Updated just now'
  if (elapsed < HOUR_MS) return `Updated ${Math.floor(elapsed / MINUTE_MS)} min ago`
  if (elapsed < DAY_MS) return `Updated ${Math.floor(elapsed / HOUR_MS)} h ago`
  const days = Math.floor(elapsed / DAY_MS)
  return `Updated ${days} ${days === 1 ? 'day' : 'days'} ago`
}

const withIssue = (text, issue) => (issue ? `${text} Last attempt: ${issue}` : text)

export function healthNotice(health, asOf) {
  if (health?.state === 'never') {
    return { tone: 'info', text: 'No scan yet. It runs nightly, or run `manage.py scan_universe`.' }
  }
  if (health?.state === 'scanning') {
    return { tone: 'info', text: 'First scan in progress. Shelves appear when it finishes.' }
  }
  if (health?.state === 'failed') {
    const text = asOf ? `The last scan failed. Showing data from ${asDate(asOf)}.` : 'The last scan failed.'
    return { tone: 'error', text: withIssue(text, health.issue) }
  }
  if (health?.state === 'stale') {
    const text = asOf ? `No fresh scan since ${asDate(asOf)}.` : 'No fresh scan recently.'
    return { tone: 'warning', text: withIssue(text, health.issue) }
  }
  return null
}
