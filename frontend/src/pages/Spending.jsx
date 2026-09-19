import { useState } from 'react'
import { useSpendingSummary, useSubscriptions, useDismissSubscription } from '../api/queries'
import { fmtEur, fmtNum, fmtPct } from '../lib/format'
import { CATEGORY_LABELS } from '../lib/categories'
import { resolvePeriod } from '../lib/periods'
import { PageHeader, StatStrip, StatRow } from '../components/ui'
import PeriodSelector from '../components/PeriodSelector'
import SpendingCategoryChart from '../components/SpendingCategoryChart'
import BudgetSection from '../components/BudgetSection'
import SpendingTrendChart from '../components/SpendingTrendChart'
import SubscriptionsList from '../components/SubscriptionsList'

export default function Spending() {
  const [period, setPeriod] = useState(() => ({ key: 'this_month', ...resolvePeriod('this_month') }))
  const { data: summary, isLoading, error } = useSpendingSummary(
    `?date_from=${period.date_from}&date_to=${period.date_to}`,
  )
  const { data: subscriptions } = useSubscriptions()
  const dismissSubscription = useDismissSubscription()

  const total = Number(summary?.total ?? 0)
  const prevTotal = summary?.previous_period ? Number(summary.previous_period.total) : null
  const deltaPct = prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null
  const topCategory = (summary?.categories ?? [])
    .slice()
    .sort((a, b) => Number(b.amount) - Number(a.amount))[0]

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
          badge={
            deltaPct != null
              ? `${deltaPct >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(deltaPct), { sign: false })}`
              : undefined
          }
          badgeTone={deltaPct == null ? 'zinc' : deltaPct >= 0 ? 'red' : 'emerald'}
          note={prevTotal != null ? `vs ${fmtEur(prevTotal)} last period` : undefined}
        />
        <StatRow label="Transactions" value={fmtNum(summary?.transaction_count ?? 0)} />
        <StatRow
          label="Top category"
          value={topCategory ? (CATEGORY_LABELS[topCategory.category] ?? topCategory.category) : '—'}
          note={topCategory ? fmtEur(topCategory.amount) : undefined}
        />
        <StatRow
          label="Transfers (not counted above)"
          value={fmtEur(summary?.transfers ?? 0)}
          note="Moved between your own accounts"
        />
      </StatStrip>

      <div className="grid gap-4 lg:grid-cols-2">
        <SpendingCategoryChart
          categories={summary?.categories}
          isLoading={isLoading}
          error={error}
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
