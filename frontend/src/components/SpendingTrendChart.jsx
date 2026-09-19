import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useSpendingTrend } from '../api/queries'
import { fmtEur } from '../lib/format'
import { axisProps, chartTooltipProps, gridProps, moneyAxisProps } from '../lib/charts'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'

export default function SpendingTrendChart() {
  const { data, isLoading, error } = useSpendingTrend()

  const placeholder = chartPlaceholderFor({ isLoading, error, data, minPoints: 1, height: 220 })

  return (
    <Card>
      <CardHeader title="Spending over time" subtitle="Monthly total, last 6 months" />
      <div className="mt-4 h-[var(--chart-h-md)]">
        {placeholder ?? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid {...gridProps} />
              <XAxis {...axisProps} dataKey="month" />
              <YAxis {...moneyAxisProps} />
              <Tooltip {...chartTooltipProps} formatter={(v) => fmtEur(v)} />
              <Bar dataKey="total" name="Spending" fill="#f87171" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
