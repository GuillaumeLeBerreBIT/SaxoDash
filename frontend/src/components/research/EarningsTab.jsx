import { useState } from 'react'

import { SESSION_LABEL, daysUntil } from '../../lib/earnings'
import { annualEpsRows, quarterlyEpsRows } from '../../lib/epsSeries'
import { fmtCompact, fmtDate, fmtNum, fmtPct } from '../../lib/format'
import { Card, Segmented, Skeleton, Tile } from '../ui'
import EarningsInsights from './EarningsInsights'
import EpsBarChart from './EpsBarChart'

const BOARD = 'grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start'
const SPAN_4 = 'min-[1100px]:col-span-4'
const SPAN_12 = 'min-[1100px]:col-span-12'

const VIEWS = [
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
]

function NextEarningsCard({ next }) {
  return (
    <Card className={SPAN_4} context={next ? `Finnhub calendar · ${daysUntil(next.date)}` : 'Finnhub calendar'} dot="earn" title="Next earnings">
      {next ? (
        <>
          <div className="text-[26px] font-bold num text-ink">{fmtDate(next.date)}</div>
          <div className="mt-1 text-[14px] text-ink-2">{SESSION_LABEL[next.session] || '—'}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Tile label="EPS estimate" value={next.eps_estimate == null ? null : fmtNum(next.eps_estimate, 2)} />
            <Tile
              label="Revenue estimate"
              value={next.revenue_estimate == null ? null : fmtCompact(next.revenue_estimate / 1e6)}
            />
          </div>
        </>
      ) : (
        <p className="text-[13px] text-ink-3">No scheduled earnings date for this symbol.</p>
      )}
    </Card>
  )
}

function BeatRecord({ score }) {
  if (!score?.quarters) return null
  const consistent = score.beats > score.quarters / 2

  return (
    <Card
      className={SPAN_4}
      context={`Last ${score.quarters} reported quarters`}
      dot={consistent ? 'ok' : 'warn'}
      title="Beat record"
    >
      <div className="text-[26px] font-bold num text-ink">{`${score.beats}/${score.quarters}`}</div>
      <div className="mt-1 text-[14px] text-ink-2">reports beat the consensus</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Tile label="Avg surprise" value={score.avg_surprise == null ? null : fmtPct(score.avg_surprise, { decimals: 1 })} />
        <Tile
          label="Current streak"
          value={score.streak ? `${score.streak} qtr${score.streak > 1 ? 's' : ''}` : null}
        />
      </div>
      <p className={`mt-3 text-[13px] font-medium ${consistent ? 'text-up' : 'text-down'}`}>
        {consistent ? 'A consistent beat history.' : 'A patchy record against consensus.'}
      </p>
    </Card>
  )
}

function EpsHistory({ symbol, view, onView, data, fundamentals, annualRows }) {
  const toggle = <Segmented label="EPS period" options={VIEWS} value={view} onChange={onView} />
  if (view === 'quarterly') {
    const quarterlyRows = quarterlyEpsRows(data.history, data.upcoming)
    if (!quarterlyRows.length) {
      return (
        <Card className={SPAN_12} context="Reported quarters, labelled with the surprise vs. consensus" dot="off" title="EPS: actual vs. estimate" right={toggle}>
          <p className="text-[13px] text-ink-3">No reported quarters for {symbol}.</p>
        </Card>
      )
    }
    return (
      <EpsBarChart
        className={SPAN_12}
        title="EPS: actual vs. estimate"
        subtitle="Reported quarters, labelled with the surprise vs. consensus"
        data={quarterlyRows}
        format={(v) => fmtNum(v, 2)}
        control={toggle}
      />
    )
  }
  if (fundamentals?.isLoading) {
    return (
      <Card className={SPAN_12} context="Adjusted for splits, from Finnhub" dot="off" title="Diluted EPS by fiscal year" right={toggle}>
        <Skeleton className="h-40 w-full" />
      </Card>
    )
  }
  if (annualRows.length > 0) {
    return (
      <EpsBarChart
        className={SPAN_12}
        title="Diluted EPS by fiscal year"
        subtitle="Adjusted for splits, from Finnhub"
        data={annualRows}
        format={(v) => fmtNum(v, 2)}
        control={toggle}
      />
    )
  }
  return (
    <Card className={SPAN_12} context="Adjusted for splits, from Finnhub" dot="off" title="Diluted EPS by fiscal year" right={toggle}>
      <p className="text-[13px] text-ink-3">Annual EPS is unavailable for {symbol}.</p>
    </Card>
  )
}

export default function EarningsTab({ symbol, earnings, fundamentals }) {
  const { data, isLoading } = earnings
  const [view, setView] = useState('quarterly')

  if (isLoading) {
    return (
      <Card context="From Finnhub" dot="off" title="Earnings">
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
    )
  }

  if (!data?.available) {
    return (
      <Card context="From Finnhub" dot="off" title="Earnings">
        <p className="text-[13px] text-ink-3">{data?.reason || `No earnings data for ${symbol}.`}</p>
      </Card>
    )
  }

  const annualRows = annualEpsRows(fundamentals?.data?.available ? fundamentals.data.annual_eps : [])

  return (
    <div className={BOARD}>
      <NextEarningsCard next={data.next} />
      <BeatRecord score={data.score} />
      <EarningsInsights fundamentals={fundamentals} className={data.score?.quarters ? SPAN_4 : 'min-[1100px]:col-span-8'} />
      <EpsHistory
        symbol={symbol}
        view={view}
        onView={setView}
        data={data}
        fundamentals={fundamentals}
        annualRows={annualRows}
      />
    </div>
  )
}
