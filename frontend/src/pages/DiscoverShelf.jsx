import { Link, useParams } from 'react-router-dom'

import { useDiscoverShelf } from '../api/queries'
import { formatShelfMetric } from '../lib/discover'
import { fmtMoney } from '../lib/format'
import { chartHref } from '../lib/research'
import { Alert, Card, DayChange, InstrumentLogo, PageHeader, Skeleton, Td, Th, Tr } from '../components/ui'

export default function DiscoverShelf() {
  const { key } = useParams()
  const { data, isLoading, error } = useDiscoverShelf(key)

  return (
    <div className="space-y-4">
      <PageHeader
        title={data?.title ?? 'Discover'}
        subtitle={data?.subtitle}
        right={<Link to="/discover" className="text-[var(--fig-xs)] text-blue-400">Back to Discover</Link>}
      />
      {error ? <Alert>{error.status === 404 ? 'No such shelf.' : 'Could not load this shelf.'}</Alert> : null}
      {isLoading ? <Skeleton className="h-64" /> : null}
      {data ? (
        <Card padding={false}>
          <table className="w-full">
            <thead>
              <tr>
                <Th edge>Stock</Th>
                <Th align="right">Last</Th>
                <Th align="right">1 day</Th>
                <Th align="right" edge>Why it is here</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <Tr key={`${item.uic}:${item.asset_type}`}>
                  <Td edge>
                    <Link to={chartHref(item.ticker, { uic: item.uic, assetType: item.asset_type })} className="flex items-center gap-2 text-zinc-100 hover:text-blue-300">
                      <InstrumentLogo symbol={item.ticker} size={20} className="rounded" fallback={<span className="w-5 h-5 rounded bg-zinc-800" />} />
                      <span className="font-semibold">{item.ticker}</span>
                      <span className="text-zinc-500 truncate hidden sm:inline">{item.name}</span>
                    </Link>
                  </Td>
                  <Td align="right"><span className="num font-mono">{fmtMoney(item.last_close, 'USD')}</span></Td>
                  <Td align="right"><DayChange value={item.change_1d} /></Td>
                  <Td align="right" edge>{formatShelfMetric(data.metric, item.metric_value)}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  )
}
