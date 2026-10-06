import { Link, useParams, useSearchParams } from 'react-router-dom'

import { useInvestor } from '../api/queries'
import { Alert, Card, EmptyState, PageHeader, Select, Skeleton, TabButton, TabList } from '../components/ui'
import ChangesTab from '../components/investors/ChangesTab'
import HoldingsTab from '../components/investors/HoldingsTab'
import InvestorStats from '../components/investors/InvestorStats'
import LimitsNote from '../components/investors/LimitsNote'
import { ImportProgress } from '../components/investors/SnapshotPanel'
import { quarterLabel } from '../lib/investors'

const TABS = [['holdings', 'Holdings'], ['changes', 'Changes']]

export default function Investor() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const quarter = params.get('quarter') ?? undefined
  const tab = params.get('tab') === 'changes' ? 'changes' : 'holdings'
  const { data, isLoading, error } = useInvestor(slug, quarter)

  const update = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)))
    setParams(next, { replace: true })
  }

  const back = (
    <Link to={`/investors?investor=${slug}`} className="inline-block text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">
      ← Investors
    </Link>
  )

  if (error) return <div className="flex flex-col gap-3">{back}<Alert>Could not load this investor. {error.message}</Alert></div>
  if (isLoading || !data) return <div className="flex flex-col gap-3">{back}<Skeleton className="h-64" /></div>

  const subtitle = data.stale && data.quarter
    ? <>{data.firm} · <span className="text-amber-400">{`No 13F since ${quarterLabel(data.quarter)}`}</span></>
    : data.firm

  return (
    <div className="flex flex-col gap-4">
      {back}
      <PageHeader
        title={data.name}
        subtitle={subtitle}
        right={
          data.quarters.length > 0 && (
            <label className="flex items-center gap-2 text-[var(--fig-xs)] text-zinc-500">
              Quarter
              <Select aria-label="Quarter" value={data.quarter} onChange={(e) => update({ quarter: e.target.value === data.quarters[0] ? null : e.target.value })}>
                {data.quarters.map((q) => <option key={q} value={q}>{quarterLabel(q)}</option>)}
              </Select>
            </label>
          )
        }
      />
      <ImportProgress progress={data.import} />
      {data.quarter ? (
        <Card>
          <div className="flex flex-col gap-4">
            <InvestorStats detail={data} />
            <TabList>
              {TABS.map(([key, label]) => (
                <TabButton key={key} active={tab === key} onClick={() => update({ tab: key === 'holdings' ? null : key })}>{label}</TabButton>
              ))}
            </TabList>
            {tab === 'holdings' ? <HoldingsTab key={data.quarter} detail={data} /> : <ChangesTab slug={slug} quarter={quarter} />}
          </div>
        </Card>
      ) : (
        <EmptyState title={`Nothing imported for ${data.name} yet`} hint="The newest quarter appears here once its filing lands." />
      )}
      <LimitsNote />
    </div>
  )
}
