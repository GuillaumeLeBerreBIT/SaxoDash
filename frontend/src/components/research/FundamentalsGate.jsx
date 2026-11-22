import { Panel, Skeleton } from '../ui'

// Shared loading/unavailable/available branching for a `useFundamentals`
// result, used by both OverviewTab's fundamentals card and ValuationTab.
export default function FundamentalsGate({ fundamentals, title, subtitle = 'From Finnhub', fallback, className = '', bare = false, children }) {
  const { data, isLoading } = fundamentals

  if (isLoading) {
    return (
      <Panel bare={bare} className={className} context={subtitle} dot="off" title={title}>
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Panel>
    )
  }

  if (!data?.available) {
    return (
      <Panel bare={bare} className={className} context={subtitle} dot="off" title={title}>
        <p className="text-[13px] text-ink-3">{data?.reason || fallback}</p>
      </Panel>
    )
  }

  return children(data)
}
