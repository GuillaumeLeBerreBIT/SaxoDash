import { useState } from 'react'
import { Link } from 'react-router-dom'

import AllocationDonut from '../AllocationDonut'
import { InstrumentLogo, LetterAvatar, TBtn } from '../ui'
import ChangeBadge from './ChangeBadge'
import HoldingsTable from './HoldingsTable'
import WeightBar from './WeightBar'
import { OptionBadge, YouBadge } from './HoldingBadges'
import { fmtPct } from '../../lib/format'
import {
  TOP10_VIEWS, donutSlices, fmtUsdCompact, holdingLabel, readTop10View, remainder, topTen, writeTop10View,
} from '../../lib/investors'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

function HoldingTile({ holding, max }) {
  return (
    <div data-testid="holding-tile" className="bg-white/[0.02] border border-white/[0.06] rounded-md p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <InstrumentLogo
          symbol={holding.ticker}
          size={28}
          className="rounded"
          fallback={<LetterAvatar symbol={holdingLabel(holding)} size={28} />}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-semibold text-zinc-100 truncate">{holding.ticker ?? holding.issuer}</span>
            <OptionBadge putCall={holding.put_call} />
          </div>
          {holding.ticker && <div className="text-[var(--fig-2xs)] text-zinc-500 truncate">{holding.issuer}</div>}
        </div>
      </div>
      <div className="text-[var(--fig-lg)] num font-mono text-zinc-50">{share(holding.weight)}</div>
      <WeightBar weight={holding.weight} max={max} />
      <div className="flex items-center justify-between gap-1 flex-wrap text-[var(--fig-xs)]">
        <span className="num font-mono text-zinc-400">{fmtUsdCompact(holding.value)}</span>
        <ChangeBadge change={holding.change} pct={holding.shares_change_pct} />
      </div>
      <YouBadge owned={holding.owned} watched={holding.watched} />
    </div>
  )
}

function Grid({ holdings }) {
  const max = Math.max(0, ...holdings.map((h) => h.weight))
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
      {holdings.map((h) => <HoldingTile key={`${h.cusip}-${h.put_call}`} holding={h} max={max} />)}
    </div>
  )
}

function Donut({ detail }) {
  const slices = donutSlices(detail)
  const center = (active) =>
    active
      ? { label: active.name, value: share(active.weight), hint: fmtUsdCompact(active.value) }
      : { label: 'Total value', value: fmtUsdCompact(detail.total_value), hint: `${detail.positions} positions` }
  return <AllocationDonut items={slices} formatValue={(v) => fmtUsdCompact(v)} center={center} height="300px" />
}

export default function TopHoldings({ detail, slug }) {
  const [view, setView] = useState(readTop10View)
  const holdings = topTen(detail.holdings)
  const rest = remainder(detail)

  const choose = (next) => {
    setView(next)
    writeTop10View(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[var(--fig-sm)] font-medium text-zinc-200">Top 10 holdings</h3>
        <div role="group" aria-label="Top 10 view" className="flex items-center gap-0.5">
          {TOP10_VIEWS.map(([key, label]) => (
            <TBtn key={key} active={view === key} onClick={() => choose(key)}>{label}</TBtn>
          ))}
        </div>
      </div>
      {view === 'grid' && <Grid holdings={holdings} />}
      {view === 'donut' && <Donut detail={detail} />}
      {view === 'list' && <HoldingsTable holdings={holdings} showChange={detail.previous_quarter != null} />}
      <div className="flex items-center justify-between gap-3 flex-wrap text-[var(--fig-xs)] text-zinc-500">
        <span>
          {rest
            ? `Remaining ${rest.count} positions: ${share(rest.weight)} · ${fmtUsdCompact(rest.value)}`
            : `That's the whole portfolio: ${detail.positions} positions.`}
        </span>
        <Link to={`/investors/${slug}`} className="text-blue-400 hover:text-blue-300">Open full portfolio →</Link>
      </div>
    </div>
  )
}
