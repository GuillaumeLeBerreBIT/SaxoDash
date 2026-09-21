import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { chartTooltipProps, SECTOR_PALETTE } from '../../lib/charts'
import { fmtEur } from '../../lib/format'
import { Card, CardHeader } from '../ui'

const MAX_SECTOR_SLICES = 5

/** Caps the sector donut at 5 slices + "Other" - the same top-N+Other rule
 *  every AllocationDonut caller already applies to holdings. Recharts draws
 *  every row it's handed with no built-in limit, so an 8+ sector portfolio
 *  would otherwise degrade into unreadable slivers. */
function topSectorsWithOther(sector) {
  if (sector.length <= MAX_SECTOR_SLICES) return sector
  const sorted = [...sector].sort((a, b) => Number(b.value) - Number(a.value))
  const top = sorted.slice(0, MAX_SECTOR_SLICES)
  const rest = sorted.slice(MAX_SECTOR_SLICES)
  return [
    ...top,
    {
      name: 'Other',
      value: rest.reduce((sum, r) => sum + Number(r.value), 0),
      pct: Math.round(rest.reduce((sum, r) => sum + Number(r.pct), 0) * 10) / 10,
    },
  ]
}

function Donut({ data, nameKey }) {
  return (
    <div className="h-[150px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data} dataKey="value" nameKey={nameKey} innerRadius={38} outerRadius={62}
            paddingAngle={2} stroke="#18181b" strokeWidth={2} isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={SECTOR_PALETTE[i % SECTOR_PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip {...chartTooltipProps} formatter={(v, n) => [fmtEur(v), n]} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

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

export default function ExposureCard({ sector, currency, concentration }) {
  const c = concentration || {}
  const cappedSector = topSectorsWithOther(sector)
  const caption = [
    c.top3_pct != null && `Top 3: ${Math.round(c.top3_pct)}%`,
    c.hhi != null && `HHI ${c.hhi.toFixed(2)}`,
    c.positions != null && `${c.positions} position${c.positions === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card>
      <CardHeader title="Exposure" subtitle="Sector and currency, by value" />
      <div className="mt-2">
        {cappedSector.length > 0 ? (
          <>
            <Donut data={cappedSector} nameKey="name" />
            <Legend rows={cappedSector} nameKey="name" />
          </>
        ) : (
          <p className="text-[var(--fig-xs)] text-zinc-500">No holdings yet.</p>
        )}
      </div>
      {currency.length > 1 ? (
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <Legend rows={currency} nameKey="currency" />
        </div>
      ) : currency.length === 1 ? (
        <div className="mt-3 pt-3 border-t border-white/[0.06] text-[var(--fig-xs)] text-zinc-500">
          100% {currency[0].currency}
        </div>
      ) : null}
      {caption && <p className="mt-3 text-[var(--fig-2xs)] text-zinc-500">{caption}</p>}
    </Card>
  )
}
