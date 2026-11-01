import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  useBudgetProgress,
  useOwnershipSummary,
  usePerformance,
  usePortfolioInsights,
  usePortfolioSummary,
  usePositionQuotes,
  usePositions,
  useSpendingSummary,
  useTransactions,
} from '../api/queries'
import { fmtDate, fmtEur, fmtQty } from '../lib/format'
import { txPrice, txSignedTotal, txTone, txTotal } from '../lib/transactions'
import { CATEGORY_LABELS } from '../lib/categories'
import { capBreaches } from '../lib/portfolioStats'
import { ownershipTickers } from '../lib/ownership'
import { Alert, Badge, Card, EmptyState, Skeleton, Th, Td, Tr } from '../components/ui'
import NetWorthChart from '../components/NetWorthChart'
import HeroValue from '../components/dashboard/HeroValue'
import ThisWeek from '../components/dashboard/ThisWeek'
import PositionsPanel from '../components/dashboard/PositionsPanel'
import VsBenchmark from '../components/dashboard/VsBenchmark'
import AllocationPanel from '../components/dashboard/AllocationPanel'
import SmartMoney from '../components/dashboard/SmartMoney'
import MoversCard from '../components/dashboard/MoversCard'
import PortfolioHeatmap from '../components/dashboard/PortfolioHeatmap'

const NO_POSITIONS = []
const SPAN_8 = 'min-[1100px]:col-span-8'
const SPAN_4 = 'min-[1100px]:col-span-4'

function currentMonthStart() {
  // Built from local date parts, not toISOString() - that converts through
  // UTC and can land on the previous month in the small hours in UTC+ zones.
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

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
        <Link to="/transactions" className="text-[13px] font-semibold text-ink-2 hover:text-ink whitespace-nowrap">
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

export default function Dashboard() {
  const insightsQuery = usePortfolioInsights()
  const summaryQuery = usePortfolioSummary()
  const positionsQuery = usePositions()
  const recentTxQuery = useTransactions('?page_size=5')
  const spendingQuery = useSpendingSummary(`?date_from=${currentMonthStart()}`)
  const budgetProgressQuery = useBudgetProgress()
  const performanceQuery = usePerformance('sp500')
  const quotes = usePositionQuotes(positionsQuery.data ?? NO_POSITIONS)
  const holdings = positionsQuery.data
  const fundTickers = useMemo(() => ownershipTickers(holdings ?? NO_POSITIONS), [holdings])
  const ownership = useOwnershipSummary(fundTickers).data

  const failed =
    insightsQuery.error || positionsQuery.error || summaryQuery.error || recentTxQuery.error || spendingQuery.error

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
  const spending = spendingQuery.data
  const positions = positionsQuery.data ?? []
  const budgetAttentionItems = (budgetProgressQuery.data ?? [])
    .filter((row) => row.pct >= 100)
    .map((row) => ({
      kind: 'budget_exceeded',
      severity: 'warn',
      text: `${CATEGORY_LABELS[row.category] ?? row.category} is over budget (${fmtEur(row.spent)} of ${fmtEur(row.limit)})`,
    }))

  return (
    <>
      <h1 className="sr-only">Overview</h1>
      <div className="grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start">
        <Card
          className={SPAN_8}
          context={`Saxo + bank · as of ${fmtDate(insights.as_of)}${insights.stale ? ' · stale' : ''}`}
          dot={insights.stale ? 'warn' : 'ok'}
          title="Net worth"
        >
          <HeroValue
            value={insights.value}
            change={insights.change}
            spendingThisMonth={spending?.total}
            unrealised={summary.total_pnl}
          />
          <div className="mt-5">
            <NetWorthChart />
          </div>
          <p className="mt-3 text-[12px] text-ink-3">Change is end-of-day, from the daily net-worth snapshot.</p>
        </Card>
        <ThisWeek
          className={SPAN_4}
          attention={[...insights.attention, ...budgetAttentionItems]}
          breaches={capBreaches(positions)}
          upcomingEarnings={insights.upcoming_earnings}
        />
        <PositionsPanel className={SPAN_8} summary={summary} positions={positions} quotes={quotes} />
        <div className={`${SPAN_4} min-w-0`}>
          <PortfolioHeatmap positions={positions} quotes={quotes} />
        </div>
        <VsBenchmark className={SPAN_4} data={performanceQuery.data} />
        <SmartMoney className={SPAN_4} positions={positions} ownership={ownership} />
        <AllocationPanel
          className={SPAN_4}
          positions={positions}
          currency={insights.currency_exposure}
          concentration={insights.concentration}
        />
        <RecentTransactions className={SPAN_8} rows={recentTx} />
        <div className={`${SPAN_4} min-w-0`}>
          <MoversCard movers={insights.movers} positions={positions} quotes={quotes} />
        </div>
      </div>
    </>
  )
}
