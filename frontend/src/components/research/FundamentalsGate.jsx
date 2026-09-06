import { Card, CardHeader } from '../ui'

// Shared loading/unavailable/available branching for a `useFundamentals`
// result, used by both OverviewTab's fundamentals card and ValuationTab.
export default function FundamentalsGate({ fundamentals, title, subtitle = 'From Finnhub', fallback, children }) {
  const { data, isLoading } = fundamentals

  if (isLoading) {
    return (
      <Card>
        <CardHeader title={title} subtitle={subtitle} />
        <div className="mt-3 text-[12px] text-zinc-500">Loading…</div>
      </Card>
    )
  }

  if (!data?.available) {
    return (
      <Card>
        <CardHeader title={title} subtitle={subtitle} />
        <p className="mt-3 text-[12px] text-zinc-500">{data?.reason || fallback}</p>
      </Card>
    )
  }

  return children(data)
}
