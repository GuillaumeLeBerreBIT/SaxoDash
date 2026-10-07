import { Link } from 'react-router-dom'

import { useInvestor } from '../../api/queries'
import { Alert, Card, EmptyState, Skeleton } from '../ui'
import InvestorStats from './InvestorStats'
import TopHoldings from './TopHoldings'
import { quarterLabel } from '../../lib/investors'

export function ImportProgress({ progress }) {
  if (!progress) return null
  const done = progress.quarters_expected ? progress.quarters_imported / progress.quarters_expected : 0
  return (
    <div className="flex flex-col gap-1 text-[var(--fig-2xs)] text-blue-400">
      <span className="num font-mono">
        {`Importing history · ${progress.quarters_imported} of ${progress.quarters_expected} quarters · tickers ${progress.cusips_resolved}/${progress.cusips_seen}`}
      </span>
      <span aria-hidden="true" className="block h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <span className="block h-full bg-blue-500/70" style={{ width: `${Math.round(done * 100)}%` }} />
      </span>
    </div>
  )
}

export default function SnapshotPanel({ slug }) {
  const { data, isLoading, error } = useInvestor(slug)

  if (error) return <Alert>Could not load this investor. {error.message}</Alert>
  if (isLoading || !data) return <Card><Skeleton className="h-64" /></Card>

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <ImportProgress progress={data.import} />
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[var(--fig-md)] font-medium text-zinc-50">{data.name}</h2>
            <p className="text-[var(--fig-xs)] text-zinc-500 mt-0.5">
              {data.quarter ? `${data.firm} · ${quarterLabel(data.quarter)}` : data.firm}
            </p>
            {data.stale && data.quarter && (
              <p className="text-[var(--fig-xs)] text-amber-400 mt-0.5">{`No 13F since ${quarterLabel(data.quarter)}`}</p>
            )}
          </div>
          {data.quarter && (
            <Link
              to={`/investors/${slug}`}
              className="inline-flex items-center h-9 px-3.5 rounded-md bg-blue-500 text-white hover:bg-blue-400 text-[var(--fig-sm)] font-medium"
            >
              Open full portfolio →
            </Link>
          )}
        </div>
        {data.quarter ? (
          <>
            <InvestorStats detail={data} />
            <TopHoldings detail={data} slug={slug} />
          </>
        ) : (
          <EmptyState title={`Nothing imported for ${data.name} yet`} hint="The newest quarter appears here once its filing lands." />
        )}
      </div>
    </Card>
  )
}
