import { useState } from 'react'
import { useBudgetProgress, useSetBudget } from '../api/queries'
import { BUDGETABLE_CATEGORIES, CATEGORY_LABELS } from '../lib/categories'
import { Button, Card, Input, Select } from './ui'
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
    <div className="flex flex-wrap items-center gap-2 pt-3">
      <Select aria-label="Budget category" value={category} onChange={(e) => setSelected(e.target.value)} className="h-8">
        {options.map((c) => (
          <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
        ))}
      </Select>
      <Input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="Monthly limit"
        placeholder="Monthly limit"
        className="w-32 h-8 text-right num"
      />
      <Button size="sm" onClick={submit}>Add a budget</Button>
    </div>
  )
}

export default function BudgetSection({ className = '' }) {
  const { data: progress } = useBudgetProgress()
  const rows = progress ?? []
  const budgeted = new Set(rows.map((r) => r.category))
  const unbudgeted = BUDGETABLE_CATEGORIES.filter((c) => !budgeted.has(c))

  return (
    <Card className={className} context="Monthly limit per category · this month" dot={rows.length ? 'ok' : 'off'} title="Budgets">
      <div>
        {rows.map((row) => (
          <BudgetProgressBar key={row.category} category={row.category} spent={row.spent} limit={row.limit} />
        ))}
        {rows.length === 0 && (
          <div className="text-ink-3 text-[13.5px] py-2">No budgets set yet.</div>
        )}
      </div>
      <AddBudgetControl options={unbudgeted} />
    </Card>
  )
}
