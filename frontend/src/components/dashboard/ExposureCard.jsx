import { SECTOR_PALETTE } from '../../lib/charts'
import { Card, CardHeader } from '../ui'

function Legend({ rows, nameKey }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
      {rows.map((r, i) => (
        <div key={r[nameKey]} className="flex items-center gap-1.5 text-[var(--fig-xs)]">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: SECTOR_PALETTE[i % SECTOR_PALETTE.length] }}
          />
          <span className="text-zinc-300">{r[nameKey]}</span>
          <span className="ml-auto text-zinc-500 num font-mono">{r.pct}%</span>
        </div>
      ))}
    </div>
  )
}

export default function ExposureCard({ currency, concentration }) {
  const c = concentration || {}
  const caption = [
    c.top3_pct != null && `Top 3: ${Math.round(c.top3_pct)}%`,
    c.hhi != null && `HHI ${c.hhi.toFixed(2)}`,
    c.positions != null && `${c.positions} position${c.positions === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card>
      <CardHeader title="Currency & concentration" subtitle="By value" />
      <div className="mt-3">
        {currency.length > 1 ? (
          <Legend rows={currency} nameKey="currency" />
        ) : currency.length === 1 ? (
          <p className="text-[var(--fig-xs)] text-zinc-500">100% {currency[0].currency}</p>
        ) : (
          <p className="text-[var(--fig-xs)] text-zinc-500">No holdings yet.</p>
        )}
      </div>
      {caption && <p className="mt-3 text-[var(--fig-2xs)] text-zinc-500">{caption}</p>}
    </Card>
  )
}
