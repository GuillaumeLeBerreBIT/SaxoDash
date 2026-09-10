import { Link } from 'react-router-dom'

import { fmtEur, fmtPct } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { Card, CardHeader } from '../ui'

function Row({ r }) {
  const up = Number(r.pnl_pct) >= 0
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <Link
        to={researchHref(r.ticker)}
        className="text-[12.5px] font-medium text-zinc-100 hover:text-blue-300"
      >
        {r.ticker}
      </Link>
      <div className="flex items-center gap-2">
        <span className={`text-[12px] num font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmtPct(r.pnl_pct, { decimals: 1 })}
        </span>
        <span className="text-[11px] num font-mono text-zinc-600">
          {fmtEur(r.pnl, { sign: true, decimals: 0 })}
        </span>
      </div>
    </div>
  )
}

export default function MoversCard({ movers }) {
  const empty = movers.best.length === 0 && movers.worst.length === 0
  return (
    <Card>
      <CardHeader title="Movers" subtitle="By all-time return" />
      {empty ? (
        <p className="mt-3 text-[12px] text-zinc-500">No holdings to compare yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-x-6">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Gainers</div>
            {movers.best.map((r) => <Row key={r.ticker} r={r} />)}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">Losers</div>
            {movers.worst.map((r) => <Row key={r.ticker} r={r} />)}
          </div>
        </div>
      )}
    </Card>
  )
}
