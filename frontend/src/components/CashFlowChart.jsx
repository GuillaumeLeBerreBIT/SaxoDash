import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useCashFlow } from '../api/queries'
import { fmtEur } from '../lib/format'
import { chartTooltipProps } from '../lib/charts'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'

export default function CashFlowChart() {
  const { data, isLoading, error } = useCashFlow()

  // Bars render fine from a single month, so one point is enough here.
  const placeholder = chartPlaceholderFor({ isLoading, error, data, minPoints: 1, height: 220 })

  return (
    <Card>
      <CardHeader title="Monthly cash flow" subtitle="Deposits & dividends vs. fees" />
      <div className="mt-4 h-[220px]">
        {placeholder ?? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: '#71717a', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
              tickFormatter={(v) => fmtEur(v, { decimals: 0 })}
            />
            <Tooltip {...chartTooltipProps} formatter={(v, n) => [fmtEur(v), n]} />
            <Bar dataKey="inflow" name="Inflow" fill="#34d399" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="outflow" name="Outflow" fill="#f87171" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
