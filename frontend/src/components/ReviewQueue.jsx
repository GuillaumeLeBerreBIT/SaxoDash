import { useBankTransactions, useMarkTransactionReviewed, useUpdateBankTransactionCategory } from '../api/queries'
import { CATEGORY_LABELS } from '../lib/categories'
import { fmtDate, fmtEur } from '../lib/format'
import { Button, Card, Select } from './ui'

const VISIBLE_ROWS = 10

function ReviewRow({ tx, onCategory, onKeep }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 min-h-11 py-1.5 border-t border-line first:border-t-0">
      <div className="min-w-0">
        <div className="text-ink text-[13.5px] font-semibold truncate">{tx.counterparty_name}</div>
        <div className="text-ink-3 text-[12px] num">{fmtDate(tx.booking_date)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-ink text-[13.5px] font-semibold num">{fmtEur(tx.amount)}</div>
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

export default function ReviewQueue({ className = '' }) {
  const { data: queue } = useBankTransactions('?needs_review=true')
  const setCategory = useUpdateBankTransactionCategory()
  const markReviewed = useMarkTransactionReviewed()

  const rows = queue ?? []
  if (rows.length === 0) return null

  const hidden = rows.length - VISIBLE_ROWS

  return (
    <Card className={className} context="No rule matched these" dot="warn" title={`Needs review (${rows.length})`}>
      <ul>
        {rows.slice(0, VISIBLE_ROWS).map((tx) => (
          <ReviewRow key={tx.id} tx={tx} onCategory={setCategory.mutate} onKeep={markReviewed.mutate} />
        ))}
      </ul>
      {hidden > 0 && <p className="mt-2 text-ink-3 text-[12px]">{hidden} more after these</p>}
      <p className="mt-2 text-ink-3 text-[12px]">Pick a category, or confirm they are Other.</p>
    </Card>
  )
}
