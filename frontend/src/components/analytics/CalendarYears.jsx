import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Card, EmptyState } from '../ui'
import { chartTooltipProps, gridProps, axisProps, seriesAxis } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'
import { fmtPct } from '../../lib/format'

const SERIES_LABEL = { portfolio_pct: 'Portfolio', benchmark_pct: 'benchmark' }
const CONTEXT = 'A year appears once it has at least two data points'

function Swatch({ color, children }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className="w-2.5 h-2.5 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  )
}

export default function CalendarYears({ years, benchmarkName, className = '' }) {
  const c = useChartColors()
  const partialYears = new Set(years.filter((y) => y.partial).map((y) => y.year))
  if (years.length === 0) {
    return (
      <Card className={className} context={CONTEXT} dot="off" title="Calendar-year returns">
        <EmptyState title="No full calendar year yet" hint="A year appears once it has at least two data points." />
      </Card>
    )
  }
  return (
    <Card
      className={className}
      context={`${CONTEXT}${partialYears.size ? ' · * year to date' : ''}`}
      dot="ok"
      title="Calendar-year returns"
      right={
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-2">
          <Swatch color={c.primary}>You</Swatch>
          <Swatch color={c.bench}>{benchmarkName}</Swatch>
        </div>
      }
    >
      <div className="h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={years} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid {...gridProps(c)} />
            <XAxis {...axisProps(c)} dataKey="year" tickFormatter={(year) => (partialYears.has(year) ? `${year}*` : `${year}`)} />
            <YAxis {...axisProps(c)} width={54} {...seriesAxis(years, ['portfolio_pct', 'benchmark_pct'], { includeZero: true })} tickFormatter={(v) => `${v}%`} />
            <ReferenceLine y={0} stroke={c.axis} />
            <Tooltip
              {...chartTooltipProps(c)}
              formatter={(v, key) => [fmtPct(v, { decimals: 1 }), key === 'portfolio_pct' ? 'Portfolio' : benchmarkName]}
            />
            <Bar dataKey="portfolio_pct" name={SERIES_LABEL.portfolio_pct} fill={c.primary} radius={[3, 3, 0, 0]} barSize={22} />
            <Bar dataKey="benchmark_pct" name={SERIES_LABEL.benchmark_pct} fill={c.bench} radius={[3, 3, 0, 0]} barSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
