import { useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'

import { isNotConnected } from '../api/client'
import { useDiscover, useStartDiscoverScan } from '../api/queries'
import DiscoverHealth from '../components/discover/DiscoverHealth'
import ScanProgress from '../components/discover/ScanProgress'
import ShelfRow from '../components/discover/ShelfRow'
import { updatedLabel } from '../lib/discover'
import { Alert, Button, PageHeader, Skeleton } from '../components/ui'

const SHELVES_HIDDEN = new Set(['never', 'scanning'])

const exactTime = (iso) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

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
    <div className="flex flex-col-reverse items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span
        className="text-[var(--fig-xs)] text-zinc-500 whitespace-nowrap"
        title={health?.last_ok_at ? exactTime(health.last_ok_at) : undefined}
      >
        {updatedLabel(health?.last_ok_at)}
      </span>
      <Button size="sm" onClick={() => startScan.mutate()} disabled={scanning || startScan.isPending}>
        <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} />
        {scanning ? 'Scanning…' : 'Refresh'}
      </Button>
    </div>
  )
}

export default function Discover() {
  const { data, isLoading, error } = useDiscover()
  const startScan = useFirstScanOnOpen(data?.health)
  const firstScan = data?.health?.state === 'never'

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discover"
        subtitle="S&P 500 and Nasdaq-100"
        right={data ? <ScanControls health={data.health} startScan={startScan} /> : null}
      />
      {error ? <Alert>Could not load Discover.</Alert> : null}
      {isNotConnected(startScan.error) ? (
        <Alert tone="warning">{firstScan ? 'Connect Saxo to run the first scan.' : 'Connect Saxo to refresh.'}</Alert>
      ) : null}
      {data ? <ScanProgress progress={data.health?.progress} /> : null}
      {data ? <DiscoverHealth health={data.health} asOf={data.as_of} /> : null}
      {isLoading ? <Skeleton className="h-48" /> : null}
      {data && !SHELVES_HIDDEN.has(data.health?.state) ? data.shelves.map((shelf) => <ShelfRow key={shelf.key} shelf={shelf} />) : null}
    </div>
  )
}
