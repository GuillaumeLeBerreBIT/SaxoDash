import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { fmtEur } from '../../lib/format'
import { dayMoves, rankDayMoves } from '../../lib/heatmap'
import { moveLabel } from '../../lib/pricing'
import { researchHref } from '../../lib/research'
import { Card, Move, Segmented } from '../ui'

const NO_POSITIONS = []
const NO_QUOTES = new Map()

function Row({ ticker, pct, eur, instrument }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-9 border-t border-line first:border-t-0">
      <Link
        to={researchHref(ticker, undefined, instrument)}
        className="text-[13.5px] font-semibold text-ink hover:underline"
      >
        {ticker}
      </Link>
      <div className="flex items-center gap-2">
        <Move value={pct} digits={1} className="text-[13px] font-semibold" />
        <span className="text-[12px] num text-ink-3">{fmtEur(eur, { sign: true, decimals: 0 })}</span>
      </div>
    </div>
  )
}

function Column({ title, rows }) {
  if (rows.length === 0) return null
  return (
    <div>
      <div className="text-[12px] font-medium text-ink-3 mb-1">{title}</div>
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
    <Card context={subtitle} dot={empty ? 'off' : 'ok'} title="Movers">
      <Segmented
        label="Movers metric"
        options={[
          { value: 'day', label: dayLabel },
          { value: 'sincePurchase', label: 'Since purchase' },
        ]}
        value={metric}
        onChange={setMetric}
      />
      {empty ? (
        <p className="mt-3 text-[13px] text-ink-3">
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
