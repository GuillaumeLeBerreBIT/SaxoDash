import { fmtEur } from '../lib/format'
import { colorForCategory } from '../lib/charts'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'
import { foldSmallSlices, spendingTransactionsPath } from '../lib/spending'
import { CATEGORY_LABELS } from '../lib/categories'
import AllocationDonut from './AllocationDonut'

export default function SpendingCategoryChart({ categories, isLoading, error, periodLabel, period, onRetry }) {
  const items = foldSmallSlices(
    (categories ?? [])
      .map((c) => ({
        name: CATEGORY_LABELS[c.category] ?? c.category,
        value: Number(c.amount),
        color: colorForCategory(c.category),
        to: period ? spendingTransactionsPath(c.category, period) : undefined,
      }))
      .sort((a, b) => b.value - a.value),
  )

  const placeholder = chartPlaceholderFor({ isLoading, error, data: items, minPoints: 1, height: 260, onRetry })

  return (
    <Card>
      <CardHeader title="Spending by category" subtitle={periodLabel} />
      <div className="mt-2">
        {placeholder ?? <AllocationDonut items={items} formatValue={fmtEur} height="280px" />}
      </div>
    </Card>
  )
}
