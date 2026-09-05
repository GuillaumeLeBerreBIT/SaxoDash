import { Card, CardHeader } from '../ui'
import { fmtNum, fmtPct } from '../../lib/format'

/** Each holding's share of the total gain - computed here from positions
 *  the app already fetches, not a separate backend round trip. */
export default function Attribution({ positions }) {
  const totalCost = positions.reduce((sum, p) => sum + Number(p.cost), 0)
  const totalPnl = positions.reduce((sum, p) => sum + Number(p.pnl), 0)

  const rows = positions
    .map((p) => ({
      ticker: p.ticker,
      pnl: Number(p.pnl),
      contribution: totalCost ? (Number(p.pnl) / totalCost) * 100 : 0,
      shareOfGain: totalPnl ? (Number(p.pnl) / totalPnl) * 100 : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl)

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.contribution)), 1)
  const top = rows[0]

  return (
    <Card>
      <CardHeader
        title="Return attribution"
        subtitle="Contribution of each holding to total portfolio return"
        right={
          <span className="text-[11px] num text-zinc-400">
            Total {fmtPct(totalCost ? (totalPnl / totalCost) * 100 : null, { decimals: 1 })}
          </span>
        }
      />
      <div className="mt-4 space-y-3">
        {rows.map((r) => (
          <div key={r.ticker} className="grid items-center gap-3" style={{ gridTemplateColumns: '58px 1fr 74px 62px' }}>
            <span className="text-[12.5px] font-medium text-zinc-100">{r.ticker}</span>
            <div className="h-5 relative bg-white/[0.03] rounded">
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
              <div
                className={`absolute inset-y-0.5 rounded-sm ${r.contribution >= 0 ? 'bg-emerald-500/70' : 'bg-red-500/70'}`}
                style={
                  r.contribution >= 0
                    ? { left: '50%', width: `${(r.contribution / maxAbs) * 48}%` }
                    : { right: '50%', width: `${(Math.abs(r.contribution) / maxAbs) * 48}%` }
                }
              />
            </div>
            <span className={`text-[12px] num text-right ${r.contribution >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtPct(r.contribution, { decimals: 1 })} pp
            </span>
            <span className="text-[11.5px] num text-zinc-500 text-right">{fmtNum(r.shareOfGain, 0)}%</span>
          </div>
        ))}
      </div>
      {top && (
        <div className="mt-3 pt-3 border-t border-white/[0.06] text-[11px] text-zinc-500">
          {top.ticker} alone produced {fmtNum(top.shareOfGain, 0)}% of the total gain — concentration risk sits in one name.
        </div>
      )}
    </Card>
  )
}
