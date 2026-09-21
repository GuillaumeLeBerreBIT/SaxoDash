import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import {
  useBudgetProgress,
  usePortfolioInsights,
  usePortfolioSummary,
  usePositions,
  useSpendingSummary,
  useTransactions,
} from '../api/queries'
import { fmtEur, fmtNum, fmtPct } from '../lib/format'
import { CATEGORY_LABELS } from '../lib/categories'
import { Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton, StatRow, StatStrip, Th, Td } from '../components/ui'
import NetWorthChart from '../components/NetWorthChart'
import HeroValue from '../components/dashboard/HeroValue'
import AttentionBand from '../components/dashboard/AttentionBand'
import MoversCard from '../components/dashboard/MoversCard'
import UpcomingEarnings from '../components/dashboard/UpcomingEarnings'
import ExposureCard from '../components/dashboard/ExposureCard'

const txTone = { BUY: 'blue', SELL: 'zinc', DIVIDEND: 'amber', DEPOSIT: 'teal', FEE: 'red' }

const ViewAllLink = ({ to }) => (
  <Link to={to} className="text-[var(--fig-xs)] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
    View all <ArrowRight size={12} />
  </Link>
)

export default function Dashboard() {
  const insightsQuery = usePortfolioInsights()
  const summaryQuery = usePortfolioSummary()
  const positionsQuery = usePositions()
  const recentTxQuery = useTransactions('?page_size=5')
  // Built from local date parts, not toISOString() - that converts through
  // UTC and can land on the previous month in the small hours in UTC+ zones.
  const now = new Date()
  const firstOfMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const spendingQuery = useSpendingSummary(`?date_from=${firstOfMonthISO}`)
  const budgetProgressQuery = useBudgetProgress()

  const failed =
    insightsQuery.error || positionsQuery.error || summaryQuery.error || recentTxQuery.error || spendingQuery.error

  if (failed) return <div className="text-red-400 text-sm">Failed to load dashboard data</div>
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
  // Dashboard's job is triage, not a second Portfolio - just the one fact
  // (which holding is largest) rather than the full ranked table Portfolio
  // already owns.
  const topHolding = positions.slice().sort((a, b) => Number(b.value) - Number(a.value))[0]
  const budgetAttentionItems = (budgetProgressQuery.data ?? [])
    .filter((row) => row.pct >= 100)
    .map((row) => ({
      kind: 'budget_exceeded',
      severity: 'warn',
      text: `${CATEGORY_LABELS[row.category] ?? row.category} is over budget (${fmtEur(row.spent)} of ${fmtEur(row.limit)})`,
    }))
  const pnlPct = summary.total_pnl_pct
  const pnlTone = pnlPct == null ? 'text-zinc-500' : Number(pnlPct) >= 0 ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" subtitle="Overview of your investments and bank accounts" />

      {/* Tier 1: the two facts that matter before anything else - what you
          have, how it's trending, and anything that needs a decision. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,28%)_1fr] gap-4">
        <HeroValue value={insights.value} change={insights.change} spendingThisMonth={spending?.total} />
        <NetWorthChart />
      </div>
      <AttentionBand items={[...insights.attention, ...budgetAttentionItems]} />

      {/* Tier 2: a portfolio glance, not a second Portfolio page - three
          numbers and a link, not a restated holdings table + allocation
          donut (that duplication was the single largest redundancy on this
          page; Portfolio already owns that detail). */}
      <div>
        <CardHeader title="Portfolio" subtitle="At a glance" className="mb-3" right={<ViewAllLink to="/portfolio" />} />
        <StatStrip>
          <StatRow
            label="Portfolio value"
            value={fmtEur(summary.total_value)}
            note={<span className={pnlTone}>{fmtPct(pnlPct)}</span>}
            lead
          />
          <StatRow
            label="Top holding"
            value={topHolding?.ticker ?? '—'}
            note={topHolding ? `${Number(topHolding.weight).toFixed(1)}% of portfolio` : undefined}
          />
          <StatRow label="Holdings" value={fmtNum(positions.length)} note="Across all accounts" />
        </StatStrip>
      </div>

      {/* Tier 3: things worth a second look, not permanent standing cards -
          Movers/Exposure/Upcoming earnings each answer a distinct glance-
          worthy question. Contributors (per-holding contribution to return)
          was dropped from here entirely - Analytics' Attribution already
          computes the same thing from the same positions, and Dashboard
          doesn't need its own independent copy of that analysis. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MoversCard movers={insights.movers} />
        <ExposureCard
          sector={insights.sector_exposure}
          currency={insights.currency_exposure}
          concentration={insights.concentration}
        />
        <UpcomingEarnings items={insights.upcoming_earnings} />
      </div>

      <Card padding={false}>
        <div className="p-4 pb-2">
          <CardHeader title="Recent transactions" subtitle="Last 5 across all accounts" right={<ViewAllLink to="/transactions" />} />
        </div>
        {recentTx.length === 0 ? (
          <EmptyState title="No recent transactions" className="py-6" />
        ) : (
          <table className="w-full text-[var(--fig-sm)]">
            <thead>
              <tr className="text-left text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                <Th edge>Date</Th>
                <Th>Type</Th>
                <Th>Name</Th>
                <Th align="right">Qty</Th>
                <Th align="right">Price</Th>
                <Th edge align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {recentTx.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                  <Td edge className="text-zinc-300 num font-mono">{t.date}</Td>
                  <Td>
                    <Badge tone={txTone[t.type] || 'zinc'}>{t.type}</Badge>
                  </Td>
                  <Td>
                    <span className="font-medium text-zinc-100">{t.ticker}</span>
                    <span className="text-zinc-500 ml-2">{t.instrument}</span>
                  </Td>
                  <Td align="right" className="num font-mono text-zinc-300">{fmtNum(t.qty, 0)}</Td>
                  <Td align="right" className="num font-mono text-zinc-300">{fmtEur(t.price)}</Td>
                  <Td edge align="right" className="num font-mono text-zinc-100 font-medium">{fmtEur(t.total)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
