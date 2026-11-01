import { fmtCompact } from '../../lib/format'
import { Card, InfoTip } from '../ui'

export default function CapitalStructureCard({ fundamentals, className = '' }) {
  const { market_cap: cap, enterprise_value: enterprise } = fundamentals
  if (cap == null || enterprise == null) return null

  const netDebt = enterprise - cap
  const rows = [
    ['Market cap', fmtCompact(cap)],
    [netDebt >= 0 ? 'Net debt' : 'Net cash', fmtCompact(Math.abs(netDebt))],
    ['Enterprise value', fmtCompact(enterprise)],
  ]

  return (
    <Card
      className={className}
      context="Market cap plus debt, less cash, is enterprise value"
      dot="ok"
      title="Capital structure"
      right={
        <InfoTip>
          Net debt here is enterprise value minus market cap. Finnhub reports the two figures separately and they
          can be a day or two apart, so treat it as approximate.
        </InfoTip>
      }
    >
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-2 border-t border-line first:border-t-0">
            <dt className="text-[13px] text-ink-2">{label}</dt>
            <dd className="text-[13.5px] font-semibold num text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
