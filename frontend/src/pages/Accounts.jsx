import { useBankAccounts } from '../api/queries'
import { fmtEur } from '../lib/format'
import { Card, PageHeader, StatStrip, StatRow } from '../components/ui'
import HistoryAreaChart from '../components/HistoryAreaChart'
import AccountBreakdownChart from '../components/AccountBreakdownChart'
import CashFlowChart from '../components/CashFlowChart'
import EnableBankingConnectionStatus from '../components/EnableBankingConnectionStatus'

// Saxo's cash balance lives here too (it's a BankAccount row), but this page
// is for real bank connections - Saxo's total is already visible on the
// Dashboard hero, blended into "bank" there.
const SAXO_CASH_EXTERNAL_ID = 'saxo:cash'

export default function Accounts() {
  const { data: allAccounts, isLoading, error } = useBankAccounts()

  if (error) return <div className="text-red-400 text-sm">Failed to load accounts</div>
  if (isLoading || !allAccounts) return <div className="text-zinc-500 text-sm">Loading…</div>

  const accounts = allAccounts.filter((a) => a.external_id !== SAXO_CASH_EXTERNAL_ID)
  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Accounts"
        subtitle="Your connected bank accounts"
        right={<EnableBankingConnectionStatus />}
      />

      <StatStrip>
        <StatRow label="Total Balance" value={fmtEur(total)} note={`${accounts.length} accounts`} lead />
      </StatStrip>

      <HistoryAreaChart
        title="Bank balance"
        subtitle="Total across accounts over time"
        dataKey="bank_total"
        name="Bank"
        color="#fbbf24"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map((a) => (
            <Card key={a.id} className="relative overflow-hidden">
              <span
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ background: a.accent || '#3f3f46' }}
              />
              <div className="pl-2">
                <div className="text-[var(--fig-2xs)] text-zinc-500 font-medium uppercase tracking-wider">{a.type}</div>
                <div className="mt-1 text-[var(--fig-sm)] font-medium text-zinc-100">{a.bank}</div>
                <div className="mt-0.5 text-[var(--fig-xs)] text-zinc-500 num font-mono">{a.iban_masked}</div>
                <div className="mt-4 text-[var(--fig-xl)] font-semibold text-zinc-50 tracking-tight num font-mono">
                  {fmtEur(a.balance)}
                </div>
                {Number(a.available) !== Number(a.balance) && (
                  <div className="mt-1 text-[var(--fig-xs)] text-zinc-500">{fmtEur(a.available)} available</div>
                )}
              </div>
            </Card>
          ))}
        </div>

        <AccountBreakdownChart accounts={accounts} />
      </div>

      <CashFlowChart />
    </div>
  )
}
