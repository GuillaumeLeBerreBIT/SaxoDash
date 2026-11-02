import { Link, useParams } from 'react-router-dom'

import { useCongressMember } from '../api/queries'
import { Card, EmptyState, QueryState, StatusDot, Td, Th, Tile, Tr } from '../components/ui'
import StockLogo from '../components/StockLogo'
import { CopyFigures, CopyPerformanceView } from '../components/investors/CopyPerformancePanel'
import InvestorAvatar from '../components/investors/InvestorAvatar'
import WeightBar from '../components/investors/WeightBar'
import TradeHistory from '../components/congress/TradeHistory'
import { basisNote, filedLine, partyLabel } from '../lib/congress'
import { fmtNum, fmtPct } from '../lib/format'
import { researchHref } from '../lib/research'

const SPAN_8 = 'min-[1100px]:col-span-8'
const SPAN_4 = 'min-[1100px]:col-span-4'
const SPAN_12 = 'min-[1100px]:col-span-12'

const COPY_SUBTITLE = 'Estimated holdings after each report, bought at the close of the first trading day after it was filed and held until the next. Calls count as the stock, which understates their leverage.'

const plural = (count, word) => `${fmtNum(count)} ${word}${count === 1 ? '' : 's'}`

function LeftOut({ basis = {} }) {
  const unseen = basis.unseen_sales == null ? '' : ` · ${plural(basis.unseen_sales, 'unseen sale')}`
  return <Tile label="Left out" value={basis.unpriced == null ? null : fmtNum(basis.unpriced)} sub={`unpriced trades${unseen}`} />
}

function Figures({ member }) {
  if (member.copy?.available) {
    return <CopyFigures copy={member.copy}><LeftOut basis={member.basis} /></CopyFigures>
  }
  return (
    <div role="group" aria-label="What was left out" className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
      <Tile label="Trades" value={member.basis?.trades == null ? null : fmtNum(member.basis.trades)} sub="parsed from House reports" />
      <LeftOut basis={member.basis} />
    </div>
  )
}

function Holdings({ holdings }) {
  const max = Math.max(0, ...holdings.map((held) => held.weight_pct))
  return (
    <Card flush context="From disclosed trades" title="Estimated holdings">
      {holdings.length === 0 ? (
        <EmptyState title="No estimated holdings" hint="Nothing priceable has been bought yet." />
      ) : (
        <table aria-label="Estimated holdings" className="w-full">
          <thead>
            <tr><Th edge>Ticker</Th><Th edge align="right">Weight</Th></tr>
          </thead>
          <tbody>
            {holdings.map((held) => (
              <Tr key={held.ticker}>
                <Td edge>
                  <Link to={researchHref(held.ticker, 'congress')} className="inline-flex items-center gap-2.5 font-bold text-ink hover:underline">
                    <StockLogo ticker={held.ticker} size={28} />
                    {held.ticker}
                  </Link>
                </Td>
                <Td edge align="right">
                  <div className="flex items-center justify-end gap-2">
                    <WeightBar weight={held.weight_pct} max={max} className="w-16" />
                    <span className="num text-ink w-12">{fmtPct(held.weight_pct, { sign: false, decimals: 1 })}</span>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

function Context({ member }) {
  return (
    <span className="flex items-center gap-2 min-w-0">
      <Link to="/investors?tab=congress" className="text-ink-2 hover:text-ink hover:underline">← Congress</Link>
      <span aria-hidden="true" className="text-ink-3">·</span>
      <StatusDot tone={member.last_filed ? 'ok' : 'off'} />
      <span className="truncate">{`House periodic transaction reports · ${filedLine(member.last_filed)}`}</span>
    </span>
  )
}

export default function CongressMember() {
  const { slug } = useParams()
  const query = useCongressMember(slug)
  if (query.isLoading || query.error) {
    return <QueryState isLoading={query.isLoading} error={query.error} onRetry={query.refetch} label="this member" />
  }
  const member = query.data
  return (
    <div className="flex flex-col gap-[var(--sd-gap,12px)]">
      <Card context={<Context member={member} />}>
        <div className="flex flex-col gap-4">
          <header className="flex items-center gap-4 flex-wrap">
            <InvestorAvatar name={member.name} photo={member.photo_url} size={56} />
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold tracking-tight text-ink [text-wrap:balance]">{member.name}</h1>
              <p className="text-[14px] text-ink-2">{`House · ${partyLabel(member.party, member.state_district)}`}</p>
            </div>
          </header>
          <Figures member={member} />
          <p className="text-[12px] text-ink-3 max-w-[80ch]">{basisNote(member.basis)}</p>
        </div>
      </Card>
      <div className="grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start">
        <div className={`min-w-0 ${SPAN_8}`}>
          <CopyPerformanceView copy={member.copy} name={member.name} subtitle={COPY_SUBTITLE} figures={false} />
        </div>
        <div className={`min-w-0 ${SPAN_4}`}><Holdings holdings={member.holdings} /></div>
        <div className={`min-w-0 ${SPAN_12}`}><TradeHistory trades={member.trades} /></div>
      </div>
    </div>
  )
}
