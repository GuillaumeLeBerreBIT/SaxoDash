import { useBankAccounts } from '../api/queries'
import { fmtEur } from '../lib/format'
import { Card, PageHeader, StatCard } from '../components/ui'
import BankBalanceChart from '../components/BankBalanceChart'
import AccountBreakdownChart from '../components/AccountBreakdownChart'
import CashFlowChart from '../components/CashFlowChart'

export default function Accounts() {
  const { data: accounts, isLoading, error } = useBankAccounts()

  if (error) return <div className="text-red-400 text-sm">Failed to load accounts</div>
  if (isLoading || !accounts) return <div className="text-zinc-500 text-sm">Loading…</div>

  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0)

  return (
    <div className="space-y-5">
      <PageHeader title="Accounts" subtitle="Your connected bank accounts" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Balance" value={fmtEur(total)} note={`${accounts.length} accounts`} />
      </div>

      <BankBalanceChart />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {accounts.map((a) => (
            <Card key={a.id} className="relative overflow-hidden">
              <span
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ background: a.accent || '#3f3f46' }}
              />
              <div className="pl-2">
                <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">{a.type}</div>
                <div className="mt-1 text-[14px] font-medium text-zinc-100">{a.bank}</div>
                <div className="mt-0.5 text-[12px] text-zinc-500 num font-mono">{a.iban_masked}</div>
                <div className="mt-4 text-[22px] font-semibold text-zinc-50 tracking-tight num font-mono">
                  {fmtEur(a.balance)}
                </div>
                {Number(a.available) !== Number(a.balance) && (
                  <div className="mt-1 text-[12px] text-zinc-500">{fmtEur(a.available)} available</div>
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
