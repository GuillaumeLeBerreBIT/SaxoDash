import { Link } from 'react-router-dom'

import { quarterLabel } from '../../lib/investors'
import { changeLabel, fmtSharesCompact, ownershipTicker, sharesChange } from '../../lib/ownership'
import { researchHref } from '../../lib/research'
import { Card, InstrumentLogo } from '../ui'

const SHOWN = 5

function rankedRows(positions, stocks) {
  const unique = [...new Map(positions.map((p) => [p.ticker, p])).values()]
  return unique
    .map((p) => {
      const key = ownershipTicker(p)
      return { position: p, change: key ? sharesChange(stocks?.[key]) : null }
    })
    .sort((a, b) => (b.change?.shares ?? -1) - (a.change?.shares ?? -1))
    .slice(0, SHOWN)
}

function NetChange({ change, quarter }) {
  if (!change) return <span className="num text-ink-3">—</span>
  const up = change.direction === 'up'
  return (
    <span className={`num font-semibold whitespace-nowrap ${up ? 'text-up' : 'text-down'}`} title={changeLabel(change, quarter)}>
      {up ? '▲' : '▼'} {up ? '+' : '−'}
      {fmtSharesCompact(change.shares)}
    </span>
  )
}

export default function SmartMoney({ positions, ownership, className = '' }) {
  const quarter = ownership?.quarter
  const rows = rankedRows(positions, ownership?.stocks)
  return (
    <Card
      className={className}
      context={quarter ? `13F · ${quarterLabel(quarter)} · net shares, tracked funds` : '13F · tracked funds'}
      dot={ownership ? 'ok' : 'off'}
      title="Smart money"
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-3">No holdings yet.</p>
      ) : (
        <ul>
          {rows.map(({ position, change }) => (
            <li key={position.ticker} className="border-t border-line first:border-t-0">
              <Link
                to={researchHref(position.ticker, 'funds')}
                className="flex items-center gap-3 min-h-11 py-1.5 -mx-2 px-2 rounded-lg hover:bg-hover"
              >
                <InstrumentLogo symbol={position.ticker} />
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[13.5px] font-semibold text-ink">{position.ticker}</span>{' '}
                  <span className="text-[12px] text-ink-3">{(position.name || '').split(' ')[0]}</span>
                </span>
                <NetChange change={change} quarter={quarter} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-ink-3">Trades inside the quarter are not visible in a 13F.</p>
    </Card>
  )
}
