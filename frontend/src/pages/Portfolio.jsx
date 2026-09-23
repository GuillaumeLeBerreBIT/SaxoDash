import { Link } from 'react-router-dom'
import { PenLine } from 'lucide-react'

import { useNetWorth, usePortfolioSummary, usePositionQuotes, usePositions } from '../api/queries'
import { fmtEur, fmtMoney, fmtPct, fmtQty } from '../lib/format'
import { priceBasis } from '../lib/pricing'
import { researchHref } from '../lib/research'
import { Card, CardHeader, EmptyState, PageHeader, Badge, DayChange, InstrumentLogo, StatStrip, StatRow, Th, Td, Tr } from '../components/ui'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import PriceBasisNote from '../components/PriceBasisNote'
import HistoryAreaChart from '../components/HistoryAreaChart'
import GainersLosersChart from '../components/GainersLosersChart'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import AllocationDonut from '../components/AllocationDonut'
import { colorForTicker, OTHER_SLICE, SECTOR_PALETTE, SERIES_INVESTMENTS } from '../lib/charts'

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
    ...(otherHoldingsValue > 0 ? [{ name: 'Other', value: otherHoldingsValue, color: OTHER_SLICE, logo: false }] : []),
  ]

  const MAX_SECTOR_SLICES = 5
  const sectorTotals = new Map()
  positions.forEach((p) => {
    sectorTotals.set(p.sector, (sectorTotals.get(p.sector) || 0) + Number(p.value))
  })
  const sectorEntries = Array.from(sectorTotals.entries()).sort((a, b) => b[1] - a[1])
  const otherSectorsValue = sectorEntries.slice(MAX_SECTOR_SLICES).reduce((sum, [, value]) => sum + value, 0)
  // Same donut+legend pattern as Holdings allocation above, same top-N+Other
  // cap - one chart language for "share of X", not bars here and a donut
  // there for two instances of the identical question.
  const sectorAllocationItems = [
    ...sectorEntries
      .slice(0, MAX_SECTOR_SLICES)
      .map(([name, value], i) => ({ name, value, color: SECTOR_PALETTE[i % SECTOR_PALETTE.length] })),
    ...(otherSectorsValue > 0 ? [{ name: 'Other', value: otherSectorsValue, color: OTHER_SLICE, logo: false }] : []),
  ]

  const pnlTone =
    summary.total_pnl_pct == null ? 'text-zinc-500' : Number(summary.total_pnl_pct) >= 0 ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="space-y-4">
      <PageHeader title="Portfolio" subtitle="Holdings and allocation" right={<SaxoConnectionStatus />} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,28%)_1fr] gap-4">
        {/* One stat surface for portfolio totals, not two - this used to be a
            3-row strip here plus a second "Overview" card in the sidebar
            below restating Invested cost/Total P&L/Total P&L% for the same
            underlying figures in a different visual pattern. */}
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
            note={<span className={pnlTone}>{fmtPct(summary.total_pnl_pct)}</span>}
          />
          <StatRow
            label="Total P&L"
            value={<span className={pnlTone}>{fmtEur(summary.total_pnl, { sign: true })}</span>}
            note={`${fmtEur(summary.total_cost)} invested`}
          />
          <StatRow label="Bank balance" value={fmtEur(netWorth.bank_total)} note="All connected accounts" />
        </StatStrip>

        <HistoryAreaChart
          title="Portfolio value"
          subtitle="Investment value over time"
          dataKey="portfolio_value"
          name="Portfolio"
          color={SERIES_INVESTMENTS}
        />
      </div>

      <InstrumentSearchBar />

      <div className="grid grid-cols-1 gap-4 lg:[grid-template-columns:66fr_34fr]">
        <div className="flex flex-col gap-4 h-full">
          <Card padding={false} className="flex flex-col flex-1 min-h-0">
            <div className="p-4 pb-2">
              <CardHeader title="Holdings" subtitle="All positions" right={<PriceBasisNote positions={positions} />} />
            </div>
            <div className="flex-1 min-h-[160px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-[var(--fig-sm)]">
                <thead>
                  <tr className="text-left text-[var(--fig-2xs)] text-zinc-500 uppercase tracking-wide border-b border-white/[0.06]">
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
                    <Tr key={p.ticker}>
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
                          {p.has_thesis === false && (
                            <PenLine
                              size={12}
                              className="text-zinc-600 shrink-0"
                              title="No thesis written yet — add one on the Research page"
                            />
                          )}
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
                    </Tr>
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
            <CardHeader title="Holdings allocation" subtitle="Top 5 by value" />
            {totals.value > 0 ? (
              <AllocationDonut items={allocationItems} formatValue={fmtEur} showIcons />
            ) : (
              <EmptyState title="No priced holdings yet" hint="Allocation needs a value per holding to chart." />
            )}
          </Card>

          <Card className="flex-1 flex flex-col">
            <CardHeader title="Sector breakdown" subtitle="By value" />
            {totals.value > 0 ? (
              <AllocationDonut items={sectorAllocationItems} formatValue={fmtEur} />
            ) : (
              <EmptyState title="No priced holdings yet" hint="Sector weight needs a value per holding to chart." />
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
