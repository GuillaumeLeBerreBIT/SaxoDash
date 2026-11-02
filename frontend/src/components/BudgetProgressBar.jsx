import { useState } from 'react'
import { fmtEur } from '../lib/format'
import { CATEGORY_LABELS } from '../lib/categories'
import { useSetBudget } from '../api/queries'
import { Input } from './ui'

function barTone(pct) {
  if (pct >= 100) return 'bg-down'
  if (pct >= 80) return 'bg-warn'
  return 'bg-up'
}

export default function BudgetProgressBar({ category, spent, limit }) {
  const [draft, setDraft] = useState(limit != null ? String(limit) : '')
  const setBudget = useSetBudget()

  const hasBudget = limit != null
  const pct = hasBudget ? (Number(spent) / Number(limit)) * 100 : 0

  return (
    <div className="py-2.5 border-t border-line first:border-t-0">
      <div className="flex flex-col items-start gap-1 text-[13.5px] md:flex-row md:items-center md:justify-between md:gap-0">
        <span className="font-semibold text-ink">{CATEGORY_LABELS[category] ?? category}</span>
        <div className="flex w-full items-center justify-between gap-2 md:w-auto md:justify-start">
          <span className="text-ink-2 num">
            {fmtEur(spent)}{hasBudget ? ` / ${fmtEur(limit)}` : ''}
          </span>
          <Input
            aria-label={`Monthly limit for ${CATEGORY_LABELS[category] ?? category}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const parsed = Number(draft)
              if (draft !== '' && parsed > 0) setBudget.mutate({ category, monthlyLimit: parsed })
            }}
            placeholder="Set limit"
            className="w-24 h-7 text-right num"
          />
        </div>
      </div>
      {hasBudget && (
        <div className="mt-1.5 h-1.5 w-full bg-track rounded-full overflow-hidden">
          <div className={`h-full ${barTone(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
    </div>
  )
}
