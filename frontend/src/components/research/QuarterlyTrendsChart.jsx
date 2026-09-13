import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { axisProps, chartTooltipProps, gridProps } from '../../lib/charts'
import { fmtPct } from '../../lib/format'
import { Card, CardHeader } from '../ui'

const SERIES = [
  { key: 'gross_margin', name: 'Gross margin', color: '#60a5fa' },
  { key: 'operating_margin', name: 'Operating margin', color: '#34d399' },
  { key: 'net_margin', name: 'Net margin', color: '#f59e0b' },
]

/** Margin trend across the same quarters EarningsInsights already narrates in
 *  text (`quarterly_trends`, oldest-first). A margin missing at one period
 *  breaks its own line rather than being guessed. */
export default function QuarterlyTrendsChart({ trends }) {
  if (!trends?.length) return null

  return (
    <Card>
      <CardHeader title="Margin trend" subtitle="Gross, operating and net margin by quarter" />
      <div className="mt-4 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trends} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="period" />
            <YAxis {...axisProps} width={44} tickFormatter={(v) => fmtPct(v, { sign: false, decimals: 0 })} />
            <Tooltip
              {...chartTooltipProps}
              formatter={(value, name) => [fmtPct(value, { sign: false, decimals: 1 }), name]}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10.5px] text-zinc-500">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
    </Card>
  )
}
