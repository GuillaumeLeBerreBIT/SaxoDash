import { useState } from 'react'
import { Link } from 'react-router-dom'

import AllocationDonut from '../AllocationDonut'
import StockLogo from '../StockLogo'
import { Segmented } from '../ui'
import ChangeBadge from './ChangeBadge'
import HoldingsTable from './HoldingsTable'
import WeightBar from './WeightBar'
import { OptionBadge, YouBadge } from './HoldingBadges'
import { fmtPct } from '../../lib/format'
import {
  TOP10_VIEWS, donutSlices, fmtUsdCompact, holdingLabel, positionCount, readTop10View, remainder, topTen, writeTop10View,
} from '../../lib/investors'
import { researchHref } from '../../lib/research'
import { useChartColors } from '../../theme/useChartColors'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })
const VIEW_OPTIONS = TOP10_VIEWS.map(([value, label]) => ({ value, label }))

function HoldingTile({ holding, max }) {
  return (
    <div
      data-testid="holding-tile"
      className={`relative bg-tile rounded-[10px] px-3 py-3 flex flex-col gap-2 min-w-0 ${holding.ticker ? 'hover:bg-hover transition-colors' : ''}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <StockLogo ticker={holding.ticker} label={holdingLabel(holding)} size={28} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {holding.ticker ? (
              <Link
                to={researchHref(holding.ticker)}
                className="font-bold text-ink truncate after:absolute after:inset-0 after:rounded-[10px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus"
              >
                {holding.ticker}
              </Link>
            ) : (
              <span className="font-bold text-ink truncate">{holding.issuer}</span>
            )}
            <OptionBadge putCall={holding.put_call} />
          </div>
          {holding.ticker && <div className="text-[12px] text-ink-3 truncate">{holding.issuer}</div>}
        </div>
      </div>
      <div className="text-[20px] font-bold tracking-[-0.01em] num text-ink">{share(holding.weight)}</div>
      <WeightBar weight={holding.weight} max={max} />
      <div className="flex items-center justify-between gap-1 flex-wrap text-[12px]">
        <span className="num text-ink-2">{fmtUsdCompact(holding.value)}</span>
        <ChangeBadge change={holding.change} pct={holding.shares_change_pct} />
      </div>
      <YouBadge owned={holding.owned} watched={holding.watched} />
    </div>
  )
}

function Grid({ holdings }) {
  const max = Math.max(0, ...holdings.map((h) => h.weight))
  return (
    <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
      {holdings.map((h) => <HoldingTile key={`${h.cusip}-${h.put_call}`} holding={h} max={max} />)}
    </div>
  )
}

function Donut({ detail }) {
  const c = useChartColors()
  const slices = donutSlices(detail, c)
  const center = (active) =>
    active
      ? { label: active.name, value: share(active.weight), hint: fmtUsdCompact(active.value) }
      : { label: 'Total value', value: fmtUsdCompact(detail.total_value), hint: positionCount(detail.positions) }
  return <AllocationDonut items={slices} formatValue={(v) => fmtUsdCompact(v)} center={center} height="300px" />
}

export default function TopHoldings({ detail }) {
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
        <h3 className="text-[14px] font-bold text-ink">Top 10 holdings</h3>
        <Segmented label="Top 10 view" options={VIEW_OPTIONS} value={view} onChange={choose} />
      </div>
      {view === 'grid' && <Grid holdings={holdings} />}
      {view === 'donut' && <Donut detail={detail} />}
      {view === 'list' && <HoldingsTable holdings={holdings} showChange={detail.previous_quarter != null} />}
      <p className="text-[12px] text-ink-3 num">
        {rest
          ? `Remaining ${positionCount(rest.count)}: ${share(rest.weight)} · ${fmtUsdCompact(rest.value)}`
          : `That's the whole portfolio: ${positionCount(detail.positions)}.`}
      </p>
    </div>
  )
}
