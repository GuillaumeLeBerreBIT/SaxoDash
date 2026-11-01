import { useFilings, useInsiders } from '../../api/queries'
import { fmtDate, fmtShares } from '../../lib/format'
import { netActivity } from '../../lib/insiders'
import { Button, Card, Skeleton } from '../ui'
import FilingsList from './FilingsList'
import InsiderSentimentChart from './InsiderSentimentChart'
import InsiderTransactions from './InsiderTransactions'
import SummaryTiles from './SummaryTiles'

const BOARD = 'grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start'
const SPAN_5 = 'min-[1100px]:col-span-5'
const SPAN_7 = 'min-[1100px]:col-span-7'
const SPAN_12 = 'min-[1100px]:col-span-12'

const TONES = { buy: 'text-up', sell: 'text-down', flat: 'text-ink-2' }

const fmtShareCount = (count) => (Number(count) === 0 ? '0' : fmtShares(count))

function QueryCard({ title, subtitle, dot = 'ok', className, query, loadingId, loadError, unavailable, children }) {
  const frame = { className, context: subtitle, title }
  if (query.isLoading) {
    return (
      <Card {...frame} dot="off">
        <Skeleton className="h-24 w-full" data-testid={loadingId} />
      </Card>
    )
  }
  if (query.error && !query.data) {
    return (
      <Card {...frame} dot="warn">
        <p className="text-[13px] text-ink-3">{loadError}</p>
        <Button size="sm" className="mt-3" onClick={() => query.refetch()}>
          Try again
        </Button>
      </Card>
    )
  }
  if (!query.data?.available) {
    return (
      <Card {...frame} dot="off">
        <p className="text-[13px] text-ink-3">{query.data?.reason || unavailable}</p>
      </Card>
    )
  }
  return (
    <Card {...frame} dot={dot}>
      {children(query.data)}
    </Card>
  )
}

function OpenMarketTotals({ summary }) {
  return (
    <>
      <SummaryTiles
        className="mt-3"
        label="Open-market insider totals"
        columns="grid-cols-2"
        tiles={[
          { label: 'Buys', value: String(summary.buys) },
          { label: 'Sales', value: String(summary.sells) },
          { label: 'Shares bought', value: fmtShareCount(summary.shares_bought) },
          { label: 'Shares sold', value: fmtShareCount(summary.shares_sold) },
        ]}
      />
      <p className="mt-2 text-[12px] text-ink-3">
        Counts open-market trades only (codes P and S), so awards, gifts and option exercises never read as buying or selling.
      </p>
    </>
  )
}

function Activity({ symbol, data }) {
  const activity = netActivity(data.summary)
  const sentiment = data.sentiment ?? []
  if (!activity && !(data.transactions ?? []).length && !sentiment.length) {
    return <p className="text-[13px] text-ink-3">No insider transactions were filed for {symbol} in the past year.</p>
  }
  return (
    <div className="grid gap-x-7 gap-y-4 min-[900px]:grid-cols-[5fr_7fr] items-start">
      <div className="min-w-0">
        {!activity && (
          <p className="text-[13px] text-ink-3">No open-market buying or selling by insiders in this period.</p>
        )}
        {activity && (
          <>
            <p className={`text-[14px] font-semibold ${TONES[activity.tone]}`}>{activity.text}</p>
            {data.summary.since && data.summary.until && (
              <p className="mt-1 text-[12px] text-ink-3 num">
                {fmtDate(data.summary.since)} to {fmtDate(data.summary.until)}
              </p>
            )}
            <OpenMarketTotals summary={data.summary} />
          </>
        )}
      </div>
      <div className="min-w-0">
        <InsiderSentimentChart sentiment={sentiment} />
      </div>
    </div>
  )
}

export default function FilingsTab({ symbol }) {
  const filings = useFilings(symbol)
  const insiders = useInsiders(symbol)

  return (
    <div className={BOARD}>
      <QueryCard
        className={SPAN_12}
        title="Insider activity"
        subtitle="Open-market buying and selling by company insiders · Finnhub"
        query={insiders}
        loadingId="insiders-loading"
        loadError="Insider activity could not be loaded."
        unavailable={`Insider activity is unavailable for ${symbol}.`}
      >
        {(data) => <Activity symbol={symbol} data={data} />}
      </QueryCard>
      <QueryCard
        className={SPAN_7}
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
        className={SPAN_5}
        title="SEC filings"
        subtitle="SEC EDGAR · annual, quarterly and current reports"
        dot={filings.data?.missing?.length ? 'warn' : 'ok'}
        query={filings}
        loadingId="filings-loading"
        loadError="SEC filings could not be loaded."
        unavailable={`SEC filings are unavailable for ${symbol}.`}
      >
        {(data) => (
          <>
            {data.missing?.length > 0 && (
              <p data-testid="filings-missing" className="mb-3 text-[13px] text-warn">
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
