import { useMemo } from 'react'

import { PERFORMANCE_CAPS, performanceFill } from '../../lib/charts'
import { fmtPct } from '../../lib/format'
import { useChartColors } from '../../theme/useChartColors'
import { breadth, sortByMove } from '../../lib/heatmap'
import { moveLabel } from '../../lib/pricing'
import HeatTile from '../heatmap/HeatTile'

export default function WatchlistHeatmap({ items, quotes, symbol, heldSymbols, onSelectSymbol }) {
  const c = useChartColors()
  const sorted = useMemo(() => sortByMove(items, quotes), [items, quotes])
  const counts = breadth(items.map((item) => quotes.get(item.uic)?.change_pct ?? null))

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-3.5 h-[30px] text-[12px] text-ink-3 border-b border-line">
        <span className="min-w-0 truncate">{moveLabel(quotes.values())} · by move</span>
        <span
          className="shrink-0 whitespace-nowrap num"
          aria-label={`${counts.up} up, ${counts.down} down`}
        >
          <span className="text-up">▲ {counts.up}</span>{' '}
          <span className="text-down">▼ {counts.down}</span>
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1 p-2">
        {sorted.map((item) => {
          const change = quotes.get(item.uic)?.change_pct ?? null
          const held = heldSymbols.has(item.symbol)
          const label = `${item.symbol} ${fmtPct(change, { decimals: 1 })}${held ? ', in portfolio' : ''}`
          return (
            <HeatTile
              key={item.id}
              ticker={item.symbol}
              pct={change}
              fill={performanceFill(change, { cap: PERFORMANCE_CAPS.day }, c)}
              active={item.symbol === symbol}
              marker={held ? <span className="w-1.5 h-1.5 rounded-full bg-held" /> : null}
              aria-label={label}
              title={label}
              className="h-12"
              onClick={() => onSelectSymbol(item.symbol, { uic: item.uic, assetType: item.asset_type })}
            />
          )
        })}
      </div>
    </>
  )
}
