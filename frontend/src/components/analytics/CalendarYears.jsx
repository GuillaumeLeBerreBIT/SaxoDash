import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Card, CardHeader } from '../ui'
import { chartTooltipProps, gridProps, axisProps } from '../../lib/charts'
import { fmtPct } from '../../lib/format'

const SERIES_LABEL = { portfolio_pct: 'Portfolio', benchmark_pct: 'benchmark' }

export default function CalendarYears({ years, benchmarkName }) {
  return (
    <Card>
      <CardHeader
        title="Calendar-year returns"
        subtitle="A year appears once it has at least two data points"
        right={
          <div className="flex items-center gap-3 text-[10.5px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" /> You</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-zinc-600" /> {benchmarkName}</span>
          </div>
        }
      />
      <div className="mt-4 h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={years} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="year" />
            <YAxis {...axisProps} width={54} tickFormatter={(v) => `${v}%`} />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" />
            <Tooltip
              {...chartTooltipProps}
              formatter={(v, key) => [fmtPct(v, { decimals: 1 }), key === 'portfolio_pct' ? 'Portfolio' : benchmarkName]}
            />
            <Bar dataKey="portfolio_pct" name={SERIES_LABEL.portfolio_pct} fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={22} />
            <Bar dataKey="benchmark_pct" name={SERIES_LABEL.benchmark_pct} fill="#52525b" radius={[3, 3, 0, 0]} barSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
