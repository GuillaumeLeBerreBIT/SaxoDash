import { useState } from 'react'
import { fmtEur } from '../lib/format'
import { CATEGORY_LABELS } from '../lib/categories'
import { useSetBudget } from '../api/queries'

function barColor(pct) {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export default function BudgetProgressBar({ category, spent, limit }) {
  const [draft, setDraft] = useState(limit != null ? String(limit) : '')
  const setBudget = useSetBudget()

  const hasBudget = limit != null
  const pct = hasBudget ? (Number(spent) / Number(limit)) * 100 : 0

  return (
    <div className="py-2 border-b border-zinc-800/60 last:border-0">
      <div className="flex items-center justify-between text-[var(--fig-sm)]">
        <span className="text-zinc-100">{CATEGORY_LABELS[category] ?? category}</span>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 num font-mono">
            {fmtEur(spent)}{hasBudget ? ` / ${fmtEur(limit)}` : ''}
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const parsed = Number(draft)
              if (draft !== '' && parsed > 0) setBudget.mutate({ category, monthlyLimit: parsed })
            }}
            placeholder="Set limit"
            className="w-20 h-7 px-2 bg-zinc-950 border border-zinc-800 rounded text-[var(--fig-xs)] text-zinc-100 text-right"
          />
        </div>
      </div>
      {hasBudget && (
        <div className="mt-1.5 h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full ${barColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
    </div>
  )
}
