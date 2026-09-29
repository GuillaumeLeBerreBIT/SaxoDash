import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useSize } from '../../lib/chartGeometry'
import { PERFORMANCE_CAPS, performanceFill } from '../../lib/charts'
import { fmtEur, fmtNum, fmtPct } from '../../lib/format'
import {
  SECTOR_HEADER,
  dayMoves,
  daySummary,
  labelLevel,
  layoutPortfolio,
  sincePurchaseSummary,
} from '../../lib/heatmap'
import { LAST_SESSION_NOTE, moveLabel } from '../../lib/pricing'
import { researchHref } from '../../lib/research'
import { Card, CardHeader, TBtn } from '../ui'
import HeatTile from '../heatmap/HeatTile'
import ScaleLegend from '../heatmap/ScaleLegend'

const FALLBACK_HEIGHT = 280
const TILE_GAP = 2
const signedEur = (value) => fmtEur(value, { sign: true, decimals: 0 })

function tileTitle(position, sector, move, dayLabel) {
  const impact = move.impactEur == null ? '' : ` (≈ ${signedEur(move.impactEur)} price move)`
  return [
    `${position.ticker} · ${position.name} · ${sector}`,
    `${fmtEur(position.value)} · ${fmtPct(position.weight, { sign: false, decimals: 1 })} of portfolio`,
    `${dayLabel} ${fmtPct(move.changePct, { decimals: 1 })}${impact}`,
    `Since purchase ${fmtPct(position.pnl_pct, { decimals: 1 })}`,
  ].join('\n')
}

function dayTone(impactEur) {
  if (Math.round(impactEur) === 0) return 'text-zinc-300'
  return impactEur > 0 ? 'text-emerald-400' : 'text-red-400'
}

function DayLine({ summary, label, coverage }) {
  if (!summary) return 'No price moves available yet.'
  return (
    <>
      {label}{' '}
      <span className={dayTone(summary.impactEur)}>
        {signedEur(summary.impactEur)} ({fmtPct(summary.pct, { decimals: 1 })})
      </span>
      {' · biggest driver '}
      <span className="text-zinc-300">
        {summary.driver.position.ticker} {signedEur(summary.driver.impactEur)}
      </span>
      {coverage && coverage.priced < coverage.total ? ` · ${coverage.priced} of ${coverage.total} priced` : null}
    </>
  )
}

function SincePurchaseLine({ summary }) {
  if (!summary || (!summary.contributor && !summary.drag)) return 'No gains or losses yet.'
  const { contributor, drag } = summary
  return (
    <>
      {contributor ? (
        <>
          Biggest contributor{' '}
          <span className="text-emerald-400">
            {contributor.ticker} {signedEur(contributor.pnl)}
          </span>
        </>
      ) : null}
      {drag ? (
        <>
          {contributor ? ' · biggest drag ' : 'Biggest drag '}
          <span className="text-red-400">
            {drag.ticker} {signedEur(drag.pnl)}
          </span>
        </>
      ) : null}
    </>
  )
}

export default function PortfolioHeatmap({ positions, quotes }) {
  const [metric, setMetric] = useState('day')
  const [ref, size] = useSize()
  const height = size.height || FALLBACK_HEIGHT
  const layout = useMemo(
    () => layoutPortfolio(positions, { width: size.width, height }),
    [positions, size.width, height],
  )
  const moves = useMemo(
    () => new Map(dayMoves(positions, quotes).map((move) => [move.position.ticker, move])),
    [positions, quotes],
  )
  const dayLabel = moveLabel(quotes.values())
  const cap = metric === 'day' ? PERFORMANCE_CAPS.day : PERFORMANCE_CAPS.sincePurchase
  const coverage = {
    priced: layout.tiles.filter((tile) => moves.get(tile.position.ticker)?.impactEur != null).length,
    total: layout.tiles.length,
  }

  return (
    <Card>
      <CardHeader title="Allocation & movement" subtitle="Sized by value, grouped by sector" />
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <ScaleLegend cap={cap} />
        <div className="flex items-center gap-0.5">
          <TBtn active={metric === 'day'} onClick={() => setMetric('day')}>
            <span className="whitespace-nowrap">{dayLabel}</span>
          </TBtn>
          <TBtn active={metric === 'sincePurchase'} onClick={() => setMetric('sincePurchase')}>
            <span className="whitespace-nowrap">Since purchase</span>
          </TBtn>
        </div>
      </div>
      <p className="mt-2 text-[var(--fig-xs)] text-zinc-500 num">
        {metric === 'day' ? (
          <DayLine summary={daySummary([...moves.values()])} label={dayLabel} coverage={coverage} />
        ) : (
          <SincePurchaseLine summary={sincePurchaseSummary(positions)} />
        )}
      </p>
      {metric === 'day' && dayLabel !== 'Today' ? (
        <p className="mt-1 text-[var(--fig-2xs)] text-amber-400/80">{LAST_SESSION_NOTE}</p>
      ) : null}

      <div ref={ref} className="relative mt-3 h-[220px] md:h-[280px]">
        {layout.tiles.length === 0 ? (
          <p className="text-[var(--fig-xs)] text-zinc-500">No holdings yet.</p>
        ) : null}
        {layout.sectors
          .filter((sector) => sector.headed)
          .map((sector) => (
            <div
              key={sector.sector}
              className="absolute px-1.5 truncate text-[var(--fig-2xs)] text-zinc-400"
              style={{
                left: sector.x,
                top: sector.y,
                width: sector.width,
                height: SECTOR_HEADER,
                lineHeight: `${SECTOR_HEADER}px`,
              }}
            >
              {sector.sector} · {fmtNum(sector.pct, 0)}%
            </div>
          ))}
        {layout.tiles.map((tile) => {
          const position = tile.position
          const move = moves.get(position.ticker)
          const pct = metric === 'day' ? move.changePct : position.pnl_pct
          const width = Math.max(0, tile.width - TILE_GAP)
          const tileHeight = Math.max(0, tile.height - TILE_GAP)
          const title = tileTitle(position, tile.sector, move, dayLabel)
          return (
            <HeatTile
              key={position.ticker}
              as={Link}
              to={researchHref(position.ticker, undefined, { uic: position.uic, assetType: position.asset_type })}
              ticker={position.ticker}
              pct={pct}
              fill={performanceFill(pct, { cap })}
              level={labelLevel(width, tileHeight)}
              title={title}
              aria-label={title.replaceAll('\n', ', ')}
              className="absolute"
              style={{ left: tile.x + TILE_GAP / 2, top: tile.y + TILE_GAP / 2, width, height: tileHeight }}
            />
          )
        })}
      </div>
    </Card>
  )
}
