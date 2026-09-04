import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useNetWorth, usePortfolioSummary, usePositions, useTransactions } from '../api/queries'
import { fmtEur, fmtMoney, fmtPct, fmtNum } from '../lib/format'
import { priceBasis } from '../lib/pricing'
import PriceBasisNote from '../components/PriceBasisNote'
import { Card, CardHeader, PageHeader, StatCard, Badge } from '../components/ui'
import { chartTooltipProps } from '../lib/charts'
import NetWorthChart from '../components/NetWorthChart'

const txTone = { BUY: 'blue', SELL: 'zinc', DIVIDEND: 'amber', DEPOSIT: 'teal', FEE: 'red' }

export default function Dashboard() {
  const summaryQuery = usePortfolioSummary()
  const positionsQuery = usePositions()
  const netWorthQuery = useNetWorth()
  const recentTxQuery = useTransactions('?page_size=5')

  const failed =
    summaryQuery.error || positionsQuery.error || netWorthQuery.error || recentTxQuery.error

  if (failed) return <div className="text-red-400 text-sm">Failed to load dashboard data</div>
  if (!summaryQuery.data || !netWorthQuery.data)
    return <div className="text-zinc-500 text-sm">Loading…</div>

  const summary = summaryQuery.data
  const netWorth = netWorthQuery.data
  const positions = positionsQuery.data ?? []
  const recentTx = recentTxQuery.data ?? []

  const pnlKnown = summary.total_pnl != null
  const totalPnl = Number(summary.total_pnl)
  const top5 = positions.slice().sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 5)

  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" subtitle="Overview of your investments and bank accounts" />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Net worth" value={fmtEur(netWorth.net_worth)} note="Portfolio + bank accounts" />
        <StatCard
          label="Portfolio value"
          value={fmtEur(summary.total_value)}
          badge={fmtPct(summary.total_pnl_pct)}
          badgeTone={!pnlKnown ? 'zinc' : totalPnl >= 0 ? 'emerald' : 'red'}
          note={
            pnlKnown
              ? `${fmtEur(totalPnl, { sign: true })} all-time`
              : 'P/L unavailable until positions sync'
          }
        />
        <StatCard label="Bank balance" value={fmtEur(netWorth.bank_total)} note="All connected accounts" />
      </div>

      <NetWorthChart />

      <div className="grid grid-cols-5 gap-4">
        <Card className="col-span-3" padding={false}>
          <div className="p-5 pb-3">
            <CardHeader
              title="Top positions"
              subtitle="Largest 5 by value"
              right={<>
                <PriceBasisNote positions={top5} />
                <Link to="/portfolio" className="text-[12px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </>}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                  <th className="px-5 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium text-right">Price</th>
                  <th className="px-2 py-2 font-medium text-right">Value</th>
                  <th className="px-2 py-2 font-medium text-right">P&L</th>
                  <th className="px-5 py-2 font-medium text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {top5.map((p) => (
                  <tr key={p.ticker} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                        <span className="font-medium text-zinc-100">{p.ticker}</span>
                        <span className="text-zinc-500 truncate max-w-[160px]">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3 text-right num font-mono text-zinc-200"><span
                        title={priceBasis(p.price_source).note}
                        className={p.price_source === 'live' ? '' : 'decoration-dotted underline underline-offset-4 decoration-zinc-600'}
                      >
                        {fmtMoney(p.current_price, p.currency)}
                      </span></td>
                    <td className="px-2 py-3 text-right num font-mono text-zinc-100">{fmtEur(p.value)}</td>
                    <td className={`px-2 py-3 text-right num font-mono ${Number(p.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmtEur(p.pnl, { sign: true })}
                    </td>
                    <td className="px-5 py-3 text-right">
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

        <Card className="col-span-2">
          <CardHeader title="Allocation" subtitle="By position" />
          <div className="mt-3 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={summary.allocation} dataKey="value" nameKey="ticker" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="#18181b" strokeWidth={2} isAnimationActive={false}>
                  {summary.allocation.map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip {...chartTooltipProps} formatter={(v, n) => [fmtEur(v), n]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 pt-4 border-t border-zinc-800">
            {summary.allocation.map((a) => {
              const pct = (Number(a.value) / Number(summary.total_value)) * 100
              return (
                <div key={a.ticker} className="flex items-center gap-2 text-[12px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
                  <span className="text-zinc-300 font-medium">{a.ticker}</span>
                  <span className="ml-auto text-zinc-500 num font-mono">{pct.toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      <Card padding={false}>
        <div className="p-5 pb-3">
          <CardHeader
            title="Recent transactions"
            subtitle="Last 5 across all accounts"
            right={
              <Link to="/transactions" className="text-[12px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            }
          />
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
              <th className="px-5 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Type</th>
              <th className="px-2 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium text-right">Qty</th>
              <th className="px-2 py-2 font-medium text-right">Price</th>
              <th className="px-5 py-2 font-medium text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {recentTx.map((t) => (
              <tr key={t.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                <td className="px-5 py-3 text-zinc-300 num font-mono">{t.date}</td>
                <td className="px-2 py-3">
                  <Badge tone={txTone[t.type] || 'zinc'}>{t.type}</Badge>
                </td>
                <td className="px-2 py-3">
                  <span className="font-medium text-zinc-100">{t.ticker}</span>
                  <span className="text-zinc-500 ml-2">{t.instrument}</span>
                </td>
                <td className="px-2 py-3 text-right num font-mono text-zinc-300">{fmtNum(t.qty, 0)}</td>
                <td className="px-2 py-3 text-right num font-mono text-zinc-300">{fmtEur(t.price)}</td>
                <td className="px-5 py-3 text-right num font-mono text-zinc-100 font-medium">{fmtEur(t.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
