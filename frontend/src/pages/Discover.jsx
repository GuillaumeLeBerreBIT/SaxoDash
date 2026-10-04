import { useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'

import { isNotConnected } from '../api/client'
import { useDiscover, useStartDiscoverScan } from '../api/queries'
import DiscoverHealth from '../components/discover/DiscoverHealth'
import ScanProgress from '../components/discover/ScanProgress'
import ShelfRow from '../components/discover/ShelfRow'
import { REFRESH_HINT, groupShelves, SCANNING_POLL_MS, updatedLabel } from '../lib/discover'
import { useNow } from '../lib/useNow'
import { Alert, Button, PageHeader, Skeleton } from '../components/ui'

const SKELETON_SHELVES = 3
const SHELVES_HIDDEN = new Set(['never', 'scanning'])

const exactTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function ShelfGroup({ group, children }) {
  return (
    <section aria-labelledby={`group-${group.key}`} className="space-y-6">
      <h2 id={`group-${group.key}`} className="text-[var(--fig-xs)] font-semibold uppercase tracking-wider text-zinc-500">{group.title}</h2>
      {children}
    </section>
  )
}

function ShelfSkeleton() {
  return (
    <div data-testid="shelf-skeleton" className="space-y-2">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-3 w-72 max-w-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40 hidden sm:block" />
        <Skeleton className="h-40 hidden sm:block" />
      </div>
    </div>
  )
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

function ScanControls({ health, startScan, now }) {
  const scanning = Boolean(health?.progress)
  return (
    <div className="flex flex-col-reverse items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span
        className="text-[var(--fig-xs)] text-zinc-500 whitespace-nowrap"
        title={health?.last_ok_at ? exactTime(health.last_ok_at) : undefined}
      >
        {updatedLabel(health?.last_ok_at, now)}
      </span>
      <Button size="sm" title={REFRESH_HINT} onClick={() => startScan.mutate()} disabled={scanning || startScan.isPending}>
        <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
        {scanning ? 'Scanning…' : 'Refresh'}
      </Button>
    </div>
  )
}

export default function Discover() {
  const { data, isLoading, error } = useDiscover()
  const startScan = useFirstScanOnOpen(data?.health)
  const now = useNow(data?.health?.progress ? SCANNING_POLL_MS : 60_000)
  const showShelves = data && !SHELVES_HIDDEN.has(data.health?.state)
  const firstScan = data?.health?.state === 'never'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discover"
        subtitle="S&P 500 and Nasdaq-100"
        right={data ? <ScanControls health={data.health} startScan={startScan} now={now} /> : null}
      />
      {error ? <Alert>Could not load Discover.</Alert> : null}
      {isNotConnected(startScan.error) ? (
        <Alert tone="warning">{firstScan ? 'Connect Saxo to run the first scan.' : 'Connect Saxo to refresh.'}</Alert>
      ) : null}
      {data ? <ScanProgress progress={data.health?.progress} now={now} /> : null}
      {data ? <DiscoverHealth health={data.health} asOf={data.as_of} /> : null}
      {isLoading ? Array.from({ length: SKELETON_SHELVES }, (_, i) => <ShelfSkeleton key={i} />) : null}
      {showShelves
        ? groupShelves(data.groups, data.shelves).map((group) => (
            <ShelfGroup key={group.key} group={group}>
              {group.shelves.map((shelf) => <ShelfRow key={shelf.key} shelf={shelf} />)}
            </ShelfGroup>
          ))
        : null}
    </div>
  )
}
