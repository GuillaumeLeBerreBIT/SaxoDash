import { fmtEur, fmtNum, fmtPct } from '../../lib/format'
import { rangeStats } from '../../lib/research'
import { Card, CardHeader } from '../ui'
import ComingSoon from './ComingSoon'

function Metric({ label, value, tone = 'text-zinc-100', hint }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">{label}</div>
      <div className={`text-[15px] num font-mono mt-1 ${tone}`}>{value}</div>
      {hint ? <div className="text-[11px] text-zinc-500 mt-0.5 num font-mono">{hint}</div> : null}
    </div>
  )
}

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
      <CardHeader title="Your position" subtitle="Live from your synced portfolio" />
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Metric label="Quantity" value={fmtNum(position.qty)} />
        <Metric label="Avg buy" value={fmtEur(position.avg_cost)} />
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

function InstrumentCard({ symbol, details, isLoading }) {
  return (
    <Card>
      <CardHeader
        title={details?.description || symbol}
        subtitle="Instrument reference data from Saxo"
        right={details?.isin ? <span className="text-[10.5px] num font-mono text-zinc-500">{details.isin}</span> : null}
      />
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
        {isLoading ? (
          <span className="text-[12px] text-zinc-500">Loading…</span>
        ) : (
          <>
            <Fact label="Symbol" value={details?.symbol || symbol} />
            <Fact label="Exchange" value={details?.exchange_name || details?.exchange} />
            <Fact label="Currency" value={details?.currency} />
            <Fact label="Asset type" value={details?.asset_type} />
            <Fact label="Uic" value={details?.uic} />
            <Fact label="Lot size" value={details?.lot_size} />
          </>
        )}
      </div>
    </Card>
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

export default function OverviewTab({ symbol, position, details, detailsLoading, bars, range }) {
  return (
    <div className="space-y-4">
      {position ? <PositionCard position={position} /> : null}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
        <InstrumentCard symbol={symbol} details={details} isLoading={detailsLoading} />
        <RangeStatsCard bars={bars} range={range} />
      </div>

      <ComingSoon feature="Company fundamentals" height={170} />
    </div>
  )
}
