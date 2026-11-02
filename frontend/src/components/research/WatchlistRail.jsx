import { useDeferredValue, useId, useMemo, useState } from 'react'
import { Check, ChevronDown, Eye, LayoutGrid, LayoutList, List, Plus, Search, X } from 'lucide-react'

import {
  useInstrumentSearch,
  useQuotesByAssetType,
  useWatchlistMutations,
  useWatchlists,
} from '../../api/queries'
import { fmtNum } from '../../lib/format'
import { activatesRow } from '../../lib/keys'
import { changeSinceLastLook } from '../../lib/lastLook'
import { quotesByUic, rankInstrumentResults, uicsByAssetType } from '../../lib/research'
import { Card, DayChange, InstrumentLogo, TBtn } from '../ui'
import { Menu, MenuRow, MenuSeparator } from './menu'
import WatchlistHeatmap from './WatchlistHeatmap'

// Hoisted so a list with no items keeps a stable identity across renders.
const NO_ITEMS = []

const VIEW_KEY = 'saxodash:watchlist-view'
const COLLAPSED_KEY = 'saxodash:watchlist-collapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

function writeCollapsed(collapsed) {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  } catch {
    return
  }
}

function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

function writeView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    return
  }
}

/** The 300px rail: watchlists, symbol search, and a live quote per row.
 *
 *  Lists live in the database rather than localStorage, so they survive a
 *  browser change; every write goes through useWatchlistMutations, which
 *  refetches the lists rather than patching a local copy.
 */
export default function WatchlistRail({
  symbol,
  onSelectSymbol,
  heldSymbols,
  fill = false,
  gridView = false,
  collapsible = false,
}) {
  const { data: watchlists = [], isLoading } = useWatchlists()
  const { create, remove, addItem, removeItem } = useWatchlistMutations()

  const [activeId, setActiveId] = useState(null)
  const [naming, setNaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [query, setQuery] = useState('')
  const [view, setView] = useState(readView)
  const showGrid = gridView && view === 'grid'
  const bodyId = useId()
  const [collapsedChoice, setCollapsedChoice] = useState(readCollapsed)
  const collapsed = collapsible && collapsedChoice
  const toggleCollapsed = () => {
    setCollapsedChoice(!collapsed)
    writeCollapsed(!collapsed)
  }
  const chooseView = (next) => {
    setView(next)
    writeView(next)
  }

  // Keeps the input responsive while a slower search render catches up.
  const deferredQuery = useDeferredValue(query)
  const { data: results = [] } = useInstrumentSearch(deferredQuery)

  const active = watchlists.find((list) => list.id === activeId) ?? watchlists[0] ?? null
  const items = active?.items ?? NO_ITEMS

  // Saxo prices one asset type per request, so a mixed list costs one call per
  // type - and a type whose call fails takes only its own rows down with it.
  const quoteGroups = useMemo(() => uicsByAssetType(items), [items])
  const { data: quoteRows } = useQuotesByAssetType(quoteGroups)
  const quotes = useMemo(() => quotesByUic(quoteRows), [quoteRows])

  const createList = () => {
    const name = newName.trim()
    setNaming(false)
    setNewName('')
    if (!name) return
    create.mutate(name, { onSuccess: (created) => setActiveId(created?.id ?? null) })
  }

  const addResult = (result) => {
    if (!active) return
    addItem.mutate({
      id: active.id,
      item: {
        symbol: result.symbol,
        uic: result.uic,
        asset_type: result.asset_type,
        description: result.description,
        exchange: result.exchange,
      },
    })
  }

  return (
    <Card padding={false} className={fill ? 'h-full min-h-0 flex flex-col' : ''}>
      <div
        className={`px-3.5 py-2.5 border-b flex items-center gap-1.5 transition-colors duration-300 ${
          collapsed ? 'border-transparent' : 'border-line'
        }`}
      >
        <Menu label={active?.name ?? 'Watchlists'} icon={List} width={230}>
          {watchlists.map((list) => (
            <MenuRow key={list.id} onClick={() => setActiveId(list.id)} right={`${list.items.length}`}>
              <span className={list.id === active?.id ? 'text-ink font-semibold' : ''}>{list.name}</span>
            </MenuRow>
          ))}
          {watchlists.length ? <MenuSeparator /> : null}
          <MenuRow onClick={() => setNaming(true)}>
            <span className="text-ink">+ New list</span>
          </MenuRow>
          {active ? (
            <MenuRow
              onClick={() => {
                remove.mutate(active.id)
                setActiveId(null)
              }}
            >
              <span className="text-down">Delete “{active.name}”</span>
            </MenuRow>
          ) : null}
        </Menu>
        <span className="text-[12px] text-ink-3 num ml-auto">{items.length}</span>
        {gridView ? (
          <div className="flex items-center gap-0.5 p-[3px] rounded-[9px] bg-track">
            <TBtn active={!showGrid} onClick={() => chooseView('list')} title="List view">
              <LayoutList size={12} />
            </TBtn>
            <TBtn active={showGrid} onClick={() => chooseView('grid')} title="Grid view">
              <LayoutGrid size={12} />
            </TBtn>
          </div>
        ) : null}
        {collapsible ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={collapsed ? 'Expand watchlist' : 'Collapse watchlist'}
            title={collapsed ? 'Expand watchlist' : 'Collapse watchlist'}
            className="w-7 h-7 -mr-1 rounded-md flex items-center justify-center text-ink-3 hover:text-ink hover:bg-hover transition-colors"
          >
            <ChevronDown
              size={14}
              aria-hidden="true"
              className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${
                collapsed ? '-rotate-90' : ''
              }`}
            />
          </button>
        ) : null}
      </div>

      <RailBody collapsible={collapsible} collapsed={collapsed} id={bodyId}>
        {naming ? (
          <div className="px-3.5 py-2.5 border-b border-line flex gap-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createList()
                if (e.key === 'Escape') setNaming(false)
              }}
              placeholder="List name"
              aria-label="New list name"
              className="flex-1 h-8 px-2.5 bg-track border border-line-input rounded-lg text-[13px] text-ink placeholder:text-ink-3 outline-none"
            />
            <button
              type="button"
              onClick={createList}
              className="h-8 px-3 rounded-lg bg-accent text-on-accent text-[13px] font-semibold"
            >
              Add
            </button>
          </div>
        ) : null}

        <div className="px-3.5 py-2.5 border-b border-line relative">
          <span className="absolute left-6 top-1/2 -translate-y-1/2 text-ink-3">
            <Search size={12} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol to add"
            aria-label="Search symbol to add"
            className="w-full h-8 pl-7 pr-2 bg-track border border-line-input rounded-lg text-[13px] text-ink placeholder:text-ink-3 outline-none"
          />
        </div>

        {results.length > 0 ? (
          <div className="max-h-[230px] overflow-y-auto border-b border-line">
            {rankInstrumentResults(results, deferredQuery).map((result) => {
              const inList = items.some((item) => item.uic === result.uic)
              return (
                <div
                  key={`${result.uic}-${result.asset_type}`}
                  className="flex items-center gap-2 px-3.5 h-10 hover:bg-hover"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSymbol(result.symbol, { uic: result.uic, assetType: result.asset_type })
                      setQuery('')
                    }}
                    className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
                  >
                    <InstrumentLogo symbol={result.symbol} size={20} />
                    <span className="text-[13px] font-semibold text-ink">{result.symbol}</span>
                    <span className="text-[12px] text-ink-3 truncate">{result.description}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => addResult(result)}
                    disabled={inList || !active || !result.uic}
                    title={active ? undefined : 'Create a list first'}
                    aria-label={inList ? `${result.symbol} already in list` : `Add ${result.symbol}`}
                    className={`w-6 h-6 rounded-md flex items-center justify-center ${
                      inList ? 'text-held' : 'text-ink-3 hover:text-ink hover:bg-hover disabled:opacity-40'
                    }`}
                  >
                    {inList ? <Check size={12} /> : <Plus size={12} />}
                  </button>
                </div>
              )
            })}
          </div>
        ) : null}

        {showGrid ? null : (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-3.5 h-[30px] text-[12px] text-ink-3 border-b border-line">
            <span>Symbol</span>
            <span className="text-right">Last</span>
            <span className="text-right w-16">Chg%</span>
          </div>
        )}

        <div className={fill ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-[420px] overflow-y-auto'}>
          {isLoading ? <div className="px-3.5 py-6 text-center text-[13px] text-ink-3">Loading…</div> : null}

          {!isLoading && watchlists.length === 0 ? (
            <div className="px-3.5 py-6 text-center text-[13px] text-ink-3">
              No lists yet. Create one to start tracking symbols.
            </div>
          ) : null}

          {!isLoading && watchlists.length > 0 && items.length === 0 ? (
            <div className="px-3.5 py-6 text-center text-[13px] text-ink-3">
              Empty list. Search above to add symbols.
            </div>
          ) : null}

          {showGrid ? (
            items.length > 0 ? (
              <WatchlistHeatmap
                items={items}
                quotes={quotes}
                symbol={symbol}
                heldSymbols={heldSymbols}
                onSelectSymbol={onSelectSymbol}
              />
            ) : null
          ) : (
            items.map((item) => {
              const quote = quotes.get(item.uic)
              const change = quote?.change_pct
              const sinceLastLook = changeSinceLastLook(item.symbol, quote?.price)
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSymbol(item.symbol, { uic: item.uic, assetType: item.asset_type })}
                  aria-current={symbol === item.symbol || undefined}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget || !activatesRow(e)) return
                    e.preventDefault()
                    onSelectSymbol(item.symbol, { uic: item.uic, assetType: item.asset_type })
                  }}
                  className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 px-3.5 min-h-11 cursor-pointer group ${
                    symbol === item.symbol ? 'bg-selected' : 'hover:bg-hover'
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-1.5">
                    <InstrumentLogo symbol={item.symbol} size={24} />
                    <span className="text-[13px] font-semibold text-ink shrink-0">{item.symbol}</span>
                    {heldSymbols.has(item.symbol) ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-held" title="In portfolio" />
                    ) : null}
                    <span className="text-[12px] text-ink-3 min-w-0 truncate">{item.exchange}</span>
                  </div>
                  <span className="text-[13px] num font-semibold text-ink text-right">
                    {quote?.price == null ? '—' : fmtNum(quote.price, 2)}
                  </span>
                  <span className="flex items-center justify-end gap-1">
                    <span className="flex flex-col items-end gap-0.5 leading-none">
                      <DayChange value={change} className="text-[12px] font-semibold" />
                      {sinceLastLook != null ? (
                        <span title="Since you last looked" className="flex items-center gap-0.5 text-ink-3">
                          <Eye size={10} aria-hidden="true" />
                          <DayChange value={sinceLastLook} className="text-[11px]" />
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeItem.mutate({ id: active.id, itemId: item.id })
                      }}
                      aria-label={`Remove ${item.symbol}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-ink-3 hover:text-down -mr-1"
                    >
                      <X size={11} />
                    </button>
                  </span>
                </div>
              )
            })
          )}
        </div>
      </RailBody>
    </Card>
  )
}

function RailBody({ collapsible, collapsed, id, children }) {
  if (!collapsible) return children
  return (
    <div
      id={id}
      inert={collapsed}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
        collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
      }`}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
