import { UNKNOWN, fmtNum, fmtPct } from './format'

const METRIC_LABELS = {
  rsi14: (v) => `RSI ${fmtNum(v, 0)}`,
  pct_vs_ma200: (v) => `${fmtPct(v, { decimals: 1 })} vs 200-day MA`,
  change_3m: (v) => `${fmtPct(v, { decimals: 1 })} in 3 months`,
  pct_from_52w_high: (v) => `${fmtPct(v, { decimals: 1 })} from 52-week high`,
  pe: (v) => `P/E ${fmtNum(v, 1)}`,
  rvol: (v) => `${fmtNum(v, 1)}× average volume`,
}

export function formatShelfMetric(metric, value) {
  if (value == null) return UNKNOWN
  return (METRIC_LABELS[metric] ?? ((v) => fmtNum(v, 2)))(value)
}

const asDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function healthNotice(health, asOf) {
  if (health?.state === 'never') {
    return { tone: 'info', text: 'No scan yet. It runs nightly, or run `manage.py scan_universe`.' }
  }
  if (health?.state === 'failed') {
    return { tone: 'error', text: `The last scan failed. Showing data from ${asDate(asOf)}.` }
  }
  if (health?.state === 'stale') {
    return { tone: 'warning', text: `No fresh scan since ${asDate(asOf)}.` }
  }
  return null
}
