import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardHeader, MetricTile, Skeleton } from '../ui'
import { useInvestorCopy } from '../../api/queries'
import { AXIS_TEXT, SERIES_TOTAL, axisProps, chartTooltipProps, gridProps, seriesAxis } from '../../lib/charts'
import { fmtDate, fmtMonthYear, fmtPct } from '../../lib/format'
import { copyCaveat, copySeries, copyVerdict } from '../../lib/investors'

const wholePct = (value) => fmtPct(value, { decimals: 0 })
const onePct = (value) => fmtPct(value, { decimals: 1 })
const points = (value) => `${onePct(value).replace('%', '')} pts`

function Legend({ benchmark }) {
  return (
    <ul aria-label="Chart series" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      <li className="flex items-center gap-1.5 text-[var(--fig-xs)] text-zinc-400">
        <span className="w-4 border-t-2" style={{ borderColor: SERIES_TOTAL }} />
        Copy
      </li>
      <li className="flex items-center gap-1.5 text-[var(--fig-xs)] text-zinc-400">
        <span className="w-4 border-t-2 border-dashed" style={{ borderColor: AXIS_TEXT }} />
        {benchmark}
      </li>
    </ul>
  )
}

function Figures({ copy }) {
  const yearly = copy.excess_cagr_pct
  return (
    <div role="group" aria-label="Copy performance" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      <MetricTile label="Copy" value={onePct(copy.clone_return_pct)} hint={`since ${fmtDate(copy.since)}`} />
      <MetricTile label={copy.benchmark} value={onePct(copy.benchmark_return_pct)} hint="same days" />
      <MetricTile
        label="Difference"
        value={points(copy.excess_return_pct)}
        hint={copyVerdict(copy.excess_return_pct, copy.benchmark)}
      />
      <MetricTile
        label="Per year"
        value={yearly == null ? '—' : points(yearly)}
        hint={yearly == null ? 'needs a full year of history' : `${onePct(copy.clone_cagr_pct)} vs ${onePct(copy.benchmark_cagr_pct)} a year`}
      />
    </div>
  )
}

export function CopyPerformanceView({ copy, name, subtitle }) {
  if (!copy) return null

  const title = `If you had copied ${name}`
  if (!copy.available) {
    return (
      <Card>
        <CardHeader
          title={title}
          subtitle="Not measured yet. Daily prices load overnight from Saxo; the comparison appears once they are in."
        />
      </Card>
    )
  }

  const rows = copySeries(copy.series)
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="mt-4">
        <Figures copy={copy} />
      </div>
      <div className="mt-4 h-[var(--chart-h-lg)]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="date" tickFormatter={fmtMonthYear} minTickGap={48} />
            <YAxis
              {...axisProps}
              width={56}
              tickFormatter={wholePct}
              {...seriesAxis(rows, ['clone', 'benchmark'], { includeZero: true })}
            />
            <Tooltip {...chartTooltipProps} labelFormatter={fmtDate} formatter={(value, label) => [onePct(value), label]} />
            <Line
              type="monotone"
              dataKey="benchmark"
              name={copy.benchmark}
              stroke={AXIS_TEXT}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="clone"
              name="Copy"
              stroke={SERIES_TOTAL}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legend benchmark={copy.benchmark} />
      <p className="mt-3 text-[var(--fig-xs)] text-zinc-500 max-w-[80ch]">{copyCaveat(copy)}</p>
    </Card>
  )
}

export default function CopyPerformancePanel({ slug, name }) {
  const { data: copy, isLoading } = useInvestorCopy(slug)

  if (isLoading) return <Skeleton className="h-64" />
  return (
    <CopyPerformanceView
      copy={copy}
      name={name}
      subtitle={copy?.available ? `Top ${copy.holdings} disclosed holdings, bought at the close of the first trading day after each filing and held until the next` : undefined}
    />
  )
}
