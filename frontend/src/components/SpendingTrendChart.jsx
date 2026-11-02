import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useSpendingTrend } from '../api/queries'
import { axisProps, chartTooltipProps, gridProps, moneyAxisProps, seriesAxis } from '../lib/charts'
import { useChartColors } from '../theme/useChartColors'
import { Card } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'
import { trendBars, trendTooltipLabel, trendTooltipRow } from '../lib/spending'

export default function SpendingTrendChart({ className = '' }) {
  const c = useChartColors()
  const { data, isLoading, error, refetch } = useSpendingTrend()

  const bars = trendBars(data)
  const placeholder = chartPlaceholderFor({ isLoading, error, data, minPoints: 1, height: 220, onRetry: refetch })
  const context = bars.at(-1)?.current
    ? 'Monthly total, last 6 months · current month to date'
    : 'Monthly total, last 6 months'
  const latest = bars.length - 1

  return (
    <Card className={className} context={context} dot={error ? 'warn' : bars.length ? 'ok' : 'off'} title="Spending over time">
      <div className="h-[var(--chart-h-md)]">
        {placeholder ?? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars}>
              <CartesianGrid {...gridProps(c)} />
              <XAxis {...axisProps(c)} dataKey="label" />
              <YAxis {...moneyAxisProps(c)} {...seriesAxis(bars, ['total'], { includeZero: true })} />
              <Tooltip
                {...chartTooltipProps(c)}
                filterNull={false}
                formatter={trendTooltipRow}
                labelFormatter={(label, payload) => trendTooltipLabel(label, payload?.[0]?.payload)}
              />
              <Bar dataKey="total" name="Spending" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false}>
                {bars.map((bar, index) => (
                  <Cell key={bar.month} fill={index === latest ? c.ink : c.axis} fillOpacity={bar.partial ? 0.6 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
