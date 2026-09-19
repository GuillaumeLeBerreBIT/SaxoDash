import { fmtEur } from '../lib/format'
import { colorForCategory } from '../lib/charts'
import { CATEGORY_LABELS } from '../lib/categories'
import { Card, CardHeader } from './ui'

export default function RecentTransactionsPanel({ transactions }) {
  return (
    <Card padding={false}>
      <div className="p-4 pb-2">
        <CardHeader title="Recent transactions" subtitle="Across all accounts" />
      </div>
      <div className="px-2 pb-2">
        {transactions.length === 0 && (
          <div className="text-center text-zinc-500 text-[var(--fig-sm)] py-8">No transactions yet.</div>
        )}
        {transactions.map((tx) => {
          const isCredit = Number(tx.amount) > 0
          const label = tx.counterparty_name || CATEGORY_LABELS[tx.effective_category] || tx.effective_category
          return (
            <div key={tx.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-zinc-800/30">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: colorForCategory(tx.effective_category) }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[var(--fig-sm)] font-medium text-zinc-100 truncate">{label}</div>
                <div className="text-[var(--fig-2xs)] text-zinc-500 mt-0.5">
                  {tx.booking_date} · {CATEGORY_LABELS[tx.effective_category] ?? tx.effective_category} · {tx.bank_name}
                </div>
              </div>
              <div className={`text-[var(--fig-sm)] font-medium num font-mono shrink-0 ${isCredit ? 'text-emerald-400' : 'text-zinc-100'}`}>
                {fmtEur(tx.amount, { sign: true })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
