import { Link } from 'react-router-dom'

import { fmtEur, fmtNum } from '../../lib/format'
import { WEIGHT_CAP_PCT } from '../../lib/portfolioStats'
import { moveLabel } from '../../lib/pricing'
import { researchHref } from '../../lib/research'
import { Card, InstrumentLogo, Move, Td, Th, Tile, Tr } from '../ui'

function PortfolioValueSub({ pnlPct }) {
  if (pnlPct == null) return '—'
  return (
    <>
      <Move value={pnlPct} /> since purchase
    </>
  )
}

function Identity({ position }) {
  return (
    <>
      <InstrumentLogo symbol={position.ticker} />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-ink">{position.name || position.ticker}</span>
        <span className="block text-[12px] text-ink-3">{position.ticker}</span>
      </span>
    </>
  )
}

function PositionRow({ position, change, onSelect }) {
  const href = researchHref(position.ticker, undefined, { uic: position.uic, assetType: position.asset_type })
  const over = position.weight != null && Number(position.weight) > WEIGHT_CAP_PCT
  return (
    <Tr>
      <Td edge className="w-full max-w-0 md:max-w-none">
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(position.ticker)}
            className="flex items-center gap-2.5 min-w-0 w-full text-left rounded-lg"
          >
            <Identity position={position} />
          </button>
        ) : (
          <Link to={href} className="flex items-center gap-2.5 min-w-0">
            <Identity position={position} />
          </Link>
        )}
      </Td>
      <Td align="right">
        <Move value={change} />
      </Td>
      <Td align="right" className="font-semibold text-ink">{fmtEur(position.value)}</Td>
      <Td align="right" hideBelow="md">
        <Move value={position.pnl_pct} digits={1} />
      </Td>
      <Td align="right" hideBelow="md" edge className={over ? 'text-warn' : 'text-ink-2'}>
        {position.weight == null ? '—' : `${Number(position.weight).toFixed(1)}%`}
      </Td>
    </Tr>
  )
}

export default function PositionsPanel({ summary, positions, quotes, className = '', onSelect }) {
  const ranked = positions.slice().sort((a, b) => Number(b.value) - Number(a.value))
  const topHolding = ranked[0]
  const dayLabel = moveLabel(quotes.values())
  return (
    <Card
      flush
      className={className}
      context={`At a glance · ${ranked.length} position${ranked.length === 1 ? '' : 's'}`}
      dot={ranked.length ? 'ok' : 'off'}
      title="Portfolio"
      right={
        <Link to="/portfolio" className="text-[13px] font-semibold text-ink-2 hover:text-ink whitespace-nowrap">
          View all →
        </Link>
      }
    >
      <div className="px-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
        <Tile
          label="Portfolio value"
          value={fmtEur(summary.total_value)}
          sub={<PortfolioValueSub pnlPct={summary.total_pnl_pct} />}
        />
        <Tile
          label="Top holding"
          value={topHolding?.ticker ?? '—'}
          sub={topHolding ? (topHolding.weight == null ? '—' : `${Number(topHolding.weight).toFixed(1)}% of portfolio`) : undefined}
        />
        <Tile label="Holdings" value={fmtNum(positions.length)} sub="Across all accounts" />
      </div>
      {ranked.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table aria-label="Positions" className="w-full">
            <thead>
              <tr>
                <Th edge>Instrument</Th>
                <Th align="right">{dayLabel}</Th>
                <Th align="right">Value</Th>
                <Th align="right" hideBelow="md">Return</Th>
                <Th align="right" hideBelow="md" edge>Weight</Th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((position) => (
                <PositionRow
                  key={position.ticker}
                  position={position}
                  change={quotes.get(position.uic)?.change_pct ?? null}
                  onSelect={onSelect}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
