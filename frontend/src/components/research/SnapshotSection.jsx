import { fmtNum, fmtPct } from '../../lib/format'
import { SNAPSHOT_GROUPS } from '../../lib/snapshot'
import { Card, CardHeader, InfoTip } from '../ui'
import FundamentalsGate from './FundamentalsGate'
import VerdictBadge from './VerdictBadge'

function fmtField(value, fmt) {
  if (value == null) return '—'
  if (fmt === 'pct') return fmtPct(value, { sign: false, decimals: 1 })
  return fmtNum(value, 2)
}

function Group({ group, data }) {
  const verdict = group.verdict(data)
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">{group.label}</span>
        <VerdictBadge {...verdict} />
      </div>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        {group.metrics.map((m) => (
          <div key={m.field}>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide">{m.label}</div>
            <div className="text-[13px] num font-mono text-zinc-100 mt-0.5">{fmtField(data[m.field], m.fmt)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SnapshotSection({ fundamentals }) {
  return (
    <FundamentalsGate
      fundamentals={fundamentals}
      title="Investment snapshot"
      fallback="A snapshot needs company fundamentals, which are unavailable for this symbol."
    >
      {(data) => (
        <Card>
          <CardHeader
            title="Investment snapshot"
            subtitle="Grouped reads from Finnhub fundamentals"
            right={
              <InfoTip>
                Growth reads TTM YoY revenue and EPS growth. Profitability reads ROE and net
                margin. Financial health reads debt/equity, current ratio and interest coverage.
                Valuation reads PEG and P/E against its own annual history. Momentum reads the
                1-year and YTD price return. No composite score.
              </InfoTip>
            }
          />
          <div className="mt-2 divide-y divide-white/[0.06]">
            {SNAPSHOT_GROUPS.map((group) => (
              <Group key={group.key} group={group} data={data} />
            ))}
          </div>
        </Card>
      )}
    </FundamentalsGate>
  )
}
