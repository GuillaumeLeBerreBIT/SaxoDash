import { Link, useParams } from 'react-router-dom'

import { useCongressMember } from '../api/queries'
import { Card, CardHeader, EmptyState, PageHeader, QueryState, Td, Th, Tr } from '../components/ui'
import { CopyPerformanceView } from '../components/investors/CopyPerformancePanel'
import WeightBar from '../components/investors/WeightBar'
import TradeHistory from '../components/congress/TradeHistory'
import { basisNote, partyLabel } from '../lib/congress'
import { fmtPct } from '../lib/format'
import { researchHref } from '../lib/research'

const COPY_SUBTITLE = 'Estimated holdings after each report, bought at the close of the first trading day after it was filed and held until the next. Calls count as the stock, which understates their leverage.'

function Holdings({ holdings }) {
  if (holdings.length === 0) return <EmptyState title="No estimated holdings" hint="Nothing priceable has been bought since 2021." />
  const max = Math.max(...holdings.map((held) => held.weight_pct))
  return (
    <Card padding={false}>
      <div className="p-4 pb-3"><CardHeader title="Estimated holdings" subtitle="From disclosed trades since 2021" /></div>
      <table className="w-full text-[var(--fig-sm)]">
        <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
          <tr><Th edge>Ticker</Th><Th edge align="right">Weight</Th></tr>
        </thead>
        <tbody>
          {holdings.map((held) => (
            <Tr key={held.ticker}>
              <Td edge><Link to={researchHref(held.ticker, 'congress')} className="font-mono font-semibold text-zinc-100 hover:text-blue-300">{held.ticker}</Link></Td>
              <Td edge align="right">
                <div className="flex items-center justify-end gap-2">
                  <span className="num font-mono text-zinc-200">{fmtPct(held.weight_pct, { sign: false, decimals: 1 })}</span>
                  <WeightBar weight={held.weight_pct} max={max} className="w-16" />
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </table>
    </Card>
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
    <div className="flex flex-col gap-6">
      <Link to="/investors?tab=congress" className="inline-block text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">← Congress</Link>
      <PageHeader title={member.name} subtitle={`House · ${partyLabel(member.party, member.state_district)}`} />
      <p className="text-[var(--fig-xs)] text-zinc-500 max-w-[80ch]">{basisNote(member.basis)}</p>
      <CopyPerformanceView copy={member.copy} name={member.name} subtitle={COPY_SUBTITLE} />
      <Holdings holdings={member.holdings} />
      <TradeHistory trades={member.trades} />
    </div>
  )
}
