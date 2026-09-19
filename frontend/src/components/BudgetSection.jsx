import { useBudgetProgress } from '../api/queries'
import { Card, CardHeader } from './ui'
import BudgetProgressBar from './BudgetProgressBar'

export default function BudgetSection({ categories }) {
  const { data: progress } = useBudgetProgress()

  const byCategory = new Map((progress ?? []).map((row) => [row.category, row]))
  for (const c of categories ?? []) {
    if (!byCategory.has(c.category)) {
      byCategory.set(c.category, { category: c.category, spent: c.amount, limit: null })
    }
  }
  const rows = [...byCategory.values()]

  if (rows.length === 0) return null

  return (
    <Card>
      <CardHeader title="Budgets" subtitle="Monthly limit per category" />
      <div className="mt-2">
        {rows.map((row) => (
          <BudgetProgressBar key={row.category} category={row.category} spent={row.spent} limit={row.limit} />
        ))}
      </div>
    </Card>
  )
}
