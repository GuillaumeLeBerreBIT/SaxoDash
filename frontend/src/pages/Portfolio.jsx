import { Link } from 'react-router-dom'

import { useNetWorth, usePortfolioSummary, usePositionQuotes, usePositions } from '../api/queries'
import { fmtEur, fmtMoney, fmtPct, fmtQty } from '../lib/format'
import { priceBasis } from '../lib/pricing'
import { researchHref } from '../lib/research'
import { Card, CardHeader, PageHeader, Badge, DayChange, InstrumentLogo, StatStrip, StatRow, Th, Td } from '../components/ui'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import PriceBasisNote from '../components/PriceBasisNote'
import HistoryAreaChart from '../components/HistoryAreaChart'
import GainersLosersChart from '../components/GainersLosersChart'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import AllocationDonut from '../components/AllocationDonut'
import { SECTOR_PALETTE, colorForTicker } from '../lib/charts'

export default function Portfolio() {
  const summaryQuery = usePortfolioSummary()
  const positionsQuery = usePositions()
  const netWorthQuery = useNetWorth()
  // Computed before the loading guard below so the hook it wraps runs on
  // every render - pricing an empty position list is a harmless no-op.
  const quotes = usePositionQuotes(positionsQuery.data ?? [])

  const failed = summaryQuery.error || positionsQuery.error || netWorthQuery.error

  if (failed) return <div className="text-red-400 text-sm">Failed to load portfolio data</div>
  if (!summaryQuery.data || !netWorthQuery.data)
    return <div className="text-zinc-500 text-sm">Loading…</div>

  const summary = summaryQuery.data
  const netWorth = netWorthQuery.data
  const positions = positionsQuery.data ?? []

  const totals = positions.reduce(
    (s, p) => ({
      qty: s.qty + Number(p.qty),
      value: s.value + Number(p.value),
      pnl: s.pnl + Number(p.pnl),
    }),
    { qty: 0, value: 0, pnl: 0 }
  )

  const topHoldings = positions.slice().sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 5)
  const topHoldingsValue = topHoldings.reduce((sum, p) => sum + Number(p.value), 0)
  const otherHoldingsValue = Math.max(totals.value - topHoldingsValue, 0)
  const allocationItems = [
    ...topHoldings.map((p) => ({ name: p.ticker, value: Number(p.value), color: colorForTicker(p.ticker) })),
    ...(otherHoldingsValue > 0 ? [{ name: 'Other', value: otherHoldingsValue, color: '#52525b', logo: false }] : []),
  ]

  const sectorTotals = new Map()
  positions.forEach((p) => {
    sectorTotals.set(p.sector, (sectorTotals.get(p.sector) || 0) + Number(p.value))
  })
  const sectors = Array.from(sectorTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name,
      pct: (value / totals.value) * 100,
      color: SECTOR_PALETTE[i % SECTOR_PALETTE.length],
    }))

  return (
    <div className="space-y-4">
      <PageHeader title="Portfolio" subtitle="Holdings and allocation" right={<SaxoConnectionStatus />} />

      <InstrumentSearchBar />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,28%)_1fr] gap-4">
        <StatStrip vertical>
          <StatRow
            label="Total net worth"
            value={fmtEur(netWorth.net_worth)}
            note="Portfolio + bank accounts"
            tone="text-blue-400"
            lead
          />
          <StatRow
            label="Investment portfolio"
            value={fmtEur(summary.total_value)}
            note={
              <span
                className={
                  summary.total_pnl_pct == null
                    ? 'text-zinc-500'
                    : Number(summary.total_pnl_pct) >= 0 ? 'text-emerald-400' : 'text-red-400'
                }
              >
                {fmtPct(summary.total_pnl_pct)}
              </span>
            }
          />
          <StatRow label="Bank balance" value={fmtEur(netWorth.bank_total)} note="All connected accounts" />
        </StatStrip>

        <HistoryAreaChart
          title="Portfolio value"
          subtitle="Investment value over time"
          dataKey="portfolio_value"
          name="Portfolio"
          color="#34d399"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:[grid-template-columns:66fr_34fr]">
        <div className="flex flex-col gap-4 h-full">
          <Card padding={false} className="flex flex-col flex-1 min-h-0">
            <div className="p-4 pb-2">
              <CardHeader title="Holdings" subtitle="All positions" right={<PriceBasisNote positions={positions} />} />
            </div>
            <div className="flex-1 min-h-[160px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-[var(--fig-sm)]">
                <thead>
                  <tr className="text-left text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide border-b border-zinc-800">
                    <Th edge className="sticky top-0 z-10 bg-zinc-900">Name</Th>
                    <Th align="right" className="sticky top-0 z-10 bg-zinc-900">Qty</Th>
                    <Th align="right" className="sticky top-0 z-10 bg-zinc-900">Avg</Th>
                    <Th align="right" className="sticky top-0 z-10 bg-zinc-900">Price</Th>
                    <Th align="right" className="sticky top-0 z-10 bg-zinc-900">Day %</Th>
                    <Th align="right" className="sticky top-0 z-10 bg-zinc-900">Value</Th>
                    <Th align="right" className="sticky top-0 z-10 bg-zinc-900">P&L</Th>
                    <Th edge align="right" className="sticky top-0 z-10 bg-zinc-900">Weight</Th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.ticker} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                      <Td edge>
                        <Link to={researchHref(p.ticker)} className="flex items-center gap-2.5 group">
                          <InstrumentLogo
                            symbol={p.ticker}
                            size={16}
                            className="rounded-sm"
                            fallback={<span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorForTicker(p.ticker) }} />}
                          />
                          <span className="font-medium text-zinc-100 group-hover:text-blue-300">{p.ticker}</span>
                          {p.type === 'ETF' && <Badge tone="amber">ETF</Badge>}
                          <span className="text-zinc-500 truncate max-w-[160px]">{p.name}</span>
                        </Link>
                      </Td>
                      <Td align="right" className="num text-zinc-300">{fmtQty(p.qty)}</Td>
                      <Td align="right" className="num text-zinc-400">{fmtMoney(p.avg_cost, p.currency)}</Td>
                      <Td align="right" className="num text-zinc-200">
                        <span
                          title={priceBasis(p.price_source).note}
                          className={p.price_source === 'live' ? '' : 'decoration-dotted underline underline-offset-4 decoration-zinc-600'}
                        >
                          {fmtMoney(p.current_price, p.currency)}
                        </span>
                      </Td>
                      <Td align="right"><DayChange value={quotes.get(p.uic)?.change_pct} /></Td>
                      <Td align="right" className="num text-zinc-100">{fmtEur(p.value)}</Td>
                      <Td align="right" className={`num ${Number(p.pnl) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtEur(p.pnl, { sign: true })}
                      </Td>
                      <Td edge align="right" className="num text-zinc-300">{Number(p.weight).toFixed(1)}%</Td>
                    </tr>
                  ))}
                  <tr className="bg-zinc-800/20">
                    <Td edge className="font-medium text-zinc-300">
                      Total ({positions.length} holdings)
                    </Td>
                    <Td align="right" className="num text-zinc-300">{fmtQty(totals.qty)}</Td>
                    <Td />
                    <Td />
                    <Td />
                    <Td align="right" className="num text-zinc-100 font-medium">{fmtEur(totals.value)}</Td>
                    <Td align="right" className={`num font-medium ${totals.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtEur(totals.pnl, { sign: true })}</Td>
                    <Td edge align="right" className="num text-zinc-300">100.0%</Td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <GainersLosersChart positions={positions} />
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader title="Overview" />
            <div className="mt-4 divide-y divide-zinc-800">
              {[
                { label: 'Invested cost', val: fmtEur(summary.total_cost) },
                { label: 'Total P&L', val: fmtEur(summary.total_pnl, { sign: true }) },
                { label: 'Total P&L %', val: fmtPct(summary.total_pnl_pct) },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <span className="text-[var(--fig-sm)] text-zinc-500">{r.label}</span>
                  <span className="text-[var(--fig-sm)] text-zinc-100 num font-medium">{r.val}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Holdings allocation" subtitle="Top 5 by value" />
            <AllocationDonut items={allocationItems} formatValue={fmtEur} showIcons />
          </Card>

          <Card className="flex-1 flex flex-col">
            <CardHeader title="Sector breakdown" />
            <div className="mt-4 space-y-3">
              {sectors.map((s) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between text-[var(--fig-xs)] mb-1">
                    <span className="text-zinc-300">{s.name}</span>
                    <span className="text-zinc-400 num">{s.pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
