import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'

import { useOwnership } from '../../api/queries'
import { fmtNum, fmtPct } from '../../lib/format'
import { fmtUsdCompact, quarterLabel } from '../../lib/investors'
import { ownershipTicker, sharesChange } from '../../lib/ownership'
import { Card, EmptyState, QueryState, Td, Th, Tr } from '../ui'
import ChangeBadge from '../investors/ChangeBadge'
import InvestorAvatar from '../investors/InvestorAvatar'
import LimitsNote from '../investors/LimitsNote'
import WeightBar from '../investors/WeightBar'
import SummaryTiles from './SummaryTiles'

const US_ONLY = '13F filings cover US-listed securities only.'
const SOLD_OUT = 'sold_out'
const PCT_LIMIT = 1000

const BOARD = 'grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start'
const SPAN_12 = 'min-[1100px]:col-span-12'

const shownWeight = (fund) => (fund.kind === SOLD_OUT ? fund.previous_weight : fund.weight)

function Fund({ fund }) {
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <InvestorAvatar name={fund.name} photo={fund.photo_url} logo={fund.logo_url} size={28} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <Link to={`/investors/${fund.slug}`} className="font-bold text-ink hover:underline truncate max-w-[190px]">
            {fund.name}
          </Link>
          {fund.followed ? (
            <>
              <Star size={12} fill="currentColor" aria-hidden="true" className="shrink-0 text-warn" />
              <span className="sr-only">Following</span>
            </>
          ) : null}
        </span>
        <span className="block text-[12px] text-ink-3 truncate max-w-[190px]">{fund.firm}</span>
      </span>
    </span>
  )
}

function Weight({ fund, max }) {
  const weight = shownWeight(fund)
  const exited = fund.kind === SOLD_OUT
  return (
    <div className="flex items-center justify-end gap-2">
      <span className={`num ${exited ? 'text-ink-3' : 'text-ink'}`}>
        {`${exited ? 'was ' : ''}${fmtPct(weight, { sign: false, decimals: 1 })}`}
      </span>
      <WeightBar weight={exited ? 0 : weight} max={max} className="w-12" />
    </div>
  )
}

function Funds({ funds }) {
  const max = Math.max(0, ...funds.map((fund) => fund.weight ?? 0))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
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
              <Td align="right" className="text-ink-2">{fmtNum(fund.shares)}</Td>
              <Td align="right"><Weight fund={fund} max={max} /></Td>
              <Td edge align="right" className="text-ink">{fmtUsdCompact(fund.value)}</Td>
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
  const change = sharesChange(stock)
  const up = change?.direction === 'up'
  const changePct = change?.pct != null && Math.abs(change.pct) < PCT_LIMIT ? fmtPct(change.pct, { decimals: 1 }) : null
  const label = `Tracked funds in ${symbol}, ${quarterLabel(quarter)}`
  return (
    <div className={BOARD}>
      <Card
        className={SPAN_12}
        context={`As of ${quarterLabel(quarter)} quarter end, filed up to 45 days later${
          waiting > 0 ? ` · ${waiting} of ${tracked} funds have not filed it yet` : ''
        }`}
        dot={waiting > 0 ? 'warn' : 'ok'}
        title={`Tracked funds in ${symbol}`}
      >
        <SummaryTiles
          label={label}
          columns="grid-cols-2 sm:grid-cols-4"
          tiles={[
            { label: 'Owners', value: `${stock.owners} of ${tracked}`, sub: 'tracked funds' },
            { label: 'Shares held', value: fmtNum(stock.shares), sub: 'at quarter end' },
            {
              label: 'Net change',
              value: change ? `${up ? '▲' : '▼'}\u00a0${up ? '+' : '-'}${fmtNum(change.shares)}` : null,
              tone: change ? (up ? 'up' : 'down') : undefined,
              sub: changePct ? (
                <>
                  <span>{changePct}</span> shares vs last quarter
                </>
              ) : (
                'shares vs last quarter'
              ),
            },
            { label: 'New', value: String(stock.new) },
            { label: 'Added', value: String(stock.added) },
            { label: 'Trimmed', value: String(stock.trimmed) },
            { label: 'Sold out', value: String(stock.sold_out) },
          ]}
        />
      </Card>
      <Card flush className={SPAN_12} context="Each fund's position and its move this quarter" dot="ok" title="Who owns it">
        <Funds funds={funds} />
        <div className="px-[18px] pt-3">
          <LimitsNote />
        </div>
      </Card>
    </div>
  )
}
