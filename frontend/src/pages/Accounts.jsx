import { useBankAccounts, useBankTransactions, useSpendingSummary } from '../api/queries'
import { fmtEur, fmtPct } from '../lib/format'
import { resolvePeriod } from '../lib/periods'
import { PageHeader, StatStrip, StatRow } from '../components/ui'
import HistoryAreaChart from '../components/HistoryAreaChart'
import EnableBankingConnectionStatus from '../components/EnableBankingConnectionStatus'
import BankAccountTile from '../components/BankAccountTile'
import RecentTransactionsPanel from '../components/RecentTransactionsPanel'
import { SERIES_BANK } from '../lib/charts'

const SAXO_CASH_EXTERNAL_ID = 'saxo:cash'

export default function Accounts() {
  // Computed per render, not module scope - this must not freeze at
  // whichever date the JS bundle happened to first load.
  const period = resolvePeriod('this_month')
  const { data: allAccounts, isLoading, error } = useBankAccounts()
  const { data: allTransactions } = useBankTransactions()
  const { data: summary } = useSpendingSummary(`?date_from=${period.date_from}&date_to=${period.date_to}`)

  if (error) return <div className="text-red-400 text-sm">Failed to load accounts</div>
  if (isLoading || !allAccounts) return <div className="text-zinc-500 text-sm">Loading…</div>

  const accounts = allAccounts.filter((a) => a.external_id !== SAXO_CASH_EXTERNAL_ID)
  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0)
  const bankNameById = new Map(accounts.map((a) => [a.id, a.bank]))
  const transactions = allTransactions ?? []

  const spendTotal = Number(summary?.total ?? 0)
  const prevTotal = summary?.previous_period ? Number(summary.previous_period.total) : null
  const deltaPct = prevTotal ? ((spendTotal - prevTotal) / prevTotal) * 100 : null

  const recentAcrossAll = transactions
    .slice(0, 5)
    .map((tx) => ({ ...tx, bank_name: bankNameById.get(tx.bank_account) ?? '' }))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts"
        subtitle="Your connected bank accounts"
        right={<EnableBankingConnectionStatus />}
      />

      <StatStrip>
        <StatRow label="Total balance" value={fmtEur(total)} note={`${accounts.length} accounts`} lead />
        <StatRow
          label="This month's spending"
          value={fmtEur(spendTotal)}
          badge={deltaPct != null ? `${deltaPct >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(deltaPct), { sign: false })}` : undefined}
          badgeTone={deltaPct == null ? 'zinc' : deltaPct >= 0 ? 'red' : 'emerald'}
          note={prevTotal != null ? `vs ${fmtEur(prevTotal)} last month` : undefined}
        />
        <StatRow label="Transfers this month" value={fmtEur(summary?.transfers ?? 0)} note="Between your own accounts" />
      </StatStrip>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3.5">
          {accounts.map((a) => (
            <BankAccountTile key={a.id} account={a} />
          ))}
        </div>
        <RecentTransactionsPanel transactions={recentAcrossAll} />
      </div>

      <HistoryAreaChart
        title="Bank balance"
        subtitle="Total across accounts over time"
        dataKey="bank_total"
        name="Bank"
        color={SERIES_BANK}
      />
    </div>
  )
}
