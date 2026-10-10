import { Link, useParams, useSearchParams } from 'react-router-dom'

import { useInvestor } from '../api/queries'
import { Alert, Card, EmptyState, MetricTile, Skeleton } from '../components/ui'
import ConcentrationPanel from '../components/investors/ConcentrationPanel'
import HoldingsTab from '../components/investors/HoldingsTab'
import ImportProgress from '../components/investors/ImportProgress'
import InvestorHero from '../components/investors/InvestorHero'
import LatestMoves from '../components/investors/LatestMoves'
import LimitsNote from '../components/investors/LimitsNote'
import { fmtNum, fmtPct } from '../lib/format'
import { fmtFiledDate, fmtUsdCompact, quarterLabel } from '../lib/investors'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

const back = (
  <Link to="/investors" className="inline-block text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">← Investors</Link>
)

function Summary({ detail }) {
  return (
    <div role="group" aria-label="Portfolio summary" className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      <MetricTile label="Portfolio" value={fmtUsdCompact(detail.total_value)} hint={`as of ${quarterLabel(detail.quarter)} end`} />
      <MetricTile label="Positions" value={fmtNum(detail.positions)} hint="US-listed longs + options" />
      <MetricTile label="Top 5" value={share(detail.top5_weight)} hint="of reported value" />
      <MetricTile label="Filed" value={fmtFiledDate(detail.filed_on)} hint="up to 45 days after quarter end" />
    </div>
  )
}

export default function Investor() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const quarter = params.get('quarter') ?? undefined
  const { data, error } = useInvestor(slug, quarter)

  const chooseQuarter = (value) => {
    const next = new URLSearchParams(params)
    if (value) next.set('quarter', value)
    else next.delete('quarter')
    setParams(next, { replace: true })
  }

  if (error) return <div className="flex flex-col gap-3">{back}<h1 className="sr-only">Investor</h1><Alert>Could not load this investor. {error.message}</Alert></div>
  if (!data) return <div className="flex flex-col gap-3">{back}<h1 className="sr-only">Investor</h1><Skeleton className="h-64" /></div>

  return (
    <div className="flex flex-col gap-4">
      {back}
      <InvestorHero detail={data} onQuarter={chooseQuarter} />
      <ImportProgress progress={data.import} />
      {data.quarter ? (
        <>
          <Summary detail={data} />
          <LatestMoves key={data.quarter} detail={data} />
          <ConcentrationPanel detail={data} />
          <Card>
            <div className="flex flex-col gap-3">
              <h2 className="text-[var(--fig-md)] font-semibold text-zinc-100">{`All holdings · ${quarterLabel(data.quarter)}`}</h2>
              <HoldingsTab key={data.quarter} detail={data} />
            </div>
          </Card>
        </>
      ) : (
        <EmptyState title={`Nothing imported for ${data.name} yet`} hint="The newest quarter appears here once its filing lands." />
      )}
      <LimitsNote />
    </div>
  )
}
