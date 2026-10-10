import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useInvestorStocks } from '../api/queries'
import { Alert, Button, Card, EmptyState, InstrumentLogo, LetterAvatar, PageHeader, Select, Skeleton, TBtn, Td, Th, Tr } from '../components/ui'
import InvestorAvatar from '../components/investors/InvestorAvatar'
import LimitsNote from '../components/investors/LimitsNote'
import { STOCK_VIEWS, stockLabel } from '../lib/investorHub'
import { PAGE_SIZE, PAGE_STEP, fmtUsdCompact, quarterLabel } from '../lib/investors'

const VIEW_KEYS = new Set(STOCK_VIEWS.map(([key]) => key))
const DEFAULT_VIEW = 'bought'

function Stock({ row }) {
  const label = stockLabel(row)
  return (
    <span className="flex items-center gap-2 min-w-0">
      <InstrumentLogo symbol={row.ticker} size={22} className="rounded" fallback={<LetterAvatar symbol={label} size={22} />} />
      <span className="min-w-0">
        {row.ticker
          ? <Link to={`/research?symbol=${encodeURIComponent(row.ticker)}`} className="font-mono font-semibold text-zinc-100 hover:text-blue-300">{label}</Link>
          : <span className="text-zinc-200">{label}</span>}
        {row.ticker ? <span className="block text-[var(--fig-2xs)] text-zinc-500 truncate">{row.issuer}</span> : null}
      </span>
    </span>
  )
}

function Faces({ investors }) {
  return (
    <span className="flex -space-x-1.5">
      {investors.map((investor) => (
        <Link key={investor.slug} to={`/investors/${investor.slug}`} title={investor.name} aria-label={investor.name}>
          <InvestorAvatar name={investor.name} size={22} className="ring-2 ring-zinc-900" />
        </Link>
      ))}
    </span>
  )
}

function Rows({ rows }) {
  const [shown, setShown] = useState(PAGE_SIZE)
  return (
    <>
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[var(--fig-sm)]">
            <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
              <tr>
                <Th edge>Stock</Th>
                <Th align="right">Owners</Th>
                <Th align="right">Bought</Th>
                <Th align="right">Sold</Th>
                <Th align="right">New</Th>
                <Th align="right">Held value</Th>
                <Th edge>Funds</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, shown).map((row) => (
                <Tr key={row.cusip}>
                  <Td edge><Stock row={row} /></Td>
                  <Td align="right" className="num font-mono text-zinc-200">{row.owners}</Td>
                  <Td align="right" className="num font-mono text-emerald-400">{row.bought}</Td>
                  <Td align="right" className="num font-mono text-red-400">{row.sold}</Td>
                  <Td align="right" className="num font-mono text-zinc-400">{row.new}</Td>
                  <Td align="right" className="num font-mono text-zinc-400">{fmtUsdCompact(row.value)}</Td>
                  <Td edge><Faces investors={row.investors} /></Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {shown < rows.length ? (
        <div className="flex items-center justify-between gap-3 text-[var(--fig-xs)] text-zinc-500">
          <span>{`Showing ${shown} of ${rows.length}`}</span>
          <Button size="sm" onClick={() => setShown(shown + PAGE_STEP)}>Show more</Button>
        </div>
      ) : null}
    </>
  )
}

export default function InvestorStocks() {
  const [params, setParams] = useSearchParams()
  const view = VIEW_KEYS.has(params.get('view')) ? params.get('view') : DEFAULT_VIEW
  const quarter = params.get('quarter') ?? undefined
  const { data, isLoading, error } = useInvestorStocks(view, quarter)

  const update = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to="/investors" className="inline-block text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">← Investors</Link>
      <PageHeader
        title="Stocks"
        subtitle="What the tracked investors own, bought and sold, counted by fund"
        right={data?.quarters.length ? (
          <label className="flex items-center gap-2 text-[var(--fig-xs)] text-zinc-500">
            Quarter
            <Select aria-label="Quarter" value={data.quarter ?? ''} onChange={(e) => update('quarter', e.target.value === data.signal_quarter ? null : e.target.value)}>
              {data.quarters.map((q) => <option key={q} value={q}>{quarterLabel(q)}</option>)}
            </Select>
          </label>
        ) : null}
      />
      <div role="group" aria-label="Stock view" className="flex items-center gap-0.5 flex-wrap">
        {STOCK_VIEWS.map(([key, label]) => (
          <TBtn key={key} active={view === key} onClick={() => update('view', key === DEFAULT_VIEW ? null : key)}>{label}</TBtn>
        ))}
      </div>
      {error ? (
        <Alert>Could not load stock activity. {error.message}</Alert>
      ) : isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : data.rows.length === 0 ? (
        <EmptyState title={`No stocks with that activity in ${quarterLabel(data.quarter)}.`} />
      ) : (
        <Rows key={`${view}:${data.quarter}`} rows={data.rows} />
      )}
      <LimitsNote />
    </div>
  )
}
