import { useState } from 'react'
import { useBudgetProgress, useSetBudget } from '../api/queries'
import { BUDGETABLE_CATEGORIES, CATEGORY_LABELS } from '../lib/categories'
import { Card, CardHeader } from './ui'
import BudgetProgressBar from './BudgetProgressBar'

function AddBudgetControl({ options }) {
  const [selected, setSelected] = useState(options[0] ?? '')
  const [amount, setAmount] = useState('')
  const setBudget = useSetBudget()
  const category = options.includes(selected) ? selected : (options[0] ?? '')

  if (options.length === 0) return null

  const submit = () => {
    const parsed = Number(amount)
    if (category && amount !== '' && parsed > 0) {
      setBudget.mutate({ category, monthlyLimit: parsed })
      setAmount('')
    }
  }

  return (
    <div className="flex items-center gap-2 pt-2">
      <select
        value={category}
        onChange={(e) => setSelected(e.target.value)}
        className="h-8 px-2 bg-zinc-950 border border-zinc-800 rounded text-[var(--fig-xs)] text-zinc-200"
      >
        {options.map((c) => (
          <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
        ))}
      </select>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Monthly limit"
        className="w-28 h-8 px-2 bg-zinc-950 border border-zinc-800 rounded text-[var(--fig-xs)] text-zinc-100 text-right"
      />
      <button
        onClick={submit}
        className="h-8 px-3 bg-zinc-800 hover:bg-zinc-700 rounded text-[var(--fig-xs)] text-zinc-200 font-medium"
      >
        Add a budget
      </button>
    </div>
  )
}

export default function BudgetSection() {
  const { data: progress } = useBudgetProgress()
  const rows = progress ?? []
  const budgeted = new Set(rows.map((r) => r.category))
  const unbudgeted = BUDGETABLE_CATEGORIES.filter((c) => !budgeted.has(c))

  return (
    <Card>
      <CardHeader title="Budgets" subtitle="Monthly limit per category — this month" />
      <div className="mt-2">
        {rows.map((row) => (
          <BudgetProgressBar key={row.category} category={row.category} spent={row.spent} limit={row.limit} />
        ))}
        {rows.length === 0 && (
          <div className="text-zinc-500 text-[var(--fig-sm)] py-2">No budgets set yet.</div>
        )}
      </div>
      <AddBudgetControl options={unbudgeted} />
    </Card>
  )
}
