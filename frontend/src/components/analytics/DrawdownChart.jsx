import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardHeader } from '../ui'
import { chartTooltipProps, dateAxisProps, gridProps, formatAxisDate, axisProps } from '../../lib/charts'
import { fmtPct } from '../../lib/format'

/** Decline from the running peak of the portfolio's own value - no benchmark. */
export default function DrawdownChart({ series, maxDrawdown }) {
  return (
    <Card>
      <CardHeader
        title="Drawdown"
        subtitle="Decline from the running peak"
        right={maxDrawdown != null && <span className="text-[11px] num text-red-400">Max {fmtPct(maxDrawdown, { sign: false, decimals: 1 })}</span>}
      />
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e5484d" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#e5484d" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis {...dateAxisProps} />
            <YAxis {...axisProps} width={54} tickFormatter={(v) => `${v}%`} />
            <Tooltip
              {...chartTooltipProps}
              labelFormatter={formatAxisDate}
              formatter={(v) => [fmtPct(v, { decimals: 1 }), 'Drawdown']}
            />
            <Area
              type="monotone"
              dataKey="dd"
              stroke="#e5484d"
              strokeWidth={1.3}
              fill="url(#ddFill)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
