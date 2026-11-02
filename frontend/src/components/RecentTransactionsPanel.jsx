import { fmtDate, fmtEur } from '../lib/format'
import { colorForCategory } from '../lib/charts'
import { CATEGORY_LABELS } from '../lib/categories'
import { useChartColors } from '../theme/useChartColors'
import { Card, EmptyState } from './ui'

export default function RecentTransactionsPanel({ transactions, className = '' }) {
  const c = useChartColors()
  return (
    <Card className={className} context="Across all accounts" dot={transactions.length ? 'ok' : 'off'} title="Recent transactions">
      {transactions.length === 0 && <EmptyState title="No transactions yet." />}
      <ul>
        {transactions.map((tx) => {
          const isCredit = Number(tx.amount) > 0
          const label = tx.counterparty_name || CATEGORY_LABELS[tx.effective_category] || tx.effective_category
          return (
            <li key={tx.id} className="flex items-center gap-3 min-h-11 py-1.5 border-t border-line first:border-t-0">
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: colorForCategory(tx.effective_category, c) }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-ink truncate">{label}</div>
                <div className="text-[12px] text-ink-3 mt-0.5 truncate">
                  {fmtDate(tx.booking_date)} · {CATEGORY_LABELS[tx.effective_category] ?? tx.effective_category} · {tx.bank_name}
                </div>
              </div>
              <div className={`text-[13.5px] font-semibold num shrink-0 ${isCredit ? 'text-up' : 'text-ink'}`}>
                {fmtEur(tx.amount, { sign: true })}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
