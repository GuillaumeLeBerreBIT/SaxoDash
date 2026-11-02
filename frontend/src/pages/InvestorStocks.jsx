import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useCongressOwnershipSummary, useInvestorStocks } from '../api/queries'
import { Alert, Button, Card, EmptyState, Segmented, Select, Skeleton, Td, Th, Tr } from '../components/ui'
import StockLogo from '../components/StockLogo'
import CongressActivity from '../components/congress/CongressActivity'
import InvestorAvatar from '../components/investors/InvestorAvatar'
import LimitsNote from '../components/investors/LimitsNote'
import { STOCK_VIEWS, stockLabel } from '../lib/investorHub'
import { PAGE_SIZE, PAGE_STEP, fmtUsdCompact, quarterLabel } from '../lib/investors'

const VIEW_KEYS = new Set(STOCK_VIEWS.map(([key]) => key))
const DEFAULT_VIEW = 'bought'
const VIEW_OPTIONS = STOCK_VIEWS.map(([value, label]) => ({ value, label }))
const VIEW_LABELS = Object.fromEntries(STOCK_VIEWS)

function Stock({ row }) {
  const label = stockLabel(row)
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <StockLogo ticker={row.ticker} label={label} size={28} />
      <span className="min-w-0">
        {row.ticker
          ? <Link to={`/research?symbol=${encodeURIComponent(row.ticker)}`} className="font-bold text-ink hover:underline">{label}</Link>
          : <span className="font-semibold text-ink">{label}</span>}
        {row.ticker ? <span className="block text-[12px] text-ink-3 truncate">{row.issuer}</span> : null}
      </span>
    </span>
  )
}

function Faces({ investors }) {
  return (
    <span className="flex -space-x-1.5">
      {investors.map((investor) => (
        <Link key={investor.slug} to={`/investors/${investor.slug}`} title={investor.name} aria-label={investor.name}>
          <InvestorAvatar name={investor.name} photo={investor.photo_url} logo={investor.logo_url} size={22} className="ring-2 ring-pane" />
        </Link>
      ))}
    </span>
  )
}

function Rows({ rows, title }) {
  const [shown, setShown] = useState(PAGE_SIZE)
  const visible = useMemo(() => rows.slice(0, shown), [rows, shown])
  const tickers = useMemo(() => visible.map((row) => row.ticker).filter(Boolean), [visible])
  const congress = useCongressOwnershipSummary(tickers).data
  return (
    <>
      <Card flush context={`${rows.length} stocks · counted by fund`} title={title}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <Th edge>Stock</Th>
                <Th align="right">Owners</Th>
                <Th align="right">Bought</Th>
                <Th align="right">Sold</Th>
                <Th align="right">New</Th>
                <Th align="right">Held value</Th>
                <Th align="right" hideBelow="md">Congress</Th>
                <Th edge>Funds</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <Tr key={row.cusip}>
                  <Td edge><Stock row={row} /></Td>
                  <Td align="right" className="text-ink">{row.owners}</Td>
                  <Td align="right" className="text-ink">{row.bought}</Td>
                  <Td align="right" className="text-ink">{row.sold}</Td>
                  <Td align="right" className="text-ink-2">{row.new}</Td>
                  <Td align="right" className="text-ink-2">{fmtUsdCompact(row.value)}</Td>
                  <Td align="right" hideBelow="md">
                    <CongressActivity ticker={row.ticker} stock={congress?.stocks?.[row.ticker]} windowDays={congress?.window_days} />
                  </Td>
                  <Td edge><Faces investors={row.investors} /></Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {shown < rows.length ? (
        <div className="flex items-center justify-between gap-3 text-[12px] text-ink-3 num">
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
    <div className="flex flex-col gap-[var(--sd-gap,12px)]">
      <Card
        context={(
          <span className="flex items-center gap-2 min-w-0">
            <Link to="/investors" className="text-ink-2 hover:text-ink hover:underline">← Investors</Link>
            <span aria-hidden="true" className="text-ink-3">·</span>
            <span className="truncate">What the tracked investors own, bought and sold, counted by fund</span>
          </span>
        )}
        title="Stocks"
        titleAs="h1"
        right={data?.quarters.length ? (
          <Select
            aria-label="Quarter"
            value={data.quarter ?? ''}
            onChange={(e) => update('quarter', e.target.value === data.signal_quarter ? null : e.target.value)}
            className="h-8 text-[13px]"
          >
            {data.quarters.map((q) => <option key={q} value={q}>{quarterLabel(q)}</option>)}
          </Select>
        ) : null}
      >
        <Segmented label="Stock view" options={VIEW_OPTIONS} value={view} onChange={(key) => update('view', key === DEFAULT_VIEW ? null : key)} />
      </Card>
      {error ? (
        <Alert>Could not load stock activity. {error.message}</Alert>
      ) : isLoading || !data ? (
        <Skeleton className="h-64" />
      ) : data.rows.length === 0 ? (
        <Card><EmptyState title={`No stocks with that activity in ${quarterLabel(data.quarter)}.`} /></Card>
      ) : (
        <Rows key={`${view}:${data.quarter}`} rows={data.rows} title={`${VIEW_LABELS[view]} · ${quarterLabel(data.quarter)}`} />
      )}
      <LimitsNote />
    </div>
  )
}
