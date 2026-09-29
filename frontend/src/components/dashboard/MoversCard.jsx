import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { fmtEur, fmtPct } from '../../lib/format'
import { dayMoves, rankDayMoves } from '../../lib/heatmap'
import { moveLabel } from '../../lib/pricing'
import { researchHref } from '../../lib/research'
import { Card, CardHeader, TBtn } from '../ui'

const NO_POSITIONS = []
const NO_QUOTES = new Map()

function Row({ ticker, pct, eur, instrument }) {
  const up = Number(pct) >= 0
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <Link
        to={researchHref(ticker, undefined, instrument)}
        className="text-[var(--fig-sm)] font-medium text-zinc-100 hover:text-blue-300"
      >
        {ticker}
      </Link>
      <div className="flex items-center gap-2">
        <span className={`text-[var(--fig-xs)] num font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {fmtPct(pct, { decimals: 1 })}
        </span>
        <span className="text-[var(--fig-2xs)] num font-mono text-zinc-600">
          {fmtEur(eur, { sign: true, decimals: 0 })}
        </span>
      </div>
    </div>
  )
}

function Column({ title, rows }) {
  return (
    <div>
      <div className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-600 mb-1">{title}</div>
      {rows.map((row) => <Row key={row.ticker} {...row} />)}
    </div>
  )
}

const sincePurchaseRows = (rows) => rows.map((r) => ({ ticker: r.ticker, pct: r.pnl_pct, eur: r.pnl }))
const dayRows = (moves) => moves.map((m) => ({
  ticker: m.position.ticker,
  pct: m.changePct,
  eur: m.impactEur,
  instrument: { uic: m.position.uic, assetType: m.position.asset_type },
}))

export default function MoversCard({ movers, positions = NO_POSITIONS, quotes = NO_QUOTES }) {
  const [metric, setMetric] = useState('sincePurchase')
  const dayLabel = moveLabel(quotes.values())
  const today = useMemo(() => rankDayMoves(dayMoves(positions, quotes)), [positions, quotes])

  const rows =
    metric === 'day'
      ? { best: dayRows(today.best), worst: dayRows(today.worst) }
      : { best: sincePurchaseRows(movers.best), worst: sincePurchaseRows(movers.worst) }
  const empty = rows.best.length === 0 && rows.worst.length === 0
  const subtitle =
    metric === 'sincePurchase'
      ? 'Unrealized return vs. average cost'
      : dayLabel === 'Today'
        ? 'Price move today'
        : 'Latest session, from daily bars'

  return (
    <Card>
      <CardHeader title="Movers" subtitle={subtitle} />
      <div className="flex items-center gap-0.5 mt-2">
        <TBtn active={metric === 'day'} onClick={() => setMetric('day')}>
          <span className="whitespace-nowrap">{dayLabel}</span>
        </TBtn>
        <TBtn active={metric === 'sincePurchase'} onClick={() => setMetric('sincePurchase')}>
          <span className="whitespace-nowrap">Since purchase</span>
        </TBtn>
      </div>
      {empty ? (
        <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">
          {metric === 'day' ? 'No price moves available yet.' : 'No holdings to compare yet.'}
        </p>
      ) : (
        // Stacked, not side-by-side: this card now sits in a narrower
        // one-third column on Dashboard (previously it had half the page),
        // and a ticker + % + € row needs more width than a two-up layout
        // leaves it there.
        <div className="mt-3 space-y-4">
          <Column title="Gainers" rows={rows.best} />
          <Column title="Losers" rows={rows.worst} />
        </div>
      )}
    </Card>
  )
}
