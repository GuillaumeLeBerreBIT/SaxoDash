import { useEffect, useRef } from 'react'

import { isNotConnected } from '../api/client'
import { useDiscover, useStartDiscoverScan } from '../api/queries'
import DiscoverHealth from '../components/discover/DiscoverHealth'
import ScanProgress from '../components/discover/ScanProgress'
import ShelfRow from '../components/discover/ShelfRow'
import { Alert, PageHeader, Skeleton } from '../components/ui'

const SHELVES_HIDDEN = new Set(['never', 'scanning'])

const asOfLabel = (iso) =>
  iso
    ? `S&P 500 and Nasdaq-100 · data as of ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'S&P 500 and Nasdaq-100'

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

export default function Discover() {
  const { data, isLoading, error } = useDiscover()
  const startScan = useFirstScanOnOpen(data?.health)

  return (
    <div className="space-y-6">
      <PageHeader title="Discover" subtitle={asOfLabel(data?.as_of)} />
      {error ? <Alert>Could not load Discover.</Alert> : null}
      {isNotConnected(startScan.error) ? <Alert tone="warning">Connect Saxo to run the first scan.</Alert> : null}
      {data ? <ScanProgress progress={data.health?.progress} /> : null}
      {data ? <DiscoverHealth health={data.health} asOf={data.as_of} /> : null}
      {isLoading ? <Skeleton className="h-48" /> : null}
      {data && !SHELVES_HIDDEN.has(data.health?.state) ? data.shelves.map((shelf) => <ShelfRow key={shelf.key} shelf={shelf} />) : null}
    </div>
  )
}
