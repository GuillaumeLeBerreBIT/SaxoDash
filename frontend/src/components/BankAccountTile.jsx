import { Link } from 'react-router-dom'
import { fmtEur } from '../lib/format'

export default function BankAccountTile({ account }) {
  const hasAvailable = Number(account.available) !== Number(account.balance)

  return (
    <Link
      to={`/money/accounts/${account.id}`}
      className="flex gap-3 bg-tile rounded-[10px] px-3.5 py-3 min-w-0 hover:bg-hover transition-colors"
    >
      <span className="w-1 rounded-full shrink-0" style={{ background: account.accent }} />
      <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-ink-3">{account.type}</div>
          <div className="mt-0.5 text-[14px] font-semibold text-ink truncate">{account.bank}</div>
          <div className="mt-0.5 text-[12px] text-ink-3 num">{account.iban_masked}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[20px] font-bold tracking-[-0.01em] num text-ink">{fmtEur(account.balance)}</div>
          {hasAvailable && <div className="mt-0.5 text-[12px] text-ink-2 num">{fmtEur(account.available)} available</div>}
        </div>
      </div>
    </Link>
  )
}
