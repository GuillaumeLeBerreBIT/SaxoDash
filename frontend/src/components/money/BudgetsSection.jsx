import { useDismissSubscription, useSubscriptions } from '../../api/queries'
import BudgetSection from '../BudgetSection'
import SubscriptionsList from '../SubscriptionsList'
import { BOARD, COLUMN, SPAN_4, SPAN_8 } from './layout'
import { BudgetLeftPanel } from './MoneyPanels'

export default function BudgetsSection() {
  const { data: subscriptions } = useSubscriptions()
  const dismissSubscription = useDismissSubscription()

  return (
    <>
      <h1 className="sr-only">Budgets</h1>
      <div className={BOARD}>
        <BudgetSection className={SPAN_8} />
        <div className={`${SPAN_4} ${COLUMN}`}>
          <BudgetLeftPanel />
          <SubscriptionsList
            subscriptions={subscriptions}
            onDismiss={(id) => dismissSubscription.mutate({ id, dismissed: true })}
          />
        </div>
      </div>
    </>
  )
}
