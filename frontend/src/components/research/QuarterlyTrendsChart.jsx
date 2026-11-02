import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'
import { fmtAxisPct } from '../../lib/axisFormat'
import { fmtPct } from '../../lib/format'
import { Card } from '../ui'

const SERIES = [
  { key: 'gross_margin', name: 'Gross margin', slot: 0 },
  { key: 'operating_margin', name: 'Operating margin', slot: 3 },
  { key: 'net_margin', name: 'Net margin', slot: 2 },
]

/** Margin trend across the same quarters EarningsInsights already narrates in
 *  text (`quarterly_trends`, oldest-first). A margin missing at one period
 *  breaks its own line rather than being guessed. */
export default function QuarterlyTrendsChart({ trends, className = '' }) {
  const c = useChartColors()
  if (!trends?.length) return null

  return (
    <Card className={className} context="Gross, operating and net margin by quarter" dot="ok" title="Margin trend">
      <div className="h-[var(--chart-h-sm)]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trends} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps(c)} />
            <XAxis {...axisProps(c)} dataKey="period" />
            <YAxis
              {...axisProps(c)}
              width={44}
              allowDecimals={false}
              domain={[(min) => Math.floor(min), (max) => Math.ceil(max)]}
              tickFormatter={fmtAxisPct}
            />
            <Tooltip
              {...chartTooltipProps(c)}
              formatter={(value, name) => [fmtPct(value, { sign: false, decimals: 1 }), name]}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={c.series[s.slot]}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: c.series[s.slot] }} /> {s.name}
          </span>
        ))}
      </div>
    </Card>
  )
}
