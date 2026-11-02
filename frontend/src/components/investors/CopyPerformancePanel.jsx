import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, Skeleton, Tile } from '../ui'
import { useInvestorCopy } from '../../api/queries'
import { axisProps, chartTooltipProps, gridProps, seriesAxis } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'
import { fmtDate, fmtMonthYear, fmtPct } from '../../lib/format'
import { copyCaveat, copySeries, copyVerdict, points } from '../../lib/investors'

const wholePct = (value) => fmtPct(value, { decimals: 0 })
const onePct = (value) => fmtPct(value, { decimals: 1 })

function Legend({ benchmark, c }) {
  return (
    <ul aria-label="Chart series" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      <li className="flex items-center gap-1.5 text-[12px] text-ink-2">
        <span aria-hidden="true" className="w-4 border-t-2" style={{ borderColor: c.primary }} />
        Copy
      </li>
      <li className="flex items-center gap-1.5 text-[12px] text-ink-2">
        <span aria-hidden="true" className="w-4 border-t-2 border-dashed" style={{ borderColor: c.bench }} />
        {benchmark}
      </li>
    </ul>
  )
}

export function CopyFigures({ copy, children }) {
  const yearly = copy.excess_cagr_pct
  return (
    <div role="group" aria-label="Copy performance" className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
      <Tile label="Copy" value={onePct(copy.clone_return_pct)} sub={`since ${fmtDate(copy.since)}`} />
      <Tile label={copy.benchmark} value={onePct(copy.benchmark_return_pct)} sub="same days" />
      <Tile label="Difference" value={points(copy.excess_return_pct)} sub={copyVerdict(copy.excess_return_pct, copy.benchmark)} />
      <Tile
        label="Per year"
        value={yearly == null ? null : points(yearly)}
        sub={yearly == null ? 'needs a full year of history' : `${onePct(copy.clone_cagr_pct)} vs ${onePct(copy.benchmark_cagr_pct)} a year`}
      />
      {children}
    </div>
  )
}

function CopyChart({ copy }) {
  const c = useChartColors()
  const rows = copySeries(copy.series)
  return (
    <>
      <div className="h-[var(--chart-h-lg)]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid {...gridProps(c)} />
            <XAxis {...axisProps(c)} dataKey="date" tickFormatter={fmtMonthYear} minTickGap={48} />
            <YAxis
              {...axisProps(c)}
              width={56}
              tickFormatter={wholePct}
              {...seriesAxis(rows, ['clone', 'benchmark'], { includeZero: true })}
            />
            <Tooltip {...chartTooltipProps(c)} labelFormatter={fmtDate} formatter={(value, label) => [onePct(value), label]} />
            <Line
              type="monotone"
              dataKey="benchmark"
              name={copy.benchmark}
              stroke={c.bench}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="clone"
              name="Copy"
              stroke={c.primary}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legend benchmark={copy.benchmark} c={c} />
      <p className="mt-3 text-[12px] text-ink-3 max-w-[80ch]">{copyCaveat(copy)}</p>
    </>
  )
}

export function CopyPerformanceView({ copy, name, subtitle, figures = true }) {
  if (!copy) return null

  const title = `If you had copied ${name}`
  if (!copy.available) {
    return (
      <Card dot="off" context="Copy performance" title={title}>
        <p className="text-[13px] text-ink-2">
          Not measured yet. Daily prices load overnight from Saxo; the comparison appears once they are in.
        </p>
      </Card>
    )
  }

  return (
    <Card dot="ok" context={`Copy performance · Saxo daily closes to ${fmtDate(copy.until)}`} title={title}>
      <div className="flex flex-col gap-4">
        {subtitle ? <p className="text-[13px] text-ink-2 max-w-[80ch]">{subtitle}</p> : null}
        {figures ? <CopyFigures copy={copy} /> : null}
        <div><CopyChart copy={copy} /></div>
      </div>
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
