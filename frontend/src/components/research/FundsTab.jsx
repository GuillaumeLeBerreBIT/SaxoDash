import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'

import { useOwnership } from '../../api/queries'
import { fmtNum, fmtPct } from '../../lib/format'
import { fmtUsdCompact, quarterLabel } from '../../lib/investors'
import { ownershipTicker } from '../../lib/ownership'
import { Card, CardHeader, EmptyState, QueryState, StatRow, StatStrip, Td, Th, Tr } from '../ui'
import ChangeBadge from '../investors/ChangeBadge'
import InvestorAvatar from '../investors/InvestorAvatar'
import LimitsNote from '../investors/LimitsNote'
import WeightBar from '../investors/WeightBar'

const US_ONLY = '13F filings cover US-listed securities only.'
const SOLD_OUT = 'sold_out'

const shownWeight = (fund) => (fund.kind === SOLD_OUT ? fund.previous_weight : fund.weight)

function Fund({ fund }) {
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <InvestorAvatar name={fund.name} size={24} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <Link to={`/investors/${fund.slug}`} className="font-medium text-zinc-100 hover:text-blue-300 truncate">
            {fund.name}
          </Link>
          {fund.followed ? (
            <>
              <Star size={12} fill="currentColor" aria-hidden="true" className="shrink-0 text-amber-400" />
              <span className="sr-only">Following</span>
            </>
          ) : null}
        </span>
        <span className="block text-[var(--fig-xs)] text-zinc-500 truncate max-w-[260px]">{fund.firm}</span>
      </span>
    </span>
  )
}

function Weight({ fund, max }) {
  const weight = shownWeight(fund)
  const exited = fund.kind === SOLD_OUT
  return (
    <div className="flex items-center justify-end gap-2">
      <span className={`num font-mono ${exited ? 'text-zinc-500' : 'text-zinc-200'}`}>
        {`${exited ? 'was ' : ''}${fmtPct(weight, { sign: false, decimals: 1 })}`}
      </span>
      <WeightBar weight={exited ? 0 : weight} max={max} className="w-16" />
    </div>
  )
}

function Funds({ funds }) {
  const max = Math.max(0, ...funds.map((fund) => fund.weight ?? 0))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[var(--fig-sm)]">
        <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
          <tr>
            <Th edge>Fund</Th>
            <Th>Change</Th>
            <Th align="right">Shares</Th>
            <Th align="right">% of their portfolio</Th>
            <Th edge align="right">Value</Th>
          </tr>
        </thead>
        <tbody>
          {funds.map((fund) => (
            <Tr key={fund.slug}>
              <Td edge><Fund fund={fund} /></Td>
              <Td><ChangeBadge change={fund.kind} pct={fund.kind === SOLD_OUT ? null : fund.change_pct} /></Td>
              <Td align="right" className="num font-mono text-zinc-400">{fmtNum(fund.shares)}</Td>
              <Td align="right"><Weight fund={fund} max={max} /></Td>
              <Td edge align="right" className="num font-mono text-zinc-300">{fmtUsdCompact(fund.value)}</Td>
            </Tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function FundsTab({ symbol, currency }) {
  const ticker = ownershipTicker({ ticker: symbol, currency })
  const ownership = useOwnership(ticker)

  if (!ticker) return <EmptyState title={`No 13F data for ${symbol}`} hint={US_ONLY} />
  if (ownership.isLoading || ownership.error) {
    return (
      <QueryState
        isLoading={ownership.isLoading}
        error={ownership.error}
        onRetry={ownership.refetch}
        label="tracked funds"
      />
    )
  }

  const { quarter, tracked, filed, stock, funds = [] } = ownership.data ?? {}
  if (!quarter) return <EmptyState title="No 13F filings imported yet" hint="Add an investor on the Investors page." />
  if (!stock) return <EmptyState title={`No tracked fund has reported ${symbol}`} hint={US_ONLY} />
  if (funds.length === 0) {
    return <EmptyState title={`No tracked fund reported ${symbol} in ${quarterLabel(quarter)}`} />
  }

  const waiting = tracked - filed
  return (
    <div className="space-y-3">
      <StatStrip>
        <StatRow label="Owners" value={`${stock.owners} of ${tracked}`} note="tracked funds" lead />
        <StatRow label="New" value={stock.new} />
        <StatRow label="Added" value={stock.added} />
        <StatRow label="Trimmed" value={stock.trimmed} />
        <StatRow label="Sold out" value={stock.sold_out} />
      </StatStrip>
      <Card padding={false}>
        <div className="p-4 pb-3">
          <CardHeader
            title={`Tracked funds in ${symbol}`}
            subtitle={`As of ${quarterLabel(quarter)} quarter end, filed up to 45 days later${
              waiting > 0 ? ` · ${waiting} of ${tracked} funds have not filed it yet` : ''
            }`}
          />
        </div>
        <Funds funds={funds} />
      </Card>
      <LimitsNote />
    </div>
  )
}
