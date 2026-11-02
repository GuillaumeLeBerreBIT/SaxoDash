import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { fmtPct } from '../lib/format'
import { chartTooltipProps, gridProps } from '../lib/charts'
import { useChartColors } from '../theme/useChartColors'
import { toGainersLosersData } from '../lib/performance'
import { Card, ChartPlaceholder } from './ui'

export default function GainersLosersChart({ positions, className = '' }) {
  const c = useChartColors()
  const data = toGainersLosersData(positions)

  if (data.length === 0) {
    return (
      <Card className={className} context="Unrealised P/L % per holding" dot="off" title="Gainers & losers">
        <ChartPlaceholder height={260}>No holdings to compare yet</ChartPlaceholder>
      </Card>
    )
  }

  return (
    <Card className={className} context="Unrealised P/L % per holding" dot="ok" title="Gainers & losers">
      <div className="h-[var(--chart-h-lg)] max-w-2xl mx-auto">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid {...gridProps(c)} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: c.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="ticker"
              tick={{ fill: c.axisCategory, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip {...chartTooltipProps(c)} formatter={(v) => [fmtPct(v), 'P/L']} />
            <Bar dataKey="pnlPct" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.ticker} fill={d.pnlPct >= 0 ? c.up : c.down} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
