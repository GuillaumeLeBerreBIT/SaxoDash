import { useFilings, useInsiders } from '../../api/queries'
import { fmtDate } from '../../lib/format'
import { netActivity } from '../../lib/insiders'
import { Card, CardHeader, Skeleton, TBtn } from '../ui'
import FilingsList from './FilingsList'
import InsiderSentimentChart from './InsiderSentimentChart'
import InsiderTransactions from './InsiderTransactions'

const TONES = { buy: 'text-emerald-400', sell: 'text-red-400', flat: 'text-zinc-400' }

function QueryCard({ title, subtitle, query, loadingId, loadError, unavailable, children }) {
  if (query.isLoading) {
    return (
      <Card>
        <CardHeader title={title} subtitle={subtitle} />
        <Skeleton className="mt-4 h-24 w-full" data-testid={loadingId} />
      </Card>
    )
  }
  if (query.error && !query.data) {
    return (
      <Card>
        <CardHeader title={title} subtitle={subtitle} />
        <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">{loadError}</p>
        <div className="mt-3">
          <TBtn onClick={() => query.refetch()}>Try again</TBtn>
        </div>
      </Card>
    )
  }
  if (!query.data?.available) {
    return (
      <Card>
        <CardHeader title={title} subtitle={subtitle} />
        <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">{query.data?.reason || unavailable}</p>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="mt-3">{children(query.data)}</div>
    </Card>
  )
}

function Activity({ symbol, data }) {
  const activity = netActivity(data.summary)
  const sentiment = data.sentiment ?? []
  if (!activity && !(data.transactions ?? []).length && !sentiment.length) {
    return <p className="text-[var(--fig-xs)] text-zinc-500">No insider transactions were filed for {symbol} in the past year.</p>
  }
  return (
    <>
      {!activity && (
        <p className="text-[var(--fig-xs)] text-zinc-500">No open-market buying or selling by insiders in this period.</p>
      )}
      {activity && (
        <>
          <p className={`text-[var(--fig-sm)] font-medium ${TONES[activity.tone]}`}>{activity.text}</p>
          {data.summary.since && data.summary.until && (
            <p className="mt-1 text-[var(--fig-2xs)] text-zinc-500">
              {fmtDate(data.summary.since)} to {fmtDate(data.summary.until)}
            </p>
          )}
        </>
      )}
      <InsiderSentimentChart sentiment={sentiment} />
    </>
  )
}

export default function FilingsTab({ symbol }) {
  const filings = useFilings(symbol)
  const insiders = useInsiders(symbol)

  return (
    <div className="space-y-4">
      <QueryCard
        title="Insider activity"
        subtitle="Open-market buying and selling by company insiders"
        query={insiders}
        loadingId="insiders-loading"
        loadError="Insider activity could not be loaded."
        unavailable={`Insider activity is unavailable for ${symbol}.`}
      >
        {(data) => <Activity symbol={symbol} data={data} />}
      </QueryCard>
      <QueryCard
        title="Insider transactions"
        subtitle="Merged per insider, day and type"
        query={insiders}
        loadingId="insiders-loading"
        loadError="Insider transactions could not be loaded."
        unavailable={`Insider transactions are unavailable for ${symbol}.`}
      >
        {(data) => <InsiderTransactions transactions={data.transactions ?? []} counts={data.counts} />}
      </QueryCard>
      <QueryCard
        title="SEC filings"
        subtitle="Annual, quarterly and current reports"
        query={filings}
        loadingId="filings-loading"
        loadError="SEC filings could not be loaded."
        unavailable={`SEC filings are unavailable for ${symbol}.`}
      >
        {(data) => (
          <>
            {data.missing?.length > 0 && (
              <p data-testid="filings-missing" className="mb-3 text-[var(--fig-xs)] text-amber-400">
                {`Could not load ${data.missing.join(', ')} filings just now; showing the rest.`}
              </p>
            )}
            <FilingsList filings={data.filings ?? []} />
          </>
        )}
      </QueryCard>
    </div>
  )
}
