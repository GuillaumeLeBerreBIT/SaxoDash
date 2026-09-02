import { useDeferredValue, useMemo, useState } from 'react'
import { Check, List, Plus, Search, X } from 'lucide-react'

import { useInstrumentSearch, useQuotes, useWatchlistMutations, useWatchlists } from '../../api/queries'
import { fmtNum, fmtPct } from '../../lib/format'
import { quotesByUic } from '../../lib/research'
import { Card } from '../ui'
import { Menu, MenuRow, MenuSeparator } from './menu'

// Hoisted so a list with no items keeps a stable identity across renders.
const NO_ITEMS = []

/** The 300px rail: watchlists, symbol search, and a live quote per row.
 *
 *  Lists live in the database rather than localStorage, so they survive a
 *  browser change; every write goes through useWatchlistMutations, which
 *  refetches the lists rather than patching a local copy.
 */
export default function WatchlistRail({ symbol, onSelectSymbol, heldSymbols }) {
  const { data: watchlists = [], isLoading } = useWatchlists()
  const { create, remove, addItem, removeItem } = useWatchlistMutations()

  const [activeId, setActiveId] = useState(null)
  const [naming, setNaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [query, setQuery] = useState('')

  // Keeps the input responsive while a slower search render catches up.
  const deferredQuery = useDeferredValue(query)
  const { data: results = [] } = useInstrumentSearch(deferredQuery)

  const active = watchlists.find((list) => list.id === activeId) ?? watchlists[0] ?? null
  const items = active?.items ?? NO_ITEMS

  // Saxo prices one asset type per request, so a mixed list costs two calls.
  const stockUics = useMemo(
    () => items.filter((i) => i.asset_type !== 'Etf' && i.uic).map((i) => i.uic),
    [items],
  )
  const etfUics = useMemo(
    () => items.filter((i) => i.asset_type === 'Etf' && i.uic).map((i) => i.uic),
    [items],
  )
  const stockQuotes = useQuotes(stockUics, 'Stock')
  const etfQuotes = useQuotes(etfUics, 'Etf')

  const quotes = useMemo(
    () => quotesByUic([...(stockQuotes.data ?? []), ...(etfQuotes.data ?? [])]),
    [stockQuotes.data, etfQuotes.data],
  )

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
    <Card padding={false}>
      <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5">
        <Menu label={active?.name ?? 'Watchlists'} icon={List} width={230}>
          {watchlists.map((list) => (
            <MenuRow key={list.id} onClick={() => setActiveId(list.id)} right={`${list.items.length}`}>
              <span className={list.id === active?.id ? 'text-zinc-100' : ''}>{list.name}</span>
            </MenuRow>
          ))}
          {watchlists.length ? <MenuSeparator /> : null}
          <MenuRow onClick={() => setNaming(true)}>
            <span className="text-blue-400">+ New list</span>
          </MenuRow>
          {active ? (
            <MenuRow
              onClick={() => {
                remove.mutate(active.id)
                setActiveId(null)
              }}
            >
              <span className="text-red-400">Delete “{active.name}”</span>
            </MenuRow>
          ) : null}
        </Menu>
        <span className="text-[11px] text-zinc-500 num font-mono ml-auto">{items.length}</span>
      </div>

      {naming ? (
        <div className="px-3 py-2.5 border-b border-white/[0.06] flex gap-1.5">
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
            className="flex-1 h-7 px-2 bg-zinc-950 border border-white/10 rounded text-[12px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500/60"
          />
          <button
            type="button"
            onClick={createList}
            className="h-7 px-2.5 rounded bg-blue-500 hover:bg-blue-600 text-white text-[11.5px] font-medium"
          >
            Add
          </button>
        </div>
      ) : null}

      <div className="px-3 py-2.5 border-b border-white/[0.06] relative">
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500">
          <Search size={12} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search symbol to add"
          aria-label="Search symbol to add"
          className="w-full h-7 pl-7 pr-2 bg-zinc-950 border border-white/10 rounded text-[12px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500/60"
        />
      </div>

      {results.length > 0 ? (
        <div className="max-h-[230px] overflow-y-auto border-b border-white/[0.06]">
          {results.map((result) => {
            const inList = items.some((item) => item.symbol === result.symbol)
            return (
              <div
                key={`${result.uic}-${result.asset_type}`}
                className="flex items-center gap-2 px-3 h-9 hover:bg-white/[0.04]"
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelectSymbol(result.symbol)
                    setQuery('')
                  }}
                  className="flex-1 min-w-0 text-left"
                >
                  <span className="text-[12px] font-medium text-zinc-100">{result.symbol}</span>
                  <span className="text-[11px] text-zinc-500 ml-2 truncate">{result.description}</span>
                </button>
                <button
                  type="button"
                  onClick={() => addResult(result)}
                  disabled={inList || !active}
                  title={active ? undefined : 'Create a list first'}
                  aria-label={inList ? `${result.symbol} already in list` : `Add ${result.symbol}`}
                  className={`w-5 h-5 rounded flex items-center justify-center ${
                    inList
                      ? 'text-blue-400'
                      : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08] disabled:opacity-40'
                  }`}
                >
                  {inList ? <Check size={12} /> : <Plus size={12} />}
                </button>
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_auto_auto] items-center px-3 h-7 text-[10px] uppercase tracking-wide text-zinc-600 border-b border-white/[0.06]">
        <span>Symbol</span>
        <span className="text-right pr-3">Last</span>
        <span className="text-right w-14">Chg%</span>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {isLoading ? <div className="px-3 py-6 text-center text-[11.5px] text-zinc-500">Loading…</div> : null}

        {!isLoading && watchlists.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11.5px] text-zinc-500">
            No lists yet. Create one to start tracking symbols.
          </div>
        ) : null}

        {!isLoading && watchlists.length > 0 && items.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11.5px] text-zinc-500">
            Empty list. Search above to add symbols.
          </div>
        ) : null}

        {items.map((item) => {
          const quote = quotes.get(item.uic)
          const change = quote?.change_pct
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSymbol(item.symbol)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelectSymbol(item.symbol)
              }}
              className={`grid grid-cols-[1fr_auto_auto] items-center px-3 h-[38px] cursor-pointer group border-l-2 ${
                symbol === item.symbol
                  ? 'bg-blue-500/[0.07] border-l-blue-500'
                  : 'border-l-transparent hover:bg-white/[0.04]'
              }`}
            >
              <div className="min-w-0 flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-zinc-100">{item.symbol}</span>
                {heldSymbols.has(item.symbol) ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title="In portfolio" />
                ) : null}
                <span className="text-[10.5px] text-zinc-600 truncate">{item.exchange}</span>
              </div>
              <span className="text-[12px] num font-mono text-zinc-200 text-right pr-3">
                {quote?.price == null ? '—' : fmtNum(quote.price, 2)}
              </span>
              <span className="w-14 text-right flex items-center justify-end gap-1">
                <span
                  className={`text-[11.5px] num font-mono ${
                    change == null ? 'text-zinc-600' : change >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {change == null ? '—' : fmtPct(change)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeItem.mutate({ id: active.id, itemId: item.id })
                  }}
                  aria-label={`Remove ${item.symbol}`}
                  className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 -mr-1"
                >
                  <X size={11} />
                </button>
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
