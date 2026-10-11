import { useBankTransactions, useMarkTransactionReviewed, useUpdateBankTransactionCategory } from '../api/queries'
import { CATEGORY_LABELS } from '../lib/categories'
import { fmtDate, fmtEur } from '../lib/format'
import { Button, Card, CardHeader, Select } from './ui'

const VISIBLE_ROWS = 10

function ReviewRow({ tx, onCategory, onKeep }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-zinc-800/60 last:border-0">
      <div className="min-w-0">
        <div className="text-zinc-100 text-[var(--fig-sm)] font-medium truncate">{tx.counterparty_name}</div>
        <div className="text-zinc-500 text-[var(--fig-xs)]">{fmtDate(tx.booking_date)}</div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-zinc-100 num font-mono">{fmtEur(tx.amount)}</div>
        <Select
          aria-label={`Category for ${tx.counterparty_name}`}
          value=""
          onChange={(e) => onCategory({ id: tx.id, category: e.target.value })}
          className="h-8"
        >
          <option value="" disabled>Choose…</option>
          {Object.entries(CATEGORY_LABELS)
            .filter(([code]) => code !== 'OTHER')
            .map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
        </Select>
        <Button size="sm" aria-label={`Keep ${tx.counterparty_name} as Other`} onClick={() => onKeep(tx.id)}>
          Keep as Other
        </Button>
      </div>
    </li>
  )
}

export default function ReviewQueue() {
  const { data: queue } = useBankTransactions('?needs_review=true')
  const setCategory = useUpdateBankTransactionCategory()
  const markReviewed = useMarkTransactionReviewed()

  const rows = queue ?? []
  if (rows.length === 0) return null

  const hidden = rows.length - VISIBLE_ROWS

  return (
    <Card>
      <CardHeader
        title={`Needs review (${rows.length})`}
        subtitle="No rule matched these. Pick a category, or confirm they are Other."
      />
      <ul className="mt-4">
        {rows.slice(0, VISIBLE_ROWS).map((tx) => (
          <ReviewRow key={tx.id} tx={tx} onCategory={setCategory.mutate} onKeep={markReviewed.mutate} />
        ))}
      </ul>
      {hidden > 0 && <div className="mt-2 text-zinc-500 text-[var(--fig-xs)]">{hidden} more after these</div>}
    </Card>
  )
}
