import { Star } from 'lucide-react'

import { fmtNum, fmtPct } from '../../lib/format'
import { barChange } from '../../lib/research'
import { Badge, Card } from '../ui'
import { Menu, MenuRow } from './menu'

/** Identity, live price and list membership for the symbol on screen. */
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
  const price = quote?.price ?? bars[bars.length - 1]?.close ?? null
  const change = quote?.change_pct ?? barChange(bars)
  const currency = details?.currency ?? ''
  const exchange = details?.exchange ?? ''
  const name = details?.description ?? position?.name ?? ''

  const memberships = watchlists.filter((list) => list.items.some((item) => item.symbol === symbol))

  return (
    <Card padding={false}>
      <div className="flex items-center gap-4 px-4 py-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/[0.05] border border-white/10 text-zinc-200 text-[13px] font-medium flex items-center justify-center shrink-0">
            {symbol.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-medium text-zinc-50">{symbol}</span>
              {exchange ? <span className="text-[11px] text-zinc-500 num font-mono">{exchange}</span> : null}
              {position ? <Badge tone="blue">Held</Badge> : null}
            </div>
            <div className="text-[12px] text-zinc-400 mt-0.5">{name}</div>
          </div>
        </div>

        <div className="flex items-baseline gap-2.5">
          <span className="text-[24px] font-medium num font-mono text-zinc-50">
            {price == null ? '—' : fmtNum(price, 2)}
          </span>
          {currency ? <span className="text-[11px] text-zinc-500">{currency}</span> : null}
          {change == null ? null : (
            <span
              className={`num font-mono text-[13px] font-medium ${
                change >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {fmtPct(change)} today
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Menu
            label={memberships.length ? `In ${memberships.length} list${memberships.length > 1 ? 's' : ''}` : 'Add to list'}
            icon={Star}
            width={220}
            align="right"
          >
            {watchlists.length === 0 ? (
              <div className="px-2 py-2 text-[11.5px] text-zinc-500">
                No lists yet — create one in the rail.
              </div>
            ) : (
              watchlists.map((list) => (
                <MenuRow
                  key={list.id}
                  checked={list.items.some((item) => item.symbol === symbol)}
                  onClick={() => onToggleList(list)}
                  right={`${list.items.length}`}
                >
                  {list.name}
                </MenuRow>
              ))
            )}
          </Menu>
          <button
            type="button"
            disabled
            title="Trading is not part of SaxoDash"
            className="h-7 px-3 rounded-md bg-blue-500/60 text-white/80 text-[11.5px] font-medium cursor-not-allowed"
          >
            Buy
          </button>
          <button
            type="button"
            disabled
            title="Trading is not part of SaxoDash"
            className="h-7 px-3 rounded-md border border-white/10 text-zinc-400 text-[11.5px] font-medium cursor-not-allowed"
          >
            Sell
          </button>
        </div>
      </div>

      {instrument ? null : (
        <div className="px-4 pb-3 -mt-1 text-[11.5px] text-amber-400/90">
          Could not resolve {symbol} to a Saxo instrument.
        </div>
      )}
    </Card>
  )
}
