import { fmtNum, fmtPct } from '../../lib/format'
import { SNAPSHOT_GROUPS } from '../../lib/snapshot'
import { Card, InfoTip } from '../ui'
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
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13.5px] font-bold text-ink">{group.label}</span>
        <VerdictBadge {...verdict} />
      </div>
      <dl className="mt-1.5">
        {group.metrics.map((m) => (
          <div key={m.field} className="flex items-baseline justify-between gap-3 py-0.5">
            <dt className="text-[13px] text-ink-2">{m.label}</dt>
            <dd className="text-[13px] num text-ink">{fmtField(data[m.field], m.fmt)}</dd>
          </div>
        ))}
      </dl>
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
        <Card
          context="Grouped reads from Finnhub fundamentals"
          dot="ok"
          title="Investment snapshot"
          right={
            <InfoTip>
              Growth reads TTM YoY revenue and EPS growth. Profitability reads ROE and net
              margin. Financial health reads debt/equity, current ratio and interest coverage.
              Valuation reads PEG and P/E against its own annual history. Momentum reads the
              1-year and YTD price return. No composite score.
            </InfoTip>
          }
        >
          <div className="divide-y divide-line">
            {SNAPSHOT_GROUPS.map((group) => (
              <Group key={group.key} group={group} data={data} />
            ))}
          </div>
        </Card>
      )}
    </FundamentalsGate>
  )
}
