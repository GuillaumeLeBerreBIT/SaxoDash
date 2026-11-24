import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom'
import { RefreshCw, Search, SlidersHorizontal } from 'lucide-react'

import { isNotConnected } from '../api/client'
import { useExplorerPages, useDiscover, useStartDiscoverScan } from '../api/queries'
import BrowseFilters from '../components/discover/BrowseFilters'
import BrowseResults from '../components/discover/BrowseResults'
import DiscoverHealth from '../components/discover/DiscoverHealth'
import ScanProgress from '../components/discover/ScanProgress'
import { EMPTY_FILTERS, PAGE_SIZE, SORTS, browseQuery, defaultSort, filtersFromParams, paramsFromFilters } from '../lib/discoverBrowse'
import { REFRESH_HINT, SCANNING_POLL_MS, updatedLabel } from '../lib/discover'
import { fmtDateTime } from '../lib/format'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { useNow } from '../lib/useNow'
import { Alert, Button, Segmented, Select } from '../components/ui'

const PRIMARY = [
  { value: 'all', label: 'All stocks' },
  { value: 'strong', label: 'Strong companies' },
  { value: 'pullbacks', label: 'Price pullbacks' },
  { value: 'fund-buying', label: 'Fund buying' },
]
const LAYOUTS = [{ value: 'cards', label: 'Cards' }, { value: 'table', label: 'Table' }]

function ScreenChooser({ screen, data, onChange }) {
  const primary = PRIMARY.some((option) => option.value === screen)
  const extra = <>
    <optgroup label="Your watchlists"><option value="saved">Saved stocks</option></optgroup>
    {data?.groups?.map((group) => <optgroup key={group.key} label={group.title}>
      {data.shelves.filter((shelf) => shelf.group === group.key).map((shelf) => <option key={shelf.key} value={shelf.key}>{shelf.title}</option>)}
    </optgroup>)}
  </>
  return <>
    <div className="hidden flex-wrap items-center gap-2 lg:flex">
      <Segmented label="Stock screens" options={PRIMARY} value={screen} onChange={onChange} />
      <Select aria-label="More screens" value={primary ? '' : screen} onChange={(event) => onChange(event.target.value)}>
        <option value="" disabled>More screens</option>{extra}
      </Select>
    </div>
    <Select aria-label="Stock screen" value={screen} className="min-w-0 flex-1 lg:hidden" onChange={(event) => onChange(event.target.value)}>
      {PRIMARY.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}{extra}
    </Select>
  </>
}

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

function SortControl({ filters, onChange, screen, className }) {
  const options = SORTS.filter((option) => option.value !== 'funds' || screen === 'fund-buying')
  return (
    <label className={`items-center gap-2 text-[14px] text-ink-2 ${className}`}>
      Sort
      <Select name="sort" value={filters.sort} onChange={(event) => onChange({ ...filters, sort: event.target.value })}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </label>
  )
}

function SearchBar({ filters, onChange, screen }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line-input bg-pane px-4 focus-within:outline focus-within:outline-2 focus-within:outline-focus">
        <Search size={18} className="shrink-0 text-ink-3" aria-hidden />
        <input
          type="search"
          name="q" autoComplete="off" spellCheck={false}
          value={filters.q}
          onChange={(event) => onChange({ ...filters, q: event.target.value })}
          aria-label="Search stocks"
          placeholder="Search by company or ticker…"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
        />
      </label>

      <SortControl filters={filters} onChange={onChange} screen={screen} className="hidden lg:flex" />
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
  const location = useLocation()
  const navigation = useNavigationType()
  const screen = params.get('screen') || 'all'
  const layout = params.get('layout') === 'table' ? 'table' : 'cards'
  const depth = location.state?.depth ?? 1
  const base = new URLSearchParams(browseQuery(filters))
  base.set('sort', filters.sort)
  base.set('screen', screen)
  base.set('limit', PAGE_SIZE)
  const pages = useExplorerPages(Array.from({ length: depth }, (_, index) => {
    const query = new URLSearchParams(base)
    if (index) query.set('offset', index * PAGE_SIZE)
    return `?${query}`
  }), screen)
  const facets = pages[0].data?.facets
  const update = (next, nextScreen = screen, nextLayout = layout, nextDepth = 1) => {
    const target = new URLSearchParams(paramsFromFilters(next))
    if (next.sort !== defaultSort(nextScreen)) target.set('sort', next.sort)
    else target.delete('sort')
    if (nextScreen !== 'all') target.set('screen', nextScreen)
    if (nextLayout !== 'cards') target.set('layout', nextLayout)
    setParams(target, { replace: true, state: { depth: nextDepth } })
  }
  const setFilters = (next) => update(next)
  const firstScan = data?.health?.state === 'never'
  const key = `discover-return:${location.key}`
  const loaded = pages.every((page) => !!page.data)
  useEffect(() => {
    if (!loaded || navigation !== 'POP') return
    const ticker = sessionStorage.getItem(key)
    if (!ticker) return
    sessionStorage.removeItem(key)
    const listing = [...document.querySelectorAll('[data-listing]')].find((node) => node.dataset.listing === ticker)
    listing?.scrollIntoView?.({ block: 'center' })
    listing?.querySelector('a')?.focus({ preventScroll: true })
  }, [key, loaded, navigation])
  const rememberListing = (event) => {
    const listing = event.target.closest('a')?.closest('[data-listing]')
    if (listing) sessionStorage.setItem(key, listing.dataset.listing)
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only min-[760px]:not-sr-only min-[760px]:text-[24px] font-bold tracking-tight text-ink">Discover</h1>
      {error ? <Alert>Could not load Discover.</Alert> : null}
      {isNotConnected(startScan.error) ? (
        <Alert tone="warning">{firstScan ? 'Connect Saxo to run the first scan.' : 'Connect Saxo to refresh.'}</Alert>
      ) : null}
      <SearchBar filters={typed} onChange={setFilters} screen={screen} />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-8">
        <aside aria-label="Filters" className="hidden w-[240px] shrink-0 lg:sticky lg:top-4 lg:block">
          <BrowseFilters filters={typed} facets={facets} onChange={setFilters} />
        </aside>
        <details className="rounded-xl bg-pane px-4 lg:hidden">
          <summary className="flex min-h-[48px] cursor-pointer items-center gap-2 text-[14px] font-semibold text-ink">
            <SlidersHorizontal size={16} aria-hidden /> Filters and sort
          </summary>
          <SortControl filters={typed} onChange={setFilters} screen={screen} className="mb-3 flex" />
          <BrowseFilters filters={typed} facets={facets} onChange={setFilters} />
        </details>
        <div className="flex min-w-0 flex-1 flex-col gap-4" onClickCapture={rememberListing}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ScreenChooser screen={screen} data={data} onChange={(value) => update({ ...typed, sort: defaultSort(value) }, value)} />
            <Segmented label="Results layout" options={LAYOUTS} value={layout} onChange={(value) => update(typed, screen, value, depth)} />
          </div>
          <BrowseResults pages={pages} layout={layout} screen={screen} showFall={screen === 'pullbacks' || typed.minFall != null} health={data?.health}
            onClear={() => update(EMPTY_FILTERS, 'all')} onMore={() => update(typed, screen, layout, depth + 1)} />
        </div>
      </div>
      {data ? <ScanFooter data={data} startScan={startScan} now={now} /> : null}
    </div>
  )
}
