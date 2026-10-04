import { Link, useParams } from 'react-router-dom'
import { CandlestickChart } from 'lucide-react'

import { useDiscoverShelf } from '../api/queries'
import { reasonsLine, stockCount, updatedLabel } from '../lib/discover'
import { fmtMoney } from '../lib/format'
import { chartHref, researchHref } from '../lib/research'
import TickerInitial from '../components/discover/TickerInitial'
import WatchlistStar from '../components/discover/WatchlistStar'
import { Alert, Card, DayChange, InstrumentLogo, PageHeader, Skeleton, Td, Th, Tr } from '../components/ui'

export default function DiscoverShelf() {
  const { key } = useParams()
  const { data, isLoading, error } = useDiscoverShelf(key)

  return (
    <div className="space-y-4">
      <Link to="/discover" className="inline-block text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">← Discover</Link>
      <PageHeader
        title={data?.title ?? 'Discover'}
        subtitle={data ? `${stockCount(data.total)} · ${data.subtitle} · ${data.order}` : undefined}
        right={data ? <span className="text-[var(--fig-xs)] text-zinc-500 whitespace-nowrap">{updatedLabel(data.as_of)}</span> : null}
      />
      {error ? <Alert>{error.status === 404 ? 'No such shelf.' : 'Could not load this shelf.'}</Alert> : null}
      {isLoading ? <Skeleton className="h-64" /> : null}
      {data ? (
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th edge>Stock</Th>
                  <Th align="right">Last</Th>
                  <Th align="right">1 day</Th>
                  <Th>Why it is here</Th>
                  <Th align="right" edge><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const instrument = { uic: item.uic, assetType: item.asset_type }
                  return (
                    <Tr key={`${item.uic}:${item.asset_type}`}>
                      <Td edge>
                        <Link to={researchHref(item.ticker, 'overview', instrument)} className="flex items-center gap-2 text-zinc-100 hover:text-blue-300">
                          <InstrumentLogo symbol={item.ticker} size={20} className="rounded" fallback={<TickerInitial ticker={item.ticker} size={20} />} />
                          <span className="font-semibold">{item.ticker}</span>
                          <span className="text-zinc-500 truncate hidden sm:inline">{item.name}</span>
                        </Link>
                      </Td>
                      <Td align="right"><span className="num font-mono">{fmtMoney(item.last_close, 'USD')}</span></Td>
                      <Td align="right"><DayChange value={item.change_1d} /></Td>
                      <Td>{reasonsLine(item.reasons)}</Td>
                      <Td align="right" edge>
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={chartHref(item.ticker, instrument)}
                            aria-label={`Open ${item.ticker} chart`}
                            title="Open chart"
                            className="w-10 h-10 sm:w-6 sm:h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                          >
                            <CandlestickChart size={14} />
                          </Link>
                          <WatchlistStar ticker={item.ticker} name={item.name} uic={item.uic} assetType={item.asset_type} />
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
