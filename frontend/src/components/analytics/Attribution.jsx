import { Link } from 'react-router-dom'

import { Card } from '../ui'
import { fmtNum, fmtPct, pctTone } from '../../lib/format'
import { researchHref } from '../../lib/research'

const TONE_TEXT = { positive: 'text-up', negative: 'text-down', neutral: 'text-ink-2' }

/** Each holding's share of the total gain - computed here from positions
 *  the app already fetches, not a separate backend round trip. */
export default function Attribution({ positions, className = '' }) {
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
    <Card
      className={className}
      context="Contribution of each holding to total portfolio return"
      dot="ok"
      title="Return attribution"
      right={
        <span className="text-[13px] font-semibold num text-ink-2">
          Total {fmtPct(totalCost ? (totalPnl / totalCost) * 100 : null, { decimals: 1 })}
        </span>
      }
    >
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.ticker} className="grid items-center gap-3" style={{ gridTemplateColumns: '58px 1fr 74px 62px' }}>
            <Link to={researchHref(r.ticker)} className="text-[13.5px] font-semibold text-ink hover:underline">
              {r.ticker}
            </Link>
            <div className="h-5 relative bg-track rounded">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <div
                className={`absolute inset-y-0.5 rounded-sm ${r.contribution >= 0 ? 'bg-up' : 'bg-down'}`}
                style={
                  r.contribution >= 0
                    ? { left: '50%', width: `${(r.contribution / maxAbs) * 48}%` }
                    : { right: '50%', width: `${(Math.abs(r.contribution) / maxAbs) * 48}%` }
                }
              />
            </div>
            <span className={`text-[12px] font-semibold num text-right ${TONE_TEXT[pctTone(r.contribution, 1)]}`}>
              {fmtPct(r.contribution, { decimals: 1 })} pp
            </span>
            <span className="text-[12px] num text-ink-3 text-right">{fmtNum(r.shareOfGain, 0)}%</span>
          </div>
        ))}
      </div>
      {top && (
        <p className="mt-3 pt-3 border-t border-line text-[12px] text-ink-3">
          {top.ticker} alone produced {fmtNum(top.shareOfGain, 0)}% of the total gain — concentration risk sits in one name.
        </p>
      )}
    </Card>
  )
}
