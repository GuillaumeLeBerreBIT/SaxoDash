import { useSpendingSummary, useSubscriptions, useDismissSubscription } from '../api/queries'
import { fmtEur } from '../lib/format'
import { PageHeader, StatStrip, StatRow } from '../components/ui'
import SpendingCategoryChart from '../components/SpendingCategoryChart'
import SubscriptionsList from '../components/SubscriptionsList'

export default function Spending() {
  const { data: summary, isLoading, error } = useSpendingSummary()
  const { data: subscriptions } = useSubscriptions()
  const dismissSubscription = useDismissSubscription()

  return (
    <div className="space-y-4">
      <PageHeader title="Spending" subtitle="Categorized bank transactions" />

      <StatStrip>
        <StatRow label="Total spending" value={fmtEur(summary?.total ?? 0)} lead />
        <StatRow
          label="Transfers (not counted above)"
          value={fmtEur(summary?.transfers ?? 0)}
          note="Moved between your own accounts"
        />
      </StatStrip>

      <SpendingCategoryChart categories={summary?.categories} isLoading={isLoading} error={error} />

      <SubscriptionsList
        subscriptions={subscriptions}
        onDismiss={(id) => dismissSubscription.mutate({ id, dismissed: true })}
      />
    </div>
  )
}
