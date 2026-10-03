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

export function shelfNote({ order, total, items }) {
  const shown = items.length < total ? ` Showing the first ${items.length} of ${total}.` : ''
  return `${order}.${shown} A filter on the last scan, not a recommendation.`
}

export const SCANNING_POLL_MS = 10_000

export const discoverPollInterval = (data) => (data?.health?.progress ? SCANNING_POLL_MS : false)

export const scanProgressLabel = ({ done, total }) =>
  total == null ? 'Starting scan…' : `Scanning stocks · ${done} of ${total}`

const asDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function healthNotice(health, asOf) {
  if (health?.state === 'never') {
    return { tone: 'info', text: 'No scan yet. It runs nightly, or run `manage.py scan_universe`.' }
  }
  if (health?.state === 'scanning') {
    return { tone: 'info', text: 'First scan in progress. Shelves appear when it finishes.' }
  }
  if (health?.state === 'failed') {
    return { tone: 'error', text: asOf ? `The last scan failed. Showing data from ${asDate(asOf)}.` : 'The last scan failed.' }
  }
  if (health?.state === 'stale') {
    return { tone: 'warning', text: asOf ? `No fresh scan since ${asDate(asOf)}.` : 'No fresh scan recently.' }
  }
  return null
}
