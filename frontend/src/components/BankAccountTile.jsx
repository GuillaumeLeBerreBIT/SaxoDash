import { Link } from 'react-router-dom'
import { fmtEur } from '../lib/format'
import { CATEGORY_LABELS } from '../lib/categories'

export default function BankAccountTile({ account, recentTransactions }) {
  const hasAvailable = Number(account.available) !== Number(account.balance)

  return (
    <Link
      to={`/accounts/${account.id}`}
      className={`block rounded-2xl p-5 text-white relative overflow-hidden bg-gradient-to-br ${account.gradient} shadow-lg shadow-black/30 hover:brightness-110 transition-[filter]`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[var(--fig-2xs)] uppercase tracking-wider font-semibold opacity-75">{account.type}</div>
          <div className="mt-0.5 text-[var(--fig-md)] font-semibold">{account.bank}</div>
          <div className="mt-0.5 text-[var(--fig-xs)] opacity-70 num font-mono">{account.iban_masked}</div>
        </div>
        <div className="w-7 h-5 rounded-[5px] bg-gradient-to-br from-white/60 to-white/15" />
      </div>

      <div className="mt-4 text-[var(--fig-2xl)] font-semibold tracking-tight num font-mono">
        {fmtEur(account.balance)}
      </div>
      {hasAvailable && (
        <div className="mt-0.5 text-[var(--fig-xs)] opacity-75 num font-mono">
          {fmtEur(account.available)} available
        </div>
      )}

      {recentTransactions.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/20 flex flex-col gap-1.5">
          {recentTransactions.map((tx) => (
            <div key={tx.id} className="flex justify-between text-[var(--fig-xs)] opacity-90">
              <span className="truncate pr-2">
                {tx.counterparty_name || CATEGORY_LABELS[tx.effective_category] || tx.effective_category}
              </span>
              <span className="num font-mono shrink-0">{fmtEur(tx.amount, { sign: true })}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  )
}
