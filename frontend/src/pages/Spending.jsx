import { useState } from 'react'
import { useSpendingSummary, useSubscriptions, useDismissSubscription } from '../api/queries'
import { fmtEur, fmtNum } from '../lib/format'
import { spendingDelta } from '../lib/spendingDelta'
import { topCategory } from '../lib/spending'
import { CATEGORY_LABELS } from '../lib/categories'
import { resolvePeriod } from '../lib/periods'
import { PageHeader, StatStrip, StatRow, InfoTip } from '../components/ui'
import PeriodSelector from '../components/PeriodSelector'
import SpendingCategoryChart from '../components/SpendingCategoryChart'
import BudgetSection from '../components/BudgetSection'
import SpendingTrendChart from '../components/SpendingTrendChart'
import SubscriptionsList from '../components/SubscriptionsList'

export default function Spending() {
  const [period, setPeriod] = useState(() => ({ key: 'this_month', ...resolvePeriod('this_month') }))
  const { data: summary, isLoading, error, refetch } = useSpendingSummary(
    `?date_from=${period.date_from}&date_to=${period.date_to}`,
  )
  const { data: subscriptions } = useSubscriptions()
  const dismissSubscription = useDismissSubscription()

  const total = Number(summary?.total ?? 0)
  const prevTotal = summary?.previous_period ? Number(summary.previous_period.total) : null
  const delta = spendingDelta({ total, previousTotal: prevTotal, comparisonLabel: summary?.comparison_label })
  const top = topCategory(summary?.categories)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Spending"
        subtitle="Categorized bank transactions"
        right={<PeriodSelector value={period} onChange={setPeriod} />}
      />

      <StatStrip>
        <StatRow
          label={`Total spending — ${period.label}`}
          value={fmtEur(summary?.total ?? 0)}
          lead
          badge={delta.badge}
          badgeTone={delta.tone}
          note={delta.note}
        />
        <StatRow label="Transactions" value={fmtNum(summary?.transaction_count ?? 0)} />
        <StatRow
          label="Top category"
          value={top ? (CATEGORY_LABELS[top.category] ?? top.category) : '—'}
          note={top ? fmtEur(top.amount) : undefined}
        />
        <StatRow
          label={
            <span className="inline-flex items-center gap-1.5">
              Transfers
              <InfoTip label="About transfers">
                Money moved between your own accounts. It is left out of the totals above.
              </InfoTip>
            </span>
          }
          value={fmtEur(summary?.transfers ?? 0)}
          note="Moved between your own accounts"
        />
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-2">
        <SpendingCategoryChart
          categories={summary?.categories}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          periodLabel={period.label}
        />
        <SpendingTrendChart />
      </div>

      <BudgetSection />

      <SubscriptionsList
        subscriptions={subscriptions}
        onDismiss={(id) => dismissSubscription.mutate({ id, dismissed: true })}
      />
    </div>
  )
}
