import { useDiscover } from '../api/queries'
import DiscoverHealth from '../components/discover/DiscoverHealth'
import ShelfRow from '../components/discover/ShelfRow'
import { Alert, PageHeader, Skeleton } from '../components/ui'

const asOfLabel = (iso) =>
  iso
    ? `S&P 500 and Nasdaq-100 · data as of ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'S&P 500 and Nasdaq-100'

export default function Discover() {
  const { data, isLoading, error } = useDiscover()

  return (
    <div className="space-y-6">
      <PageHeader title="Discover" subtitle={asOfLabel(data?.as_of)} />
      {error ? <Alert>Could not load Discover.</Alert> : null}
      {data ? <DiscoverHealth health={data.health} asOf={data.as_of} /> : null}
      {isLoading ? <Skeleton className="h-48" /> : null}
      {data && data.health?.state !== 'never' ? data.shelves.map((shelf) => <ShelfRow key={shelf.key} shelf={shelf} />) : null}
    </div>
  )
}
