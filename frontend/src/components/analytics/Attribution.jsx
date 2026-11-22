import { Link } from 'react-router-dom'

import { Card } from '../ui'
import { fmtNum, fmtPct, pctTone } from '../../lib/format'
import { researchHref } from '../../lib/research'
import ChartLink from '../ChartLink'

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
  const gained = totalPnl > 0
  const top = rows[0]
  const worst = rows[rows.length - 1]
  const points = (value) => `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)} pts`
  const footnote =
    gained && top?.pnl > 0
      ? `${top.ticker} alone produced ${fmtNum(top.shareOfGain, 0)}% of the total gain.`
      : !gained && worst?.pnl < 0
        ? `${worst.ticker} is the largest loss, taking ${Math.abs(worst.contribution).toFixed(1)} points off the total return.`
        : null

  return (
    <Card
      className={className}
      context={gained ? 'Points of total return from each holding, and its share of the gain' : 'Points of total return from each holding'}
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
          <div key={r.ticker} className="grid items-center gap-3" style={{ gridTemplateColumns: gained ? '88px 1fr 74px 48px' : '88px 1fr 74px' }}>
            <span className="flex items-center gap-1 min-w-0">
              <Link to={researchHref(r.ticker)} className="text-[13.5px] font-semibold text-ink hover:underline">
                {r.ticker}
              </Link>
              <ChartLink symbol={r.ticker} />
            </span>
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
              {points(r.contribution)}
            </span>
            {gained && <span className="text-[12px] num text-ink-3 text-right">{fmtNum(r.shareOfGain, 0)}%</span>}
          </div>
        ))}
      </div>
      {footnote && <p className="mt-3 pt-3 border-t border-line text-[12px] text-ink-3">{footnote}</p>}
    </Card>
  )
}
