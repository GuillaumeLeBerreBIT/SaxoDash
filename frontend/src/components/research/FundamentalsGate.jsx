import { Card, Skeleton } from '../ui'

// Shared loading/unavailable/available branching for a `useFundamentals`
// result, used by both OverviewTab's fundamentals card and ValuationTab.
export default function FundamentalsGate({ fundamentals, title, subtitle = 'From Finnhub', fallback, className = '', children }) {
  const { data, isLoading } = fundamentals

  if (isLoading) {
    return (
      <Card className={className} context={subtitle} dot="off" title={title}>
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
    )
  }

  if (!data?.available) {
    return (
      <Card className={className} context={subtitle} dot="off" title={title}>
        <p className="text-[13px] text-ink-3">{data?.reason || fallback}</p>
      </Card>
    )
  }

  return children(data)
}
