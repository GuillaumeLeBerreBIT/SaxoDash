import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'

import { fmtCompact, fmtMoney, fmtNum } from '../../lib/format'
import { chartHref, isEtf, moveCaption } from '../../lib/research'
import SaxoConnectionStatus from '../SaxoConnectionStatus'
import { Card, InstrumentLogo, LetterAvatar, Move, StatusDot, Tag, TabButton, TabList } from '../ui'
import { Menu, MenuRow } from './menu'

const LINK_BUTTON =
  'sd-raised inline-flex items-center justify-center h-7 px-2.5 rounded-lg bg-raised text-[12px] font-semibold text-ink hover:bg-hover whitespace-nowrap'

function contextLine(details, currency) {
  return ['Saxo', details?.exchange, currency].filter(Boolean).join(' · ')
}

function identityLine(symbol, company, held) {
  return [
    symbol,
    company?.industry || null,
    company?.market_cap == null ? null : `${fmtCompact(company.market_cap)} market cap`,
    held ? 'You own it' : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function WatchlistMenu({ watchlists, instrument, onToggleList }) {
  const memberships = watchlists.filter((list) => list.items.some((item) => item.uic === instrument?.uic))
  return (
    <Menu
      label={memberships.length ? `In ${memberships.length} list${memberships.length > 1 ? 's' : ''}` : 'Add to list'}
      icon={Star}
      width={220}
      align="right"
    >
      {watchlists.length === 0 ? (
        <div className="px-2 py-2 text-[12px] text-ink-3">No lists yet — create one in the rail.</div>
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
  )
}

function Price({ quote, bars, currency }) {
  const last = bars[bars.length - 1]
  const price = quote?.price ?? last?.close ?? null
  const { change, suffix } = moveCaption(quote, bars)

  return (
    <div className="ml-auto text-right">
      <div className="text-[30px] md:text-[34px] font-bold tracking-tight num text-ink">
        {price == null ? '—' : currency ? fmtMoney(price, currency) : fmtNum(price, 2)}
      </div>
      <div className="text-[14px] font-semibold">
        <Move value={change} />
        {change == null ? null : <span className="ml-1.5 font-medium text-ink-3">{suffix}</span>}
      </div>
      {last ? (
        <div className="mt-0.5 text-[12px] text-ink-3 num">
          Day {fmtNum(last.low, 2)}–{fmtNum(last.high, 2)} · Vol {last.volume == null ? '—' : `${fmtNum(last.volume / 1e6, 1)}M`}
        </div>
      ) : null}
    </div>
  )
}

export default function ResearchHeader({
  symbol,
  instrument,
  details,
  position,
  quote,
  bars,
  company,
  currency,
  watchlists = [],
  onToggleList,
  groups,
  activeGroup,
  onSelectGroup,
  subTabs,
  activeTab,
  onSelectTab,
  className = '',
}) {
  const name = details?.description ?? position?.name ?? symbol

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2">
        <div className="flex items-center gap-2 min-w-0 text-[13px] font-medium text-ink">
          <StatusDot tone={bars.length ? 'ok' : 'off'} />
          <span className="truncate">{contextLine(details, currency)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <SaxoConnectionStatus />
          <WatchlistMenu watchlists={watchlists} instrument={instrument} onToggleList={onToggleList} />
          <Link to={chartHref(symbol, instrument)} className={LINK_BUTTON}>
            Open in Chart
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3.5 mt-2.5 mb-3.5">
        <InstrumentLogo
          symbol={symbol}
          size={36}
          fallback={<LetterAvatar symbol={symbol} size={36} chars={2} className="rounded-full" />}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] md:text-[30px] font-bold tracking-tight text-ink [text-wrap:balance]">{name}</h1>
            {isEtf(instrument) ? <Tag tone="warn">ETF</Tag> : null}
          </div>
          <div className="text-[14px] text-ink-2 num">{identityLine(symbol, company, Boolean(position))}</div>
        </div>
        <Price quote={quote} bars={bars} currency={currency} />
      </div>

      {instrument && instrument.exact ? null : (
        <p className="-mt-1.5 mb-3 text-[13px] text-warn">
          {instrument
            ? `No exact match for ${symbol}; showing ${details?.description || 'the closest search result'} instead.`
            : `Could not resolve ${symbol} to a Saxo instrument.`}
        </p>
      )}

      <TabList
        label="Instrument sections"
        className="pb-px overflow-x-auto whitespace-nowrap [scrollbar-width:none] border-b-0"
      >
        {groups.map(([key, label]) => (
          <TabButton
            key={key}
            id={`research-group-${key}`}
            active={activeGroup === key}
            onClick={() => onSelectGroup(key)}
            className="shrink-0 px-3! first:pl-0! md:h-8!"
          >
            {label}
          </TabButton>
        ))}
      </TabList>

      {subTabs.length > 1 ? (
        <TabList label={`${groups.find(([key]) => key === activeGroup)?.[1] ?? ''} sections`} className="mt-2 pb-px overflow-x-auto whitespace-nowrap [scrollbar-width:none] border-b-0">
          {subTabs.map(([key, label]) => (
            <TabButton
              key={key}
              id={`research-tab-${key}`}
              controls={`research-panel-${key}`}
              active={activeTab === key}
              onClick={() => onSelectTab(key)}
              className="shrink-0 px-3! first:pl-0! md:h-8!"
            >
              {label}
            </TabButton>
          ))}
        </TabList>
      ) : null}
    </Card>
  )
}
