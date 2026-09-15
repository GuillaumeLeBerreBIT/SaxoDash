import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { usePortfolioInsights, usePortfolioSummary, usePositions, useTransactions } from '../api/queries'
import { fmtEur, fmtMoney, fmtNum } from '../lib/format'
import { priceBasis } from '../lib/pricing'
import { researchHref } from '../lib/research'
import PriceBasisNote from '../components/PriceBasisNote'
import { Card, CardHeader, PageHeader, Skeleton, Badge, InstrumentLogo } from '../components/ui'
import { instrumentLogoUrl } from '../lib/logos'
import { chartTooltipProps } from '../lib/charts'
import NetWorthChart from '../components/NetWorthChart'
import HeroValue from '../components/dashboard/HeroValue'
import AttentionBand from '../components/dashboard/AttentionBand'
import MoversCard from '../components/dashboard/MoversCard'
import ContributorsCard from '../components/dashboard/ContributorsCard'
import UpcomingEarnings from '../components/dashboard/UpcomingEarnings'
import ExposureCard from '../components/dashboard/ExposureCard'

const txTone = { BUY: 'blue', SELL: 'zinc', DIVIDEND: 'amber', DEPOSIT: 'teal', FEE: 'red' }

/** Recharts' Pie `label` slot: an instrument logo chip plus its share, placed
 *  at each slice's mid-angle, replacing a separate dot-legend below the chart. */
function AllocationLabel({ cx, cy, midAngle, innerRadius, outerRadius, payload, percent }) {
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) / 2
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  const size = 18

  return (
    <g>
      <circle cx={x} cy={y - 5} r={size / 2 + 2} fill="#fff" stroke="#3f3f46" strokeWidth={1} />
      <image
        href={instrumentLogoUrl(payload.ticker)}
        x={x - size / 2}
        y={y - 5 - size / 2}
        width={size}
        height={size}
        style={{ clipPath: 'circle(50%)' }}
        preserveAspectRatio="xMidYMid slice"
      />
      <text x={x} y={y + 15} textAnchor="middle" className="text-[9px] fill-zinc-400 num font-mono">
        {(percent * 100).toFixed(0)}%
      </text>
    </g>
  )
}

export default function Dashboard() {
  const insightsQuery = usePortfolioInsights()
  const summaryQuery = usePortfolioSummary()
  const positionsQuery = usePositions()
  const recentTxQuery = useTransactions('?page_size=5')

  const failed =
    insightsQuery.error || positionsQuery.error || summaryQuery.error || recentTxQuery.error

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
  const positions = positionsQuery.data ?? []
  const recentTx = recentTxQuery.data ?? []
  const top5 = positions.slice().sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 5)

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" subtitle="Overview of your investments and bank accounts" />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,28%)_1fr] gap-4">
        <HeroValue value={insights.value} change={insights.change} />
        <NetWorthChart />
      </div>
      <AttentionBand items={insights.attention} />

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
                  <th className="px-4 py-1.5 font-medium">Name</th>
                  <th className="px-2 py-1.5 font-medium text-right">Price</th>
                  <th className="px-2 py-1.5 font-medium text-right">Value</th>
                  <th className="px-2 py-1.5 font-medium text-right">P&L</th>
                  <th className="px-4 py-1.5 font-medium text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {top5.map((p) => (
                  <tr key={p.ticker} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-2">
                      <Link to={researchHref(p.ticker)} className="flex items-center gap-2.5 group">
                        <InstrumentLogo
                          symbol={p.ticker}
                          size={16}
                          className="rounded-sm"
                          fallback={<span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />}
                        />
                        <span className="font-medium text-zinc-100 group-hover:text-blue-300">{p.ticker}</span>
                        <span className="text-zinc-500 truncate max-w-[160px]">{p.name}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right num font-mono text-zinc-200"><span
                        title={priceBasis(p.price_source).note}
                        className={p.price_source === 'live' ? '' : 'decoration-dotted underline underline-offset-4 decoration-zinc-600'}
                      >
                        {fmtMoney(p.current_price, p.currency)}
                      </span></td>
                    <td className="px-2 py-2 text-right num font-mono text-zinc-100">{fmtEur(p.value)}</td>
                    <td className={`px-2 py-2 text-right num font-mono ${Number(p.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtEur(p.pnl, { sign: true })}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="num font-mono text-zinc-300 w-10 text-right">{Number(p.weight).toFixed(1)}%</span>
                        <div className="w-14 h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full origin-left animate-barfill"
                            style={{ width: `${Number(p.weight)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Allocation" subtitle="By position" />
          <div className="mt-3 h-[var(--chart-h-sm)]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={summary.allocation}
                  dataKey="value"
                  nameKey="ticker"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  stroke="#18181b"
                  strokeWidth={2}
                  isAnimationActive={false}
                  label={AllocationLabel}
                  labelLine={false}
                >
                  {summary.allocation.map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip {...chartTooltipProps} formatter={(v, n) => [fmtEur(v), n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
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
              <th className="px-4 py-1.5 font-medium">Date</th>
              <th className="px-2 py-1.5 font-medium">Type</th>
              <th className="px-2 py-1.5 font-medium">Name</th>
              <th className="px-2 py-1.5 font-medium text-right">Qty</th>
              <th className="px-2 py-1.5 font-medium text-right">Price</th>
              <th className="px-4 py-1.5 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {recentTx.map((t) => (
              <tr key={t.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                <td className="px-4 py-2 text-zinc-300 num font-mono">{t.date}</td>
                <td className="px-2 py-2">
                  <Badge tone={txTone[t.type] || 'zinc'}>{t.type}</Badge>
                </td>
                <td className="px-2 py-2">
                  <span className="font-medium text-zinc-100">{t.ticker}</span>
                  <span className="text-zinc-500 ml-2">{t.instrument}</span>
                </td>
                <td className="px-2 py-2 text-right num font-mono text-zinc-300">{fmtNum(t.qty, 0)}</td>
                <td className="px-2 py-2 text-right num font-mono text-zinc-300">{fmtEur(t.price)}</td>
                <td className="px-4 py-2 text-right num font-mono text-zinc-100 font-medium">{fmtEur(t.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
