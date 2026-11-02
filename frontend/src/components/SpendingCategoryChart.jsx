import { fmtEur } from '../lib/format'
import { colorForCategory } from '../lib/charts'
import { Card } from './ui'
import { useChartColors } from '../theme/useChartColors'
import { chartPlaceholderFor } from '../lib/chartState'
import { foldSmallSlices, spendingTransactionsPath } from '../lib/spending'
import { CATEGORY_LABELS } from '../lib/categories'
import AllocationDonut from './AllocationDonut'

export default function SpendingCategoryChart({ categories, isLoading, error, periodLabel, period, onRetry, className = '' }) {
  const c = useChartColors()
  const folded = foldSmallSlices(
    (categories ?? [])
      .map((row) => ({
        name: CATEGORY_LABELS[row.category] ?? row.category,
        category: row.category,
        value: Number(row.amount),
        color: colorForCategory(row.category, c),
        to: period ? spendingTransactionsPath(row.category, period) : undefined,
      }))
      .sort((a, b) => b.value - a.value),
    { otherName: 'Smaller categories', otherColor: c.flat },
  )
  const items = period
    ? folded.map((item) =>
        item.folded
          ? { ...item, to: spendingTransactionsPath(item.categories.length === 1 ? item.categories[0] : null, period) }
          : item,
      )
    : folded

  const placeholder = chartPlaceholderFor({ isLoading, error, data: items, minPoints: 1, height: 260, onRetry })

  return (
    <Card className={className} context={periodLabel} dot={error ? 'warn' : items.length ? 'ok' : 'off'} title="Spending by category">
      <div>
        {placeholder ?? <AllocationDonut items={items} formatValue={fmtEur} height="280px" />}
      </div>
    </Card>
  )
}
