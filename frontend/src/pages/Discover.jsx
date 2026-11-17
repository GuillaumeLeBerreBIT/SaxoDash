import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, Search, SlidersHorizontal } from 'lucide-react'

import { isNotConnected } from '../api/client'
import { useBrowse, useDiscover, useStartDiscoverScan } from '../api/queries'
import BrowseFilters from '../components/discover/BrowseFilters'
import BrowseResults from '../components/discover/BrowseResults'
import DiscoverHealth from '../components/discover/DiscoverHealth'
import ScanProgress from '../components/discover/ScanProgress'
import ShelfBrowser from '../components/discover/ShelfBrowser'
import StockRails from '../components/discover/StockRails'
import { EMPTY_FILTERS, SORTS, browseQuery, filtersActive, filtersFromParams, paramsFromFilters } from '../lib/discoverBrowse'
import { REFRESH_HINT, SCANNING_POLL_MS, updatedLabel } from '../lib/discover'
import { fmtDateTime } from '../lib/format'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useNow } from '../lib/useNow'
import { Alert, Button, Select } from '../components/ui'

const SHELVES_HIDDEN = new Set(['never', 'scanning'])

function useFirstScanOnOpen(health) {
  const startScan = useStartDiscoverScan()
  const requested = useRef(false)
  const { mutate } = startScan

  useEffect(() => {
    if (health?.state !== 'never' || requested.current) return
    requested.current = true
    mutate()
  }, [health?.state, mutate])

  return startScan
}

function ScanFooter({ data, startScan, now }) {
  const health = data?.health
  const scanning = Boolean(health?.progress)
  return (
    <section aria-label="Scan status" className="flex flex-col gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-ink-3">
        <span>
          S&amp;P 500 and Nasdaq-100, checked after each close ·{' '}
          <span title={health?.last_ok_at ? fmtDateTime(health.last_ok_at) : undefined}>{updatedLabel(health?.last_ok_at, now)}</span> ·
          Rules, not advice.
        </span>
        <Button size="sm" title={REFRESH_HINT} onClick={() => startScan.mutate()} disabled={scanning || startScan.isPending}>
          <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning…' : 'Refresh'}
        </Button>
      </div>
      <ScanProgress progress={health?.progress} now={now} />
      <DiscoverHealth health={health} asOf={data?.as_of} />
    </section>
  )
}

function SearchBar({ filters, onChange, showSort }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line-input bg-pane px-4 focus-within:outline focus-within:outline-2 focus-within:outline-focus">
        <Search size={18} className="shrink-0 text-ink-3" aria-hidden />
        <input
          type="search"
          value={filters.q}
          onChange={(event) => onChange({ ...filters, q: event.target.value })}
          aria-label="Search stocks"
          placeholder="Search the index by name or ticker"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
        />
      </label>
      {showSort ? (
      <label className="flex items-center gap-2 text-[14px] text-ink-2">
        Sort
        <Select value={filters.sort} onChange={(event) => onChange({ ...filters, sort: event.target.value })} className="h-12 min-w-[220px]">
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>
      ) : null}
    </div>
  )
}

export default function Discover() {
  const { data, error } = useDiscover()
  const startScan = useFirstScanOnOpen(data?.health)
  const now = useNow(data?.health?.progress ? SCANNING_POLL_MS : 60_000)
  const [params, setParams] = useSearchParams()
  const typed = filtersFromParams(params)
  const q = useDebouncedValue(typed.q, 250)
  const filters = { ...typed, q }
  const active = filtersActive(filters)
  const facets = useBrowse(browseQuery(filters, { limit: 1 })).data?.facets
  const setFilters = (next) => setParams(paramsFromFilters({ ...next, q: next.q ?? '' }), { replace: true })
  const clear = () => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })
  const showShelves = data && !SHELVES_HIDDEN.has(data.health?.state)
  const firstScan = data?.health?.state === 'never'
  const resultsKey = browseQuery(filters)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Discover</h1>
      {error ? <Alert>Could not load Discover.</Alert> : null}
      {isNotConnected(startScan.error) ? (
        <Alert tone="warning">{firstScan ? 'Connect Saxo to run the first scan.' : 'Connect Saxo to refresh.'}</Alert>
      ) : null}
      <SearchBar filters={typed} onChange={setFilters} showSort={active} />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <aside aria-label="Filters" className="hidden w-[240px] shrink-0 lg:sticky lg:top-4 lg:block">
          <BrowseFilters filters={filters} facets={facets} onChange={setFilters} />
        </aside>
        <details className="rounded-xl bg-pane px-4 lg:hidden">
          <summary className="flex min-h-[48px] cursor-pointer items-center gap-2 text-[14px] font-semibold text-ink">
            <SlidersHorizontal size={16} aria-hidden /> Filters
          </summary>
          <BrowseFilters filters={filters} facets={facets} onChange={setFilters} />
        </details>
        <div className="flex min-w-0 flex-1 flex-col gap-10">
          {active ? <BrowseResults key={resultsKey} filters={filters} onClear={clear} /> : <StockRails />}
          {!active && showShelves ? <ShelfBrowser shelves={data.shelves} /> : null}
        </div>
      </div>
      {data ? <ScanFooter data={data} startScan={startScan} now={now} /> : null}
    </div>
  )
}
