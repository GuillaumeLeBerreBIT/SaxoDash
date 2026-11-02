import { Link, useParams, useSearchParams } from 'react-router-dom'

import { useInvestor } from '../api/queries'
import { Alert, Card, EmptyState, Skeleton, StatusDot, Tile } from '../components/ui'
import ConcentrationPanel from '../components/investors/ConcentrationPanel'
import CopyPerformancePanel from '../components/investors/CopyPerformancePanel'
import HoldingsTab from '../components/investors/HoldingsTab'
import ImportProgress from '../components/investors/ImportProgress'
import InvestorHero, { InvestorActions } from '../components/investors/InvestorHero'
import LatestMoves from '../components/investors/LatestMoves'
import LimitsNote from '../components/investors/LimitsNote'
import { fmtNum, fmtPct } from '../lib/format'
import { fmtCount, fmtFiledDate, fmtUsdCompact, holdingLabel, quarterLabel } from '../lib/investors'

const SPAN_5 = 'min-[1100px]:col-span-5'
const SPAN_7 = 'min-[1100px]:col-span-7'
const SPAN_12 = 'min-[1100px]:col-span-12'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

const back = (
  <Link to="/investors" className="text-ink-2 hover:text-ink hover:underline">← Investors</Link>
)

function Context({ detail }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      {back}
      {detail.quarter ? (
        <>
          <span aria-hidden="true" className="text-ink-3">·</span>
          <StatusDot tone={detail.stale ? 'warn' : 'ok'} />
          <span className="truncate">{`13F for ${quarterLabel(detail.quarter)} · filed ${fmtFiledDate(detail.filed_on)}`}</span>
        </>
      ) : null}
    </span>
  )
}

function topShares(detail) {
  if (detail.top5_weight == null && detail.top10_weight == null) return null
  return `${share(detail.top5_weight)} / ${share(detail.top10_weight)}`
}

function quarterMoves(detail) {
  if (detail.new_count == null) return { value: null, sub: 'first stored quarter' }
  const turnover = detail.turnover == null ? '' : ` · turnover ${fmtPct(detail.turnover, { sign: false, decimals: 0 })}`
  return { value: `${fmtCount(detail.new_count, '+')} / ${fmtCount(detail.exited_count, '−')}`, sub: `new / exited${turnover}` }
}

function sharedWithYou(holdings) {
  const shared = holdings.filter((holding) => holding.owned)
  if (shared.length === 0) return { value: 'None', sub: 'you hold none of their stocks' }
  const largest = shared[0]
  const weight = `${share(largest.weight)} of their book`
  if (shared.length === 1) return { value: holdingLabel(largest), sub: weight }
  return { value: `${shared.length} stocks`, sub: `${holdingLabel(largest)} largest · ${weight}` }
}

function Summary({ detail }) {
  const moves = quarterMoves(detail)
  const shared = sharedWithYou(detail.holdings)
  return (
    <div role="group" aria-label="Portfolio summary" className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
      <Tile label="Reported value" value={fmtUsdCompact(detail.total_value)} sub={`as of ${quarterLabel(detail.quarter)} end`} />
      <Tile label="Positions" value={detail.positions == null ? null : fmtNum(detail.positions)} sub="US-listed longs + options" />
      <Tile label="Top 5 / top 10" value={topShares(detail)} sub="of reported value" />
      <Tile label="This quarter" value={moves.value} sub={moves.sub} />
      <Tile label="Shared with you" value={shared.value} sub={shared.sub} />
    </div>
  )
}

function Fallback({ children }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-medium">{back}</span>
      <h1 className="sr-only">Investor</h1>
      {children}
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

  if (error) return <Fallback><Alert>Could not load this investor. {error.message}</Alert></Fallback>
  if (!data) return <Fallback><Skeleton className="h-64" /></Fallback>

  return (
    <div className="flex flex-col gap-[var(--sd-gap,12px)]">
      <Card context={<Context detail={data} />} right={<InvestorActions detail={data} onQuarter={chooseQuarter} />}>
        <div className="flex flex-col gap-4">
          <InvestorHero detail={data} />
          <ImportProgress progress={data.import} />
          {data.quarter ? <Summary detail={data} /> : null}
        </div>
      </Card>
      {data.quarter ? (
        <div className="grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start">
          <div className={`min-w-0 ${SPAN_5}`}><LatestMoves key={data.quarter} detail={data} /></div>
          <div className={`min-w-0 ${SPAN_7}`}><ConcentrationPanel detail={data} /></div>
          <div className={`min-w-0 ${SPAN_12}`}><CopyPerformancePanel slug={slug} name={data.name} /></div>
          <div className={`min-w-0 ${SPAN_12}`}>
            <Card context={`Every position · ${quarterLabel(data.quarter)}`} title="All holdings">
              <HoldingsTab key={data.quarter} detail={data} />
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <EmptyState title={`Nothing imported for ${data.name} yet`} hint="The newest quarter appears here once its filing lands." />
        </Card>
      )}
      <LimitsNote />
    </div>
  )
}
