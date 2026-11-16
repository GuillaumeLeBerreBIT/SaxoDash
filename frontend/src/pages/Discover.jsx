import { useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'

import { isNotConnected } from '../api/client'
import { useDiscover, useStartDiscoverScan } from '../api/queries'
import DiscoverHealth from '../components/discover/DiscoverHealth'
import ScanProgress from '../components/discover/ScanProgress'
import ShelfBrowser from '../components/discover/ShelfBrowser'
import WorthALook from '../components/discover/WorthALook'
import { REFRESH_HINT, SCANNING_POLL_MS, updatedLabel } from '../lib/discover'
import { fmtDateTime } from '../lib/format'
import { useNow } from '../lib/useNow'
import { Alert, Button, Card, Skeleton } from '../components/ui'

const SKELETON_SHELVES = 3
const SHELVES_HIDDEN = new Set(['never', 'scanning'])

const exactTime = fmtDateTime

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

function ScanControls({ health, startScan }) {
  const scanning = Boolean(health?.progress)
  return (
    <Button size="sm" title={REFRESH_HINT} onClick={() => startScan.mutate()} disabled={scanning || startScan.isPending}>
      <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
      {scanning ? 'Scanning…' : 'Refresh'}
    </Button>
  )
}

const DOT_BY_STATE = { ok: 'ok', stale: 'warn', failed: 'error', scanning: 'earn', never: 'off' }

function ScanStatus({ health, now }) {
  return (
    <>
      S&P 500 ∪ Nasdaq-100 ·{' '}
      <span title={health?.last_ok_at ? exactTime(health.last_ok_at) : undefined}>{updatedLabel(health?.last_ok_at, now)}</span>
    </>
  )
}

export default function Discover() {
  const { data, isLoading, error } = useDiscover()
  const startScan = useFirstScanOnOpen(data?.health)
  const now = useNow(data?.health?.progress ? SCANNING_POLL_MS : 60_000)
  const showShelves = data && !SHELVES_HIDDEN.has(data.health?.state)
  const firstScan = data?.health?.state === 'never'

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Discover</h1>
      {error ? <Alert>Could not load Discover.</Alert> : null}
      {isNotConnected(startScan.error) ? (
        <Alert tone="warning">{firstScan ? 'Connect Saxo to run the first scan.' : 'Connect Saxo to refresh.'}</Alert>
      ) : null}
      {data ? (
        <section aria-label="Scan status">
          <Card
            dot={DOT_BY_STATE[data.health?.state] ?? 'ok'}
            context={<ScanStatus health={data.health} now={now} />}
            right={<ScanControls health={data.health} startScan={startScan} />}
            className="space-y-3"
          >
            <ScanProgress progress={data.health?.progress} now={now} />
            <DiscoverHealth health={data.health} asOf={data.as_of} />
          </Card>
        </section>
      ) : null}
      {isLoading ? Array.from({ length: SKELETON_SHELVES }, (_, i) => <ShelfSkeleton key={i} />) : null}
      {showShelves ? <WorthALook /> : null}
      {showShelves ? <ShelfBrowser shelves={data.shelves} /> : null}
    </div>
  )
}
