import { fmtEur } from '../lib/format'
import { colorForCategory } from '../lib/charts'
import { Card, CardHeader } from './ui'
import { chartPlaceholderFor } from '../lib/chartState'
import { CATEGORY_LABELS } from '../lib/categories'
import AllocationDonut from './AllocationDonut'

export default function SpendingCategoryChart({ categories, isLoading, error, periodLabel }) {
  const items = (categories ?? [])
    .map((c) => ({
      name: CATEGORY_LABELS[c.category] ?? c.category,
      value: Number(c.amount),
      color: colorForCategory(c.category),
    }))
    .sort((a, b) => b.value - a.value)

  const placeholder = chartPlaceholderFor({ isLoading, error, data: items, minPoints: 1, height: 260 })

  return (
    <Card>
      <CardHeader title="Spending by category" subtitle={periodLabel} />
      <div className="mt-2">
        {placeholder ?? <AllocationDonut items={items} formatValue={fmtEur} height="280px" />}
      </div>
    </Card>
  )
}
