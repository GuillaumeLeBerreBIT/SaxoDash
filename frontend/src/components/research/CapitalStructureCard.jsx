import { fmtCompact } from '../../lib/format'
import { Card, CardHeader } from '../ui'

export default function CapitalStructureCard({ fundamentals }) {
  const { market_cap: cap, enterprise_value: enterprise } = fundamentals
  if (cap == null || enterprise == null) return null

  const netDebt = enterprise - cap
  const rows = [
    ['Market cap', fmtCompact(cap)],
    [netDebt >= 0 ? 'Net debt' : 'Net cash', fmtCompact(Math.abs(netDebt))],
    ['Enterprise value', fmtCompact(enterprise)],
  ]

  return (
    <Card>
      <CardHeader title="Capital structure" subtitle="Market cap plus debt, less cash, is enterprise value" />
      <dl className="mt-4 grid grid-cols-3 gap-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-500 font-medium">{label}</dt>
            <dd className="mt-1 text-[var(--fig-md)] num font-mono text-zinc-100">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
