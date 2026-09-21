import { Star } from 'lucide-react'

import { fmtNum, fmtPct } from '../../lib/format'
import { barChange, isEtf } from '../../lib/research'
import { Badge, Card, InstrumentLogo } from '../ui'
import { Menu, MenuRow } from './menu'

function Divider() {
  return <span className="w-px h-8 bg-white/[0.08] shrink-0" />
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-600">{label}</span>
      <span className="text-[var(--fig-sm)] num font-mono text-zinc-300 whitespace-nowrap">{value}</span>
    </div>
  )
}

/** Identity, live price, day range/volume and list membership for the symbol on screen. */
export default function SymbolBar({
  symbol,
  instrument,
  details,
  position,
  quote,
  bars,
  watchlists = [],
  onToggleList,
}) {
  const last = bars[bars.length - 1]
  const price = quote?.price ?? last?.close ?? null
  const change = quote?.change_pct ?? barChange(bars)
  const currency = details?.currency ?? ''
  const exchange = details?.exchange ?? ''
  const name = details?.description ?? position?.name ?? ''

  const memberships = watchlists.filter((list) =>
    list.items.some((item) => item.uic === instrument?.uic),
  )

  return (
    <Card padding={false}>
      <div className="flex items-center gap-4 px-4 py-2.5 flex-wrap">
        <div className="flex items-center gap-2.5">
          <InstrumentLogo
            symbol={symbol}
            size={32}
            className="rounded-lg border border-white/10"
            fallback={
              <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/10 text-zinc-200 text-[var(--fig-xs)] font-medium flex items-center justify-center shrink-0">
                {symbol.slice(0, 2)}
              </div>
            }
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[var(--fig-md)] font-medium text-zinc-50">{symbol}</span>
              {exchange ? <span className="text-[var(--fig-2xs)] text-zinc-500 num font-mono">{exchange}</span> : null}
              {isEtf(instrument) ? <Badge tone="amber">ETF</Badge> : null}
              {position ? <Badge tone="blue">Held</Badge> : null}
            </div>
            <div className="text-[var(--fig-xs)] text-zinc-400 mt-0.5">{name}</div>
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-[var(--fig-lg)] font-medium num font-mono text-zinc-50">
            {price == null ? '—' : fmtNum(price, 2)}
          </span>
          {currency ? <span className="text-[var(--fig-2xs)] text-zinc-500">{currency}</span> : null}
          {change == null ? null : (
            <span
              className={`num font-mono text-[var(--fig-xs)] font-medium ${
                change >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {fmtPct(change)} today
            </span>
          )}
        </div>

        {last ? (
          <>
            <Divider />
            <Stat label="Day range" value={`${fmtNum(last.low, 2)}–${fmtNum(last.high, 2)}`} />
            <Divider />
            <Stat label="Volume" value={`${fmtNum(last.volume / 1e6, 1)}M`} />
          </>
        ) : null}

        {/* No Buy/Sell here - SaxoDash doesn't place trades, and a button
            that can never be clicked is worse than no button (see the
            2026-09 UI audit's "dead UI" finding). Add-to-list is the one
            real action available for an instrument on this bar. */}
        <div className="ml-auto flex items-center gap-1.5">
          <Menu
            label={memberships.length ? `In ${memberships.length} list${memberships.length > 1 ? 's' : ''}` : 'Add to list'}
            icon={Star}
            width={220}
            align="right"
          >
            {watchlists.length === 0 ? (
              <div className="px-2 py-2 text-[var(--fig-xs)] text-zinc-500">
                No lists yet — create one in the rail.
              </div>
            ) : (
              watchlists.map((list) => (
                <MenuRow
                  key={list.id}
                  checked={list.items.some((item) => item.uic === instrument?.uic)}
                  onClick={() => onToggleList(list)}
                  right={`${list.items.length}`}
                >
                  {list.name}
                </MenuRow>
              ))
            )}
          </Menu>
        </div>
      </div>

      {instrument && instrument.exact ? null : (
        <div className="px-4 pb-3 -mt-1 text-[var(--fig-xs)] text-amber-400/90">
          {instrument
            ? `No exact match for ${symbol}; showing ${name || 'the closest search result'} instead.`
            : `Could not resolve ${symbol} to a Saxo instrument.`}
        </div>
      )}
    </Card>
  )
}
