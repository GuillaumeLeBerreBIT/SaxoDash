import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useSpendingTrend } from '../api/queries'
import { axisProps, chartTooltipProps, gridProps, moneyAxisProps, NEGATIVE } from '../lib/charts'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'
import { trendBars, trendTooltipLabel, trendTooltipRow } from '../lib/spending'

export default function SpendingTrendChart() {
  const { data, isLoading, error, refetch } = useSpendingTrend()

  const bars = trendBars(data)
  const placeholder = chartPlaceholderFor({ isLoading, error, data, minPoints: 1, height: 220, onRetry: refetch })
  const subtitle = bars.at(-1)?.current
    ? 'Monthly total, last 6 months · current month to date'
    : 'Monthly total, last 6 months'

  return (
    <Card>
      <CardHeader title="Spending over time" subtitle={subtitle} />
      <div className="mt-4 h-[var(--chart-h-md)]">
        {placeholder ?? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars}>
              <CartesianGrid {...gridProps} />
              <XAxis {...axisProps} dataKey="label" />
              <YAxis {...moneyAxisProps} />
              <Tooltip
                {...chartTooltipProps}
                filterNull={false}
                formatter={trendTooltipRow}
                labelFormatter={(label, payload) => trendTooltipLabel(label, payload?.[0]?.payload)}
              />
              <Bar dataKey="total" name="Spending" fill={NEGATIVE} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {bars.map((bar) => (
                  <Cell key={bar.month} fillOpacity={bar.partial ? 0.45 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
