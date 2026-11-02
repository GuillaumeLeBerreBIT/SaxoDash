import { Link } from 'react-router-dom'
import { useBudgetProgress, useNetWorth } from '../../api/queries'
import { fmtEur } from '../../lib/format'
import { spendingDelta } from '../../lib/spendingDelta'
import { Card, Tag } from '../ui'

const DELTA_TAG = { red: 'down', emerald: 'up', zinc: 'neutral' }
const FIGURE = 'text-[26px] font-bold tracking-[-0.01em] num'

export function SpendingDelta({ summary }) {
  const previousTotal = summary?.previous_period ? Number(summary.previous_period.total) : null
  const delta = spendingDelta({
    total: Number(summary?.total ?? 0),
    previousTotal,
    comparisonLabel: summary?.comparison_label,
  })
  if (!delta.badge && !delta.note) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {delta.badge && <Tag tone={DELTA_TAG[delta.tone] ?? 'neutral'} className="num">{delta.badge}</Tag>}
      {delta.note && <span className="num">{delta.note}</span>}
    </span>
  )
}

function Figure({ value, tone = 'text-ink' }) {
  return value == null ? <div className={`${FIGURE} text-ink-3`}>—</div> : <div className={`${FIGURE} ${tone}`}>{value}</div>
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-11 border-t border-line first:border-t-0 text-[13.5px]">
      <span className="text-ink-2">{label}</span>
      <span className={`font-semibold num ${value == null ? 'text-ink-3' : 'text-ink'}`}>{value ?? '—'}</span>
    </div>
  )
}

const amount = (raw) => (raw == null ? null : fmtEur(raw))

export function CashPanel({ className = '' }) {
  const { data: netWorth, error } = useNetWorth()
  return (
    <Card className={className} context="Bank accounts + Saxo cash" dot={error ? 'warn' : netWorth ? 'ok' : 'off'} title="Cash">
      <Figure value={amount(netWorth?.bank_total)} />
      <div className="mt-2.5">
        <Row label="Bank" value={amount(netWorth?.bank_only_total)} />
        <Row label="Saxo cash" value={amount(netWorth?.broker_cash)} />
      </div>
    </Card>
  )
}

export function SpentThisMonthPanel({ summary, period, error, className = '' }) {
  return (
    <Card
      className={className}
      context={`Bank transactions · ${period.label}`}
      dot={error ? 'warn' : summary ? 'ok' : 'off'}
      title="Spent this month"
      right={
        <Link to="/money?section=spending" className="text-[13px] font-semibold text-ink-2 hover:text-ink whitespace-nowrap">
          Spending →
        </Link>
      }
    >
      <Figure value={summary ? fmtEur(summary.total) : null} />
      <div className="mt-2 text-[12px] text-ink-2">
        <SpendingDelta summary={summary} />
      </div>
    </Card>
  )
}

export function BudgetLeftPanel({ className = '' }) {
  const { data: rows, error } = useBudgetProgress()
  const budgets = rows ?? []
  const limit = budgets.reduce((sum, row) => sum + Number(row.limit), 0)
  const spent = budgets.reduce((sum, row) => sum + Number(row.spent), 0)
  const left = limit - spent
  const count = budgets.length

  return (
    <Card className={className} context="Monthly budgets · this month" dot={error ? 'warn' : count ? 'ok' : 'off'} title="Budget left">
      <Figure value={count ? fmtEur(left) : null} tone={left < 0 ? 'text-down' : 'text-ink'} />
      <p className="mt-2 text-[12px] text-ink-2 num">
        {count ? `of ${fmtEur(limit)} across ${count} budget${count === 1 ? '' : 's'}` : 'No budgets set yet'}
      </p>
    </Card>
  )
}
