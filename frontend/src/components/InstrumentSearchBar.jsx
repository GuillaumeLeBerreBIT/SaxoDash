import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'

import { useInstrumentSearch } from '../api/queries'
import { ALL_ASSET_TYPES, rankInstrumentResults, researchHref } from '../lib/research'
import { Badge, TBtn } from './ui'
import { usePortalMenuRect } from './usePortalMenuRect'

const FILTERS = [
  [ALL_ASSET_TYPES, 'All'],
  ['Stock', 'Stocks'],
  ['Etf', 'ETFs'],
]

/** A "jump to any instrument" bar for Portfolio and Research - distinct from
 *  WatchlistRail's "search to add to this list" box, which stays list-scoped.
 *  The results menu portals to <body>, positioned from a measured rect, the
 *  same technique PeersTab's "Add peer" search uses to avoid the clipping an
 *  unportaled dropdown had (1b14d3e, 0a4aa02) - but unlike that box, this one
 *  is always-visible page furniture rather than tucked in a table row, so it
 *  also dismisses on Escape or a click elsewhere. */
export default function InstrumentSearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [assetTypes, setAssetTypes] = useState(ALL_ASSET_TYPES)
  const [dismissedFor, setDismissedFor] = useState(null)
  const wrapperRef = useRef(null)
  // The dropdown portals to <body>, outside wrapperRef's own DOM subtree, so
  // the outside-click check below needs this too or clicking a result reads
  // as a click "outside" and dismisses the menu before its onClick can fire.
  const menuRef = useRef(null)
  const deferredQuery = useDeferredValue(query)
  const { data: results = [], isError } = useInstrumentSearch(deferredQuery, assetTypes)
  const ranked = rankInstrumentResults(results, deferredQuery)

  // A dismissal only holds for the query that was on screen when it
  // happened - typing further is a new request for suggestions.
  const dismissed = dismissedFor === deferredQuery
  if (dismissedFor !== null && !dismissed) setDismissedFor(null)

  const showMenu = !dismissed && (isError || ranked.length > 0)
  const menuRect = usePortalMenuRect(wrapperRef, showMenu)

  useEffect(() => {
    if (!showMenu) return undefined
    const onPointerDown = (e) => {
      const inside = wrapperRef.current?.contains(e.target) || menuRef.current?.contains(e.target)
      if (!inside) setDismissedFor(deferredQuery)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setDismissedFor(deferredQuery)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [showMenu, deferredQuery])

  const go = (result) => {
    navigate(researchHref(result.symbol, undefined, { uic: result.uic, assetType: result.asset_type }))
    setQuery('')
  }

  return (
    <div ref={wrapperRef} className="relative flex items-center gap-2">
      <div className="relative flex-1">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any stock or ETF…"
          aria-label="Search instruments"
          className="w-full h-9 pl-9 pr-3 bg-zinc-950 border border-white/10 rounded-lg text-[var(--fig-sm)] text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500/60"
        />
      </div>

      <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] p-0.5 shrink-0">
        {FILTERS.map(([value, label]) => (
          <TBtn key={value} active={assetTypes === value} onClick={() => setAssetTypes(value)}>
            {label}
          </TBtn>
        ))}
      </div>

      {menuRect && isError && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuRect.top + 4, left: menuRect.left, width: menuRect.width }}
          className="z-50 bg-zinc-900 border border-white/10 rounded-lg shadow-lg px-3 py-2 text-[var(--fig-xs)] text-amber-400"
        >
          Search unavailable — reconnect Saxo
        </div>,
        document.body,
      )}
      {menuRect && !isError && ranked.length > 0 && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuRect.top + 4, left: menuRect.left, width: menuRect.width }}
          className="z-50 max-h-72 overflow-y-auto bg-zinc-900 border border-white/10 rounded-lg shadow-lg"
        >
          {ranked.map((result) => (
            <button
              key={`${result.uic}-${result.asset_type}`}
              type="button"
              onClick={() => go(result)}
              className="flex items-center gap-2.5 w-full text-left px-3 py-2 text-[var(--fig-sm)] text-zinc-100 hover:bg-white/[0.06]"
            >
              <span className="shrink-0 font-medium">{result.symbol}</span>
              <span className="text-zinc-500 truncate flex-1">{result.description}</span>
              {result.exchange ? (
                <span className="text-[var(--fig-2xs)] text-zinc-600 num font-mono shrink-0">{result.exchange}</span>
              ) : null}
              <Badge tone={result.asset_type === 'Etf' ? 'amber' : 'zinc'} className="shrink-0">
                {result.asset_type === 'Etf' ? 'ETF' : 'Stock'}
              </Badge>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
