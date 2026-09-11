import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { chartTooltipProps, SECTOR_PALETTE } from '../../lib/charts'
import { fmtEur } from '../../lib/format'
import { Card, CardHeader } from '../ui'

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
        <div key={r[nameKey]} className="flex items-center gap-1.5 text-[11.5px]">
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
        {sector.length > 0 ? (
          <>
            <Donut data={sector} nameKey="name" />
            <Legend rows={sector} nameKey="name" />
          </>
        ) : (
          <p className="text-[12px] text-zinc-500">No holdings yet.</p>
        )}
      </div>
      {currency.length > 1 ? (
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <Legend rows={currency} nameKey="currency" />
        </div>
      ) : currency.length === 1 ? (
        <div className="mt-3 pt-3 border-t border-white/[0.06] text-[11.5px] text-zinc-500">
          100% {currency[0].currency}
        </div>
      ) : null}
      {caption && <p className="mt-3 text-[11px] text-zinc-500">{caption}</p>}
    </Card>
  )
}
