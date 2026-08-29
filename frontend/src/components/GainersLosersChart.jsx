import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { fmtPct } from '../lib/format'
import { chartTooltipProps } from '../lib/charts'
import { toGainersLosersData } from '../lib/performance'
import { Card, CardHeader, ChartPlaceholder } from './ui'

export default function GainersLosersChart({ positions }) {
  const data = toGainersLosersData(positions)

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader title="Gainers & losers" subtitle="Unrealised P&L % per holding" />
        <ChartPlaceholder height={260}>No holdings to compare yet</ChartPlaceholder>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Gainers & losers" subtitle="Unrealised P&L % per holding" />
      <div className="mt-4 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="ticker"
              tick={{ fill: '#a1a1aa', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip {...chartTooltipProps} formatter={(v) => [fmtPct(v), 'P&L']} />
            <Bar dataKey="pnlPct" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.ticker} fill={d.pnlPct >= 0 ? '#34d399' : '#f87171'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
