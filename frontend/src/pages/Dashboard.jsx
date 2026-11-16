import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  useInvestorHub,
  useOwnershipSummary,
  usePerformance,
  usePortfolioInsights,
  usePortfolioSummary,
  usePositionQuotes,
  usePositions,
  useTransactions,
  useVerdictSummary,
} from '../api/queries'
import { fmtDate, fmtQty } from '../lib/format'
import { txPrice, txSignedTotal, txTone, txTotal } from '../lib/transactions'
import { ownershipTickers } from '../lib/ownership'
import { briefHeadline, briefItems } from '../lib/brief'
import { dayChange } from '../lib/portfolioHero'
import { positionVerdict, positionVerdictTickers } from '../lib/verdicts'
import { Alert, Badge, Card, EmptyState, Skeleton, Th, Td, Tr } from '../components/ui'
import { BriefHero, BriefList, HoldingsList } from '../components/dashboard/DailyBrief'
import VsBenchmark from '../components/dashboard/VsBenchmark'
import SmartMoney from '../components/dashboard/SmartMoney'

const NO_POSITIONS = []
const SPAN_8 = 'min-[1100px]:col-span-8'
const SPAN_4 = 'min-[1100px]:col-span-4'

const totalTone = (t) => (txSignedTotal(t) > 0 ? 'text-up' : 'text-ink')

function RecentTransactions({ rows, className }) {
  return (
    <Card
      flush
      className={className}
      context="Last 5 across all accounts"
      dot={rows.length ? 'ok' : 'off'}
      title="Recent transactions"
      right={
        <Link to="/portfolio?view=transactions" className="text-[13px] font-semibold text-ink-2 hover:text-ink whitespace-nowrap">
          View all →
        </Link>
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="No recent transactions" className="py-6" />
      ) : (
        <div className="overflow-x-auto">
          <table aria-label="Recent transactions" className="w-full">
            <thead>
              <tr>
                <Th edge>Date</Th>
                <Th hideBelow="md">Type</Th>
                <Th>Name</Th>
                <Th align="right" hideBelow="md">Qty</Th>
                <Th align="right" hideBelow="md">Price</Th>
                <Th edge align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <Tr key={t.id}>
                  <Td edge className="text-ink-2 num">{fmtDate(t.date)}</Td>
                  <Td hideBelow="md">
                    <Badge tone={txTone(t.type)}>{t.type}</Badge>
                  </Td>
                  <Td className="w-full max-w-0 md:w-auto md:max-w-none">
                    <div className="truncate" title={`${t.instrument} (${t.ticker})`}>
                      <span className="font-medium text-ink">{t.ticker}</span>
                      <span className="text-ink-3 ml-2">{t.instrument}</span>
                    </div>
                    <span className="md:hidden block text-[12px] text-ink-3">{t.type}</span>
                  </Td>
                  <Td align="right" hideBelow="md" className="text-ink-2">{fmtQty(t.qty)}</Td>
                  <Td align="right" hideBelow="md" className="text-ink-2">{txPrice(t)}</Td>
                  <Td edge align="right" className={`font-semibold ${totalTone(t)}`}>{txTotal(t)}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

const SPAN_12 = 'min-[1100px]:col-span-12'

function signalCounts(hub, key, field) {
  const items = hub?.shelves?.find((shelf) => shelf.key === key)?.items ?? []
  return new Map(items.filter((item) => item.ticker).map((item) => [item.ticker, item[field]]))
}

export default function Dashboard() {
  const insightsQuery = usePortfolioInsights()
  const summaryQuery = usePortfolioSummary()
  const positionsQuery = usePositions()
  const recentTxQuery = useTransactions('?page_size=5')
  const performanceQuery = usePerformance('sp500')
  const hub = useInvestorHub().data
  const quotes = usePositionQuotes(positionsQuery.data ?? NO_POSITIONS)
  const holdings = positionsQuery.data
  const fundTickers = useMemo(() => ownershipTickers(holdings ?? NO_POSITIONS), [holdings])
  const ownership = useOwnershipSummary(fundTickers).data
  const verdictTickers = useMemo(() => positionVerdictTickers(holdings ?? NO_POSITIONS), [holdings])
  const verdicts = useVerdictSummary(verdictTickers).data

  const failed = insightsQuery.error || positionsQuery.error || summaryQuery.error || recentTxQuery.error

  if (failed) return <Alert>Failed to load dashboard data</Alert>
  if (!insightsQuery.data || !summaryQuery.data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-2/3" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )

  const insights = insightsQuery.data
  const summary = summaryQuery.data
  const recentTx = recentTxQuery.data ?? []
  const positions = [...(positionsQuery.data ?? [])].sort((a, b) => Number(b.value) - Number(a.value))
  const verdictOf = (position) => positionVerdict(position, verdicts)
  const items = briefItems({
    positions,
    verdicts: Object.fromEntries(positions.map((position) => [position.ticker, verdictOf(position)])),
    total: Number(summary.total_value) || 0,
    fundBuys: signalCounts(hub, 'convergent-buys', 'bought'),
    fundSells: signalCounts(hub, 'most-sold', 'sold'),
    earnings: insights.upcoming_earnings,
  })
  const notes = (insights.attention ?? []).map((item) => item.text).filter(Boolean)

  return (
    <>
      <h1 className="sr-only">Overview</h1>
      <div className="grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start">
        <BriefHero className={SPAN_12} headline={briefHeadline(items.length)} summary={summary} day={dayChange(positions, quotes)} />
        <BriefList className={SPAN_8} items={items} />
        <HoldingsList className={SPAN_4} positions={positions} verdictOf={verdictOf} quotes={quotes} upcomingEarnings={insights.upcoming_earnings} />
        <RecentTransactions className={SPAN_8} rows={recentTx} />
        <div className={`${SPAN_4} flex min-w-0 flex-col gap-[var(--sd-gap,12px)]`}>
          <SmartMoney positions={positions} ownership={ownership} />
          <VsBenchmark data={performanceQuery.data} />
        </div>
        {notes.length ? (
          <p data-testid="overview-notes" className={`${SPAN_12} text-[12px] text-ink-3`}>
            {`${notes.join(' ')} As of ${fmtDate(insights.as_of)}. Rules, not advice.`}
          </p>
        ) : null}
      </div>
    </>
  )
}
