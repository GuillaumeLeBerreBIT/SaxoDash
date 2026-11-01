import { Star } from 'lucide-react'

import { fmtNum } from '../../lib/format'
import { isEtf, moveCaption } from '../../lib/research'
import { Card, InstrumentLogo, Tag } from '../ui'
import { MoveCaption } from './chartHeader'
import { Menu, MenuRow } from './menu'

function Divider() {
  return <span className="w-px h-8 bg-line shrink-0" />
}

function Stat({ label, value }) {
  return (
    <div className="flex flex-col">
      <span className="text-[12px] text-ink-3">{label}</span>
      <span className="text-[13px] num font-semibold text-ink whitespace-nowrap">{value}</span>
    </div>
  )
}

export default function SymbolBar({
  symbol,
  instrument,
  details,
  position,
  quote,
  bars,
  watchlists = [],
  onToggleList,
  compact = false,
}) {
  const last = bars[bars.length - 1]
  const price = quote?.price ?? last?.close ?? null
  const { change, suffix: changeSuffix } = moveCaption(quote, bars)
  const currency = details?.currency ?? ''
  const exchange = details?.exchange ?? ''
  const name = details?.description ?? position?.name ?? ''

  const memberships = watchlists.filter((list) =>
    list.items.some((item) => item.uic === instrument?.uic),
  )

  return (
    <Card padding={false}>
      <div className="flex items-center gap-4 px-[18px] py-2.5 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <InstrumentLogo symbol={symbol} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold text-ink">{symbol}</span>
              {exchange ? <span className="text-[12px] text-ink-3">{exchange}</span> : null}
              {isEtf(instrument) ? <Tag tone="warn">ETF</Tag> : null}
              {position ? <Tag tone="held">Held</Tag> : null}
            </div>
            <div className="text-[12px] text-ink-2 mt-0.5 truncate">{name}</div>
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-[20px] font-bold num text-ink">
            {price == null ? '—' : fmtNum(price, 2)}
          </span>
          {currency ? <span className="text-[12px] text-ink-3">{currency}</span> : null}
          {change == null ? null : (
            <MoveCaption change={change} suffix={changeSuffix} className="text-[13px] font-semibold" />
          )}
        </div>

        {last && !compact ? (
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
              <div className="px-2 py-2 text-[12px] text-ink-3">
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
        <div className="px-[18px] pb-3 -mt-1 text-[12px] text-warn">
          {instrument
            ? `No exact match for ${symbol}; showing ${name || 'the closest search result'} instead.`
            : `Could not resolve ${symbol} to a Saxo instrument.`}
        </div>
      )}
    </Card>
  )
}
