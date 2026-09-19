import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtEur } from '../lib/format'
import { axisProps, chartTooltipProps, gridProps, moneyAxisProps } from '../lib/charts'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'
import { CATEGORY_LABELS } from '../lib/categories'

export default function SpendingCategoryChart({ categories, isLoading, error }) {
  const data = (categories ?? []).map((c) => ({
    category: CATEGORY_LABELS[c.category] ?? c.category,
    amount: Number(c.amount),
  }))
  const placeholder = chartPlaceholderFor({ isLoading, error, data, minPoints: 1, height: 260 })

  return (
    <Card>
      <CardHeader title="Spending by category" subtitle="This period" />
      <div className="mt-4 h-[var(--chart-h-md)]">
        {placeholder ?? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid {...gridProps} />
              <XAxis {...moneyAxisProps} type="number" />
              <YAxis {...axisProps} dataKey="category" type="category" width={100} />
              <Tooltip {...chartTooltipProps} formatter={(v) => fmtEur(v)} />
              <Bar dataKey="amount" fill="#3b82f6" radius={[0, 3, 3, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
