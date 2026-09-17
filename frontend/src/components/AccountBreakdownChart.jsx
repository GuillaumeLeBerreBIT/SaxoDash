import { fmtEur } from '../lib/format'
import { toAccountBreakdownData } from '../lib/accounts'
import { Card, CardHeader, ChartPlaceholder } from './ui'
import AllocationDonut from './AllocationDonut'

export default function AccountBreakdownChart({ accounts }) {
  const data = toAccountBreakdownData(accounts)

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader title="Balance by account" subtitle="Share of total balance" />
        <ChartPlaceholder height={200}>No accounts connected yet</ChartPlaceholder>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader title="Balance by account" subtitle="Share of total balance" />
      <AllocationDonut items={data} formatValue={fmtEur} />
    </Card>
  )
}
