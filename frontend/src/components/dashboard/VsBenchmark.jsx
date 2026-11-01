import { Link } from 'react-router-dom'

import { needsDaysNote } from '../../lib/portfolioStats'
import { Card, Move } from '../ui'

const SINCE_INCEPTION = 'Since inception'

function Figure({ label, value }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-ink-3">{label}</div>
      <Move value={value} digits={1} className="text-[20px] font-bold tracking-[-0.01em]" />
    </div>
  )
}

function contextDot(data, row) {
  if (!data || !row) return 'off'
  return data.benchmark?.reason ? 'warn' : 'ok'
}

export default function VsBenchmark({ data, className = '' }) {
  const row = data?.periods?.find((period) => period.label === SINCE_INCEPTION)
  const benchmarkName = data?.benchmark?.name ?? 'S&P 500'
  const reason = data?.benchmark?.reason
  const waiting = row && row.portfolio_pct == null ? needsDaysNote(row.needs_days) : null
  const days = data?.history_days
  return (
    <Card
      className={className}
      context={`${SINCE_INCEPTION} · net-worth history${days ? ` · ${days} days` : ''}`}
      dot={contextDot(data, row)}
      title="Vs the US 500"
      right={
        <Link to="/analytics" className="text-[13px] font-semibold text-ink-2 hover:text-ink whitespace-nowrap">
          Analytics →
        </Link>
      }
    >
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Figure label="You" value={row?.portfolio_pct} />
        <Figure label={benchmarkName} value={row?.benchmark_pct} />
        <Figure label="Edge" value={row?.alpha_pct} />
      </div>
      {waiting && <p className="mt-3 text-[12px] text-ink-3">Your return {waiting}.</p>}
      {reason && (
        <p className="mt-3 text-[12px] text-ink-3">
          {benchmarkName} is blank — {reason}
        </p>
      )}
      {!data && <p className="mt-3 text-[12px] text-ink-3">Loading the comparison…</p>}
    </Card>
  )
}
