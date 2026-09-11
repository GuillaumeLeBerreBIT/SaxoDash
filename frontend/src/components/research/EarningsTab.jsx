import { daysUntil } from '../../lib/earnings'
import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { Card, CardHeader, Metric, Skeleton } from '../ui'
import EarningsInsights from './EarningsInsights'
import EpsBarChart from './EpsBarChart'

const SESSION_LABEL = { bmo: 'Before open', amc: 'After close', dmh: 'During hours' }

function NextEarningsCard({ next }) {
  return (
    <Card>
      <CardHeader title="Next earnings" subtitle={next ? daysUntil(next.date) : 'Not scheduled'} />
      {next ? (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Date" value={next.date} />
          <Metric label="Session" value={SESSION_LABEL[next.session] || '—'} />
          <Metric label="EPS estimate" value={fmtNum(next.eps_estimate, 2)} />
          <Metric
            label="Revenue estimate"
            value={next.revenue_estimate == null ? '—' : fmtCompact(next.revenue_estimate / 1e6)}
          />
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-zinc-500">No scheduled earnings date for this symbol.</p>
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
      <div className={`mt-3 pt-3 border-t border-white/[0.06] text-[11px] ${consistent ? 'text-emerald-400' : 'text-red-400'}`}>
        {consistent ? 'A consistent beat history.' : 'A patchy record against consensus.'}
      </div>
    </Card>
  )
}

export default function EarningsTab({ symbol, earnings, fundamentals }) {
  const { data, isLoading } = earnings

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
        <p className="mt-3 text-[12px] text-zinc-500">{data?.reason || `No earnings data for ${symbol}.`}</p>
      </Card>
    )
  }

  const epsRows = data.history.map((e) => ({
    period: e.date.slice(0, 7),
    actual: e.eps_actual,
    estimate: e.eps_estimate,
    surprise: e.eps_surprise_pct,
  }))

  return (
    <div className="space-y-4">
      <NextEarningsCard next={data.next} />
      <EarningsInsights fundamentals={fundamentals} />
      <EpsBarChart
        title="EPS: actual vs. estimate"
        subtitle="Reported quarters, labelled with the surprise vs. consensus"
        data={epsRows}
        format={(v) => fmtNum(v, 2)}
      />
      <BeatRecord score={data.score} />
    </div>
  )
}
