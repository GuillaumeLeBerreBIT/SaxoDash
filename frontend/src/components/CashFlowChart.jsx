import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useCashFlow } from '../api/queries'
import { fmtEur } from '../lib/format'
import { axisProps, chartTooltipProps, gridProps, moneyAxisProps } from '../lib/charts'
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
            <CartesianGrid {...gridProps} />
            <XAxis {...axisProps} dataKey="month" />
            <YAxis {...moneyAxisProps} />
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
