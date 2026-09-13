import { fmtEur, fmtMoney, fmtNum, fmtPct, fmtQty } from '../../lib/format'
import { priceBasis } from '../../lib/pricing'
import { rangeStats } from '../../lib/research'
import { Card, CardHeader, Metric } from '../ui'
import SnapshotSection from './SnapshotSection'

function Fact({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11.5px] text-zinc-500">{label}</span>
      <span className="text-[12.5px] num font-mono text-zinc-100">{value ?? '—'}</span>
    </div>
  )
}

function PositionCard({ position }) {
  const gain = Number(position.pnl) >= 0

  return (
    <Card>
      <CardHeader title="Your position" subtitle={priceBasis(position.price_source).note} />
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Metric label="Quantity" value={fmtQty(position.qty)} />
        <Metric label="Avg buy" value={fmtMoney(position.avg_cost, position.currency)} />
        <Metric label="Market value" value={fmtEur(position.value, { decimals: 0 })} />
        <Metric
          label="Unrealised P&L"
          value={fmtEur(position.pnl, { sign: true, decimals: 0 })}
          tone={gain ? 'text-emerald-400' : 'text-red-400'}
          hint={fmtPct(position.pnl_pct)}
        />
      </div>
    </Card>
  )
}

function ReferenceStrip({ symbol, details, isLoading }) {
  if (isLoading) return <div className="h-4 w-64 rounded bg-white/[0.05]" />
  const pairs = [
    ['Exchange', details?.exchange_name || details?.exchange],
    ['Currency', details?.currency],
    ['ISIN', details?.isin],
    ['Uic', details?.uic],
    ['Lot size', details?.lot_size],
    ['Asset type', details?.asset_type],
  ].filter(([, value]) => value != null && value !== '')

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-zinc-500">
      <span className="text-zinc-400 font-medium">{details?.description || symbol}</span>
      {pairs.map(([label, value]) => (
        <span key={label}>
          {label} <span className="text-zinc-300 num font-mono">{value}</span>
        </span>
      ))}
    </div>
  )
}

function RangeStatsCard({ bars, range }) {
  const stats = rangeStats(bars)
  if (!stats) return null

  return (
    <Card>
      <CardHeader title="Range statistics" subtitle={`Computed from the ${range} candles on screen`} />
      <div className="mt-3 grid grid-cols-1 2xl:grid-cols-2 gap-x-5 gap-y-2.5">
        <Fact label={`${range} high`} value={fmtNum(stats.high, 2)} />
        <Fact label={`${range} low`} value={fmtNum(stats.low, 2)} />
        <Fact label="Last close" value={fmtNum(stats.last, 2)} />
        <Fact label="Avg volume" value={`${fmtNum(stats.avgVolume / 1e6, 1)}M`} />
      </div>

      <div className="mt-4 pt-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-between text-[10.5px] text-zinc-500 mb-2 num font-mono">
          <span>{fmtNum(stats.low, 2)}</span>
          <span className="uppercase tracking-wide">{range} range</span>
          <span>{fmtNum(stats.high, 2)}</span>
        </div>
        <div className="relative h-1.5 bg-white/[0.07] rounded-full">
          <span
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-400"
            style={{ left: `${Math.min(100, Math.max(0, stats.positionInRange))}%` }}
          />
        </div>
      </div>
    </Card>
  )
}

export default function OverviewTab({ symbol, position, details, detailsLoading, bars, range, fundamentals }) {
  return (
    <div className="space-y-4">
      {position ? <PositionCard position={position} /> : null}

      <SnapshotSection fundamentals={fundamentals} />
      <ReferenceStrip symbol={symbol} details={details} isLoading={detailsLoading} />

      <RangeStatsCard bars={bars} range={range} />
    </div>
  )
}
