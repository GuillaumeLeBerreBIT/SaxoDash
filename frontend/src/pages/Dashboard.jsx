import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import {
  usePortfolioInsights,
  usePortfolioSummary,
  usePositionQuotes,
  usePositions,
  useSpendingSummary,
  useTransactions,
} from '../api/queries'
import { fmtEur, fmtMoney, fmtNum } from '../lib/format'
import { priceBasis } from '../lib/pricing'
import { researchHref } from '../lib/research'
import PriceBasisNote from '../components/PriceBasisNote'
import { Card, CardHeader, PageHeader, Skeleton, Badge, DayChange, InstrumentLogo, Th, Td } from '../components/ui'
import { colorForTicker } from '../lib/charts'
import AllocationDonut from '../components/AllocationDonut'
import NetWorthChart from '../components/NetWorthChart'
import HeroValue from '../components/dashboard/HeroValue'
import AttentionBand from '../components/dashboard/AttentionBand'
import MoversCard from '../components/dashboard/MoversCard'
import ContributorsCard from '../components/dashboard/ContributorsCard'
import UpcomingEarnings from '../components/dashboard/UpcomingEarnings'
import ExposureCard from '../components/dashboard/ExposureCard'

const txTone = { BUY: 'blue', SELL: 'zinc', DIVIDEND: 'amber', DEPOSIT: 'teal', FEE: 'red' }

export default function Dashboard() {
  const insightsQuery = usePortfolioInsights()
  const summaryQuery = usePortfolioSummary()
  const positionsQuery = usePositions()
  const recentTxQuery = useTransactions('?page_size=5')
  const spendingQuery = useSpendingSummary()
  // Computed before the loading guards below so the hook it wraps runs on
  // every render - a top-5 slice of an empty array is a harmless no-op.
  const top5 = (positionsQuery.data ?? []).slice().sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 5)
  const quotes = usePositionQuotes(top5)

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
  const topCategory = (spending?.categories ?? [])
    .slice().sort((a, b) => Number(b.amount) - Number(a.amount))[0]
  const top5Value = top5.reduce((sum, p) => sum + Number(p.value), 0)
  const otherValue = Math.max(Number(summary.total_value) - top5Value, 0)
  const allocationItems = [
    ...top5.map((p) => ({ name: p.ticker, value: Number(p.value), color: colorForTicker(p.ticker) })),
    ...(otherValue > 0 ? [{ name: 'Other', value: otherValue, color: '#52525b', logo: false }] : []),
  ]

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" subtitle="Overview of your investments and bank accounts" />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,28%)_1fr] gap-4">
        <HeroValue value={insights.value} change={insights.change} />
        <NetWorthChart />
      </div>
      <AttentionBand items={insights.attention} />

      <Card>
        <CardHeader title="This month's spending" subtitle="From bank transactions" />
        <div className="mt-2 text-[var(--fig-xl)] font-semibold text-zinc-50 num font-mono">
          {fmtEur(spending?.total ?? 0)}
        </div>
        {topCategory && (
          <div className="mt-1 text-[var(--fig-xs)] text-zinc-500">
            Top category: {topCategory.category} ({fmtEur(topCategory.amount)})
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3" padding={false}>
          <div className="p-4 pb-2">
            <CardHeader
              title="Top positions"
              subtitle="Largest 5 by value"
              right={<>
                <PriceBasisNote positions={top5} />
                <Link to="/portfolio" className="text-[var(--fig-xs)] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </>}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[var(--fig-sm)]">
              <thead>
                <tr className="text-left text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                  <Th edge>Name</Th>
                  <Th align="right">Price</Th>
                  <Th align="right">Day %</Th>
                  <Th align="right">Value</Th>
                  <Th align="right">P&L</Th>
                  <Th edge align="right">Weight</Th>
                </tr>
              </thead>
              <tbody>
                {top5.map((p) => (
                  <tr key={p.ticker} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <Td edge>
                      <Link to={researchHref(p.ticker)} className="flex items-center gap-2.5 group">
                        <InstrumentLogo
                          symbol={p.ticker}
                          size={16}
                          className="rounded-sm"
                          fallback={<span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorForTicker(p.ticker) }} />}
                        />
                        <span className="font-medium text-zinc-100 group-hover:text-blue-300">{p.ticker}</span>
                        <span className="text-zinc-500 truncate max-w-[160px]">{p.name}</span>
                      </Link>
                    </Td>
                    <Td align="right" className="num font-mono text-zinc-200"><span
                        title={priceBasis(p.price_source).note}
                        className={p.price_source === 'live' ? '' : 'decoration-dotted underline underline-offset-4 decoration-zinc-600'}
                      >
                        {fmtMoney(p.current_price, p.currency)}
                      </span></Td>
                    <Td align="right"><DayChange value={quotes.get(p.uic)?.change_pct} /></Td>
                    <Td align="right" className="num font-mono text-zinc-100">{fmtEur(p.value)}</Td>
                    <Td align="right" className={`num font-mono ${Number(p.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtEur(p.pnl, { sign: true })}
                    </Td>
                    <Td edge align="right" className="num font-mono text-zinc-300">{Number(p.weight).toFixed(1)}%</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Allocation" subtitle="Top 5 by value" />
          <AllocationDonut items={allocationItems} formatValue={fmtEur} showIcons />
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MoversCard movers={insights.movers} />
        <ContributorsCard contributors={insights.contributors} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ExposureCard
          sector={insights.sector_exposure}
          currency={insights.currency_exposure}
          concentration={insights.concentration}
        />
        <UpcomingEarnings items={insights.upcoming_earnings} />
      </div>

      <Card padding={false}>
        <div className="p-4 pb-2">
          <CardHeader
            title="Recent transactions"
            subtitle="Last 5 across all accounts"
            right={
              <Link to="/transactions" className="text-[var(--fig-xs)] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            }
          />
        </div>
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
      </Card>
    </div>
  )
}
