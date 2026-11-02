import { useSpendingSummary } from '../../api/queries'
import { resolvePeriod } from '../../lib/periods'

export function useThisMonthSummary() {
  const period = { key: 'this_month', ...resolvePeriod('this_month') }
  const query = useSpendingSummary(`?date_from=${period.date_from}&date_to=${period.date_to}`)
  return { period, ...query }
}
