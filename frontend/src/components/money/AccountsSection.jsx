import { useBankAccounts, useBankTransactions, useMe } from '../../api/queries'
import { fmtEur } from '../../lib/format'
import { useChartColors } from '../../theme/useChartColors'
import { Card, EmptyState, QueryState, Tile } from '../ui'
import HistoryAreaChart from '../HistoryAreaChart'
import EnableBankingConnectionStatus from '../EnableBankingConnectionStatus'
import SyncNowButton from '../SyncNowButton'
import BankAccountTile from '../BankAccountTile'
import LabeledAccountsSection from '../LabeledAccountsSection'
import RecentTransactionsPanel from '../RecentTransactionsPanel'
import { BOARD, SPAN_6, SPAN_12, TILES } from './layout'
import { SpendingDelta } from './MoneyPanels'
import { useThisMonthSummary } from './useThisMonthSummary'

const SAXO_CASH_EXTERNAL_ID = 'saxo:cash'
const RECENT_ROWS = 5

const Heading = () => <h1 className="sr-only">Accounts</h1>

function BankAccountsPanel({
  accounts,
  emptyHint = 'Connect a bank above to see its balance here.',
  context = 'Open one for its transactions',
  linked = true,
}) {
  return (
    <Card className={SPAN_6} context={context} dot={accounts.length ? 'ok' : 'off'} title="Bank accounts">
      {accounts.length === 0 ? (
        <EmptyState title="No bank accounts connected yet" hint={emptyHint} />
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((a) => (
            <BankAccountTile key={a.id} account={a} linked={linked} />
          ))}
        </div>
      )}
    </Card>
  )
}

function SharedAccounts() {
  const { data: allAccounts, error, refetch } = useBankAccounts()
  if (error || !allAccounts) {
    return (
      <>
        <Heading />
        <QueryState isLoading={!error} error={error} onRetry={refetch} label="accounts" />
      </>
    )
  }
  return (
    <>
      <Heading />
      <div className={BOARD}>
        <BankAccountsPanel
          accounts={allAccounts}
          context="Balances only"
          emptyHint="Connect Saxo to see your cash here."
          linked={false}
        />
      </div>
    </>
  )
}

export default function AccountsSection() {
  const { data: me } = useMe()
  return me?.is_owner === true ? <OwnerAccounts /> : <SharedAccounts />
}

function OwnerAccounts() {
  const c = useChartColors()
  const { data: allAccounts, error, refetch: refetchAccounts } = useBankAccounts()
  const { data: allTransactions } = useBankTransactions()
  const { data: summary } = useThisMonthSummary()

  if (error || !allAccounts) {
    return (
      <>
        <Heading />
        <QueryState isLoading={!error} error={error} onRetry={refetchAccounts} label="accounts" />
      </>
    )
  }

  const accounts = allAccounts.filter((a) => a.external_id !== SAXO_CASH_EXTERNAL_ID)
  const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0)
  const bankNameById = new Map(accounts.map((a) => [a.id, a.bank]))
  const recentAcrossAll = (allTransactions ?? [])
    .slice(0, RECENT_ROWS)
    .map((tx) => ({ ...tx, bank_name: bankNameById.get(tx.bank_account) ?? '' }))

  return (
    <>
      <Heading />
      <div className={BOARD}>
        <Card
          className={SPAN_12}
          context={`Connected banks · ${accounts.length} account${accounts.length === 1 ? '' : 's'} · in euros`}
          dot="ok"
          right={
            <span className="flex flex-wrap items-center justify-end gap-2">
              <SyncNowButton />
              <EnableBankingConnectionStatus />
            </span>
          }
        >
          <div className={TILES}>
            <Tile label="Total balance" value={fmtEur(total)} sub={`${accounts.length} accounts`} />
            <Tile
              label="This month's spending"
              value={summary ? fmtEur(summary.total) : null}
              sub={<SpendingDelta summary={summary} />}
            />
            <Tile
              label="Transfers this month"
              value={summary ? fmtEur(summary.transfers) : null}
              sub="Between your own accounts"
            />
          </div>
        </Card>

        <BankAccountsPanel accounts={accounts} />
        <RecentTransactionsPanel className={SPAN_6} transactions={recentAcrossAll} />

        <HistoryAreaChart
          className={SPAN_12}
          title="Bank balance"
          subtitle="Your connected bank accounts over time"
          dataKey="bank_only_total"
          name="Bank"
          color={c.series[1]}
        />

        <LabeledAccountsSection className={SPAN_12} />
      </div>
    </>
  )
}
