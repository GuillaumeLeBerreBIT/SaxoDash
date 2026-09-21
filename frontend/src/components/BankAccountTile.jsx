import { Link } from 'react-router-dom'
import { fmtEur } from '../lib/format'
import { Card } from './ui'

/** Identity + balance for one connected account - flat Card language, the
 *  same as every other surface in the app. This used to be a skeuomorphic
 *  gradient credit-card widget (rounded-2xl, a fake card-chip rectangle,
 *  per-bank full-bleed color) - the only rounded-2xl element anywhere in
 *  the codebase, and the single biggest reason Accounts read as a bolted-on
 *  separate product. Bank identity is now a thin accent bar from the same
 *  per-bank `account.accent` color the tile used to paint its whole
 *  background with, not a full-bleed treatment.
 *
 *  Recent transactions used to also render inline here (2 per tile) as well
 *  as in RecentTransactionsPanel below - the same activity shown twice on
 *  one page. This is balance/identity only now; the panel is the one place
 *  recent activity is shown. */
export default function BankAccountTile({ account }) {
  const hasAvailable = Number(account.available) !== Number(account.balance)

  return (
    <Link to={`/accounts/${account.id}`} className="block">
      <Card interactive className="flex gap-3">
        <span className="w-1 rounded-full shrink-0" style={{ background: account.accent }} />
        <div className="flex-1 min-w-0 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[var(--fig-2xs)] uppercase tracking-wider font-medium text-zinc-500">{account.type}</div>
            <div className="mt-0.5 text-[var(--fig-md)] font-semibold text-zinc-50">{account.bank}</div>
            <div className="mt-0.5 text-[var(--fig-xs)] text-zinc-500 num font-mono">{account.iban_masked}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[var(--fig-lg)] font-semibold tracking-tight num font-mono text-zinc-50">
              {fmtEur(account.balance)}
            </div>
            {hasAvailable && (
              <div className="mt-0.5 text-[var(--fig-xs)] text-zinc-500 num font-mono">
                {fmtEur(account.available)} available
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}
