import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { Card, CardHeader } from '../ui'
import EpsBarChart from './EpsBarChart'

const SESSION_LABEL = { bmo: 'Before open', amc: 'After close', dmh: 'During hours' }

function daysUntil(iso) {
  const target = new Date(iso + 'T00:00:00').getTime()
  const midnight = new Date().setHours(0, 0, 0, 0)
  const days = Math.round((target - midnight) / 86_400_000)
  if (days < 0) return 'past'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

function Metric({ label, value }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">{label}</div>
      <div className="text-[15px] num font-mono mt-1 text-zinc-100">{value}</div>
    </div>
  )
}

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

function surpriseScore(history) {
  const scored = history.filter((e) => e.eps_surprise_pct != null)
  if (!scored.length) return null
  const beats = scored.filter((e) => e.eps_surprise_pct > 0).length
  const avg = scored.reduce((sum, e) => sum + e.eps_surprise_pct, 0) / scored.length
  return { beats, of: scored.length, avg }
}

function SurpriseTrend({ history }) {
  const rows = history.filter((e) => e.eps_surprise_pct != null).slice(-8)
  if (!rows.length) return null

  const score = surpriseScore(history)
  const verdict = score.beats > score.of / 2 ? 'text-emerald-400' : 'text-red-400'

  return (
    <Card>
      <CardHeader
        title="EPS surprise"
        subtitle={`Beat estimates ${score.beats} of the last ${score.of} · avg surprise ${fmtPct(score.avg, { decimals: 1 })}`}
      />
      <div className="mt-4 flex flex-wrap gap-4">
        {rows.map((e) => (
          <div key={e.date} className="text-center">
            <div
              className={`text-[13px] num font-mono ${e.eps_surprise_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {fmtPct(e.eps_surprise_pct, { decimals: 1 })}
            </div>
            <div className="text-[10px] text-zinc-500">{e.date.slice(0, 7)}</div>
          </div>
        ))}
      </div>
      <div className={`mt-3 pt-3 border-t border-white/[0.06] text-[11px] ${verdict}`}>
        {score.beats > score.of / 2
          ? 'A consistent beat history.'
          : 'A patchy record against consensus.'}
      </div>
    </Card>
  )
}

export default function EarningsTab({ symbol, earnings }) {
  const { data, isLoading } = earnings

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="Earnings" subtitle="From Finnhub" />
        <div className="mt-3 text-[12px] text-zinc-500">Loading…</div>
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
  }))

  return (
    <div className="space-y-4">
      <NextEarningsCard next={data.next} />
      <EpsBarChart
        title="EPS: actual vs. estimate"
        subtitle="Reported quarters"
        data={epsRows}
        format={(v) => fmtNum(v, 2)}
      />
      <SurpriseTrend history={data.history} />
    </div>
  )
}
