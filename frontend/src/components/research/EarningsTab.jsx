import { useState } from 'react'

import { useStatements } from '../../api/queries'
import { SESSION_LABEL, daysUntil } from '../../lib/earnings'
import { annualEpsRows, quarterlyEpsRows } from '../../lib/epsSeries'
import { fmtCompact, fmtDate, fmtNum, fmtPct } from '../../lib/format'
import { Card, CardHeader, Metric, Skeleton, TBtn } from '../ui'
import EarningsInsights from './EarningsInsights'
import EpsBarChart from './EpsBarChart'

function NextEarningsCard({ next }) {
  return (
    <Card>
      <CardHeader title="Next earnings" subtitle={next ? daysUntil(next.date) : 'Not scheduled'} />
      {next ? (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Date" value={fmtDate(next.date)} />
          <Metric label="Session" value={SESSION_LABEL[next.session] || '—'} />
          <Metric label="EPS estimate" value={fmtNum(next.eps_estimate, 2)} />
          <Metric
            label="Revenue estimate"
            value={next.revenue_estimate == null ? '—' : fmtCompact(next.revenue_estimate / 1e6)}
          />
        </div>
      ) : (
        <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">No scheduled earnings date for this symbol.</p>
      )}
    </Card>
  )
}

/** The backend's beat record as three figures and a one-line verdict - no
 *  chart, so it doesn't echo the EPS history bars above it. */
function BeatRecord({ score }) {
  if (!score?.quarters) return null
  const consistent = score.beats > score.quarters / 2

  return (
    <Card>
      <CardHeader title="Beat record" subtitle={`Last ${score.quarters} reported quarters`} />
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Metric label="Beat estimate" value={`${score.beats}/${score.quarters}`} />
        <Metric label="Avg surprise" value={fmtPct(score.avg_surprise, { decimals: 1 })} />
        <Metric
          label="Current streak"
          value={score.streak ? `${score.streak} qtr${score.streak > 1 ? 's' : ''}` : '—'}
        />
      </div>
      <div className={`mt-3 pt-3 border-t border-white/[0.06] text-[var(--fig-2xs)] ${consistent ? 'text-emerald-400' : 'text-red-400'}`}>
        {consistent ? 'A consistent beat history.' : 'A patchy record against consensus.'}
      </div>
    </Card>
  )
}

export default function EarningsTab({ symbol, earnings, fundamentals }) {
  const { data, isLoading } = earnings
  const [view, setView] = useState('quarterly')
  const statements = useStatements(view === 'annual' ? symbol : '')

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="Earnings" subtitle="From Finnhub" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
    )
  }

  if (!data?.available) {
    return (
      <Card>
        <CardHeader title="Earnings" subtitle="From Finnhub" />
        <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">{data?.reason || `No earnings data for ${symbol}.`}</p>
      </Card>
    )
  }

  const annualRows = annualEpsRows(statements.data?.available ? statements.data.annual : [])
  const viewToggle = (
    <div className="flex items-center gap-0.5">
      {[
        ['quarterly', 'Quarterly'],
        ['annual', 'Annual'],
      ].map(([key, label]) => (
        <TBtn key={key} active={view === key} onClick={() => setView(key)}>
          {label}
        </TBtn>
      ))}
    </div>
  )

  return (
    <div className="space-y-4">
      <NextEarningsCard next={data.next} />
      <EarningsInsights fundamentals={fundamentals} />
      <div className="flex justify-end">{viewToggle}</div>
      {view === 'quarterly' ? (
        <EpsBarChart
          title="EPS: actual vs. estimate"
          subtitle="Reported quarters, labelled with the surprise vs. consensus"
          data={quarterlyEpsRows(data.history, data.upcoming)}
          format={(v) => fmtNum(v, 2)}
        />
      ) : statements.isLoading ? (
        <Card>
          <Skeleton className="h-40 w-full" />
        </Card>
      ) : annualRows.length > 0 ? (
        <EpsBarChart
          title="Diluted EPS by fiscal year"
          subtitle="From the annual reports"
          data={annualRows}
          format={(v) => fmtNum(v, 2)}
        />
      ) : (
        <Card>
          <p className="text-[var(--fig-xs)] text-zinc-500">Annual EPS is unavailable for {symbol}.</p>
        </Card>
      )}
      <BeatRecord score={data.score} />
    </div>
  )
}
