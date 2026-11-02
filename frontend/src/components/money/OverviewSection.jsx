import { useDismissSubscription, useSubscriptions } from '../../api/queries'
import SpendingCategoryChart from '../SpendingCategoryChart'
import BudgetSection from '../BudgetSection'
import ReviewQueue from '../ReviewQueue'
import SubscriptionsList from '../SubscriptionsList'
import { BOARD, COLUMN, SPAN_4, SPAN_6 } from './layout'
import { BudgetLeftPanel, CashPanel, SpentThisMonthPanel } from './MoneyPanels'
import { useThisMonthSummary } from './useThisMonthSummary'

export default function OverviewSection() {
  const { period, data: summary, isLoading, error, refetch } = useThisMonthSummary()
  const { data: subscriptions } = useSubscriptions()
  const dismissSubscription = useDismissSubscription()

  return (
    <>
      <h1 className="sr-only">Money</h1>
      <div className={BOARD}>
        <CashPanel className={SPAN_4} />
        <SpentThisMonthPanel className={SPAN_4} summary={summary} period={period} error={error} />
        <BudgetLeftPanel className={SPAN_4} />
        <div className={`${SPAN_6} ${COLUMN}`}>
          <SpendingCategoryChart
            categories={summary?.categories}
            isLoading={isLoading}
            error={error}
            onRetry={refetch}
            periodLabel={period.label}
            period={period}
          />
          <ReviewQueue />
        </div>
        <div className={`${SPAN_6} ${COLUMN}`}>
          <BudgetSection />
          <SubscriptionsList
            subscriptions={subscriptions}
            onDismiss={(id) => dismissSubscription.mutate({ id, dismissed: true })}
          />
        </div>
      </div>
    </>
  )
}
