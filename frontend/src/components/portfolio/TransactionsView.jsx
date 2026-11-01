import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTransactions } from '../../api/queries'
import { fmtDate, fmtQty } from '../../lib/format'
import { txDayGroups, txDayLabel, txDaySummaries, txPrice, txSignedTotal, txTone, txTotal, txTotalClass, txTypes } from '../../lib/transactions'
import { nextSort, sortRows } from '../../lib/sort'
import { accountsOf, DATE_PRESETS, filterByDateRange, rangeForPreset, readFilters, writeFilters } from '../../lib/transactionFilters'
import { localToday } from '../../lib/periods'
import { toCsv, TRANSACTION_COLUMNS } from '../../lib/csv'
import { Badge, Button, Card, Chip, EmptyState, Input, InstrumentLogo, LetterAvatar, QueryState, Select, Th, SortableTh, Td } from '../ui'

const TRANSACTION_ACCESSORS = {
  date: (t) => t.date,
  instrument: (t) => t.instrument,
  total: (t) => txSignedTotal(t),
}

const SORT_CAPTIONS = { date: 'by date', instrument: 'by instrument', total: 'by total' }

function sortCaption(sort) {
  if (!sort) return 'newest first'
  return SORT_CAPTIONS[sort.key] ?? 'sorted'
}

function TradeRow({ t }) {
  return (
    <tr className="border-t border-line hover:bg-hover">
      <Td edge className="num text-ink-2">{fmtDate(t.date)}</Td>
      <Td hideBelow="md">
        <Badge tone={txTone(t.type)}>{t.type}</Badge>
      </Td>
      <Td className="w-full max-w-0 md:w-auto md:max-w-none text-ink">
        <div className="truncate" title={`${t.instrument} (${t.ticker})`}>{t.instrument}</div>
        <span className="md:hidden block truncate text-[12px] text-ink-3">
          {[t.type, t.ticker, t.account].filter(Boolean).join(' · ')}
        </span>
      </Td>
      <Td hideBelow="md" className="text-ink-2 font-medium">
        <span className="flex items-center gap-2">
          <InstrumentLogo
            symbol={t.ticker}
            size={16}
            className="rounded-sm"
            fallback={<LetterAvatar symbol={t.ticker} size={16} className="rounded-sm" />}
          />
          {t.ticker}
        </span>
      </Td>
      <Td align="right" hideBelow="md" className="num text-ink-2">{fmtQty(t.qty)}</Td>
      <Td align="right" hideBelow="md" className="num text-ink-2">{txPrice(t)}</Td>
      <Td align="right" className={`num font-medium ${txTotalClass(t)}`}>{txTotal(t)}</Td>
      <Td edge hideBelow="md" className="text-ink-2">{t.account}</Td>
    </tr>
  )
}

function TradeGroup({ date, rows, summary }) {
  if (date === null) {
    return (
      <tbody>
        {rows.map((t) => <TradeRow key={t.id} t={t} />)}
      </tbody>
    )
  }
  const label = txDayLabel(date)
  return (
    <tbody aria-label={`Trades on ${label}`}>
      <tr className="border-t border-line">
        <td colSpan={8} className="px-[18px] pt-3 pb-1.5 text-[13px]">
          <span className="font-semibold text-ink">{label}</span>
          {summary && <span className="ml-2 text-ink-3 num">{summary}</span>}
        </td>
      </tr>
      {rows.map((t) => <TradeRow key={t.id} t={t} />)}
    </tbody>
  )
}

export default function TransactionsView() {
  const { data, isLoading, error, refetch } = useTransactions('?page_size=1000')
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState(null)
  const [deadSelection, setDeadSelection] = useState('')

  // Stable identity so the filter memo below doesn't rerun on every render
  // while the query is still resolving.
  const allTx = useMemo(() => data ?? [], [data])
  const types = useMemo(() => txTypes(allTx), [allTx])
  const accounts = useMemo(() => accountsOf(allTx), [allTx])

  const raw = readFilters(searchParams)
  const effectiveFilter = types.includes(raw.type) ? raw.type : 'All'
  const account = accounts.includes(raw.account) ? raw.account : ''
  const filters = { ...raw, type: effectiveFilter, account }
  const { from, to } = filters
  const urlSearch = raw.search
  const [searchText, setSearchText] = useState(urlSearch)
  const [seenUrlSearch, setSeenUrlSearch] = useState(urlSearch)
  const [written, setWritten] = useState([])
  if (seenUrlSearch !== urlSearch) {
    setSeenUrlSearch(urlSearch)
    const index = written.indexOf(urlSearch)
    if (index >= 0) {
      setWritten(written.slice(index + 1))
    } else {
      setSearchText(urlSearch)
      setWritten([])
    }
  }
  const search = urlSearch

  const dead = `${raw.type !== effectiveFilter ? raw.type : ''}|${raw.account !== account ? raw.account : ''}`
  if (dead !== deadSelection) {
    setDeadSelection(dead)
    if (dead !== '|') setPage(1)
  }

  function applyFilters(patch) {
    const next = new URLSearchParams()
    if (searchParams.has('view')) next.set('view', searchParams.get('view'))
    for (const [key, value] of writeFilters({ ...filters, ...patch })) next.append(key, value)
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  const filtered = useMemo(
    () =>
      filterByDateRange(allTx, { from, to }).filter(
        (t) =>
          (effectiveFilter === 'All' || t.type === effectiveFilter) &&
          (account === '' || t.account === account) &&
          (search === '' || (t.instrument + t.ticker).toLowerCase().includes(search.toLowerCase()))
      ),
    [allTx, effectiveFilter, account, search, from, to]
  )

  const sorted = useMemo(() => sortRows(filtered, sort, TRANSACTION_ACCESSORS), [filtered, sort])

  function onSort(key) {
    setSort((current) => nextSort(current, key))
    setPage(1)
  }

  const perPage = 10
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage))
  const visible = sorted.slice((page - 1) * perPage, page * perPage)

  const today = localToday()
  const filtersActive = search !== '' || effectiveFilter !== 'All' || account !== '' || from !== '' || to !== ''

  function clearFilters() {
    applyFilters({ search: '', type: 'All', account: '', from: '', to: '' })
  }

  function handleExport() {
    const blob = new Blob([toCsv(TRANSACTION_COLUMNS, sorted)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transactions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error || isLoading) {
    return (
      <section aria-labelledby="transactions-heading" className="min-[1100px]:col-span-12 min-w-0">
        <h2 id="transactions-heading" className="sr-only">Transactions</h2>
        <QueryState isLoading={!error} error={error} onRetry={refetch} label="transactions" />
      </section>
    )
  }

  const groups = sort === null || sort.key === 'date' ? txDayGroups(visible) : [{ date: null, rows: visible }]
  const daySummaries = txDaySummaries(filtered)

  return (
    <Card
      flush
      className="min-[1100px]:col-span-12"
      context={`Trades · ${sortCaption(sort)} · ${filtered.length} of ${allTx.length}`}
      dot={allTx.length ? 'ok' : 'off'}
      title="Transactions"
      right={
        <Button onClick={handleExport}>
          <Download size={13} aria-hidden="true" /> Export CSV
        </Button>
      }
    >
      <div className="px-[18px] pb-3.5 border-b border-line flex items-center gap-2 md:gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] w-full md:w-auto">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
            <Search size={14} />
          </span>
          <Input
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value)
              setWritten([...written, e.target.value])
              applyFilters({ search: e.target.value })
            }}
            placeholder="Search instrument or ticker"
            aria-label="Search transactions"
            className="w-full pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {types.map((t) => (
            <Chip
              key={t}
              active={effectiveFilter === t}
              onClick={() => applyFilters({ type: t })}
            >
              {t}
            </Chip>
          ))}
        </div>
        {accounts.length > 1 && (
          <label className="flex items-center gap-2 text-[12px] text-ink-3">
            Account
            <Select
              value={account}
              onChange={(e) => applyFilters({ account: e.target.value })}
              className="h-11 md:h-9"
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </Select>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] text-ink-3">
            From
            <Input type="date" value={from} onChange={(e) => applyFilters({ from: e.target.value })} className="h-11 md:h-9" />
          </label>
          <label className="flex items-center gap-2 text-[12px] text-ink-3">
            To
            <Input type="date" value={to} onChange={(e) => applyFilters({ to: e.target.value })} className="h-11 md:h-9" />
          </label>
          <div className="flex flex-wrap items-center gap-1">
            {DATE_PRESETS.map((preset) => {
              const range = rangeForPreset(preset, today)
              return (
                <Chip key={preset} active={from === range.from && to === range.to} onClick={() => applyFilters(range)}>
                  {preset}
                </Chip>
              )
            })}
          </div>
        </div>
        {filtersActive && visible.length > 0 && (
          <Button size="sm" className="h-11 md:h-8" onClick={clearFilters}>Clear filters</Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table aria-label="Transactions" className="w-full">
          <thead>
            <tr>
              <SortableTh edge sortKey="date" sort={sort} onSort={onSort}>Date</SortableTh>
              <Th hideBelow="md">Type</Th>
              <SortableTh sortKey="instrument" sort={sort} onSort={onSort}>Instrument</SortableTh>
              <Th hideBelow="md">Ticker</Th>
              <Th align="right" hideBelow="md">Qty</Th>
              <Th align="right" hideBelow="md">Price</Th>
              <SortableTh align="right" sortKey="total" sort={sort} onSort={onSort}>Total</SortableTh>
              <Th edge hideBelow="md">Account</Th>
            </tr>
          </thead>
          {visible.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={8}>
                  <EmptyState title="No transactions match your filters." />
                  {filtersActive && (
                    <div className="pb-6 text-center">
                      <Button size="sm" className="h-11 md:h-8" onClick={clearFilters}>Clear filters</Button>
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          ) : (
            groups.map((group, index) => (
              <TradeGroup key={`${group.date}-${index}`} date={group.date} rows={group.rows} summary={daySummaries.get(group.date)} />
            ))
          )}
        </table>
      </div>

      <div className="px-[18px] pt-3 flex items-center justify-between border-t border-line">
        <div className="text-[12px] text-ink-3 num">
          Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            aria-label="Previous page"
            className="h-11 w-11 md:h-8 md:w-8 rounded text-ink-2 hover:bg-hover disabled:opacity-40 flex items-center justify-center"
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              aria-label={`Page ${n}`}
              aria-current={n === page ? 'page' : undefined}
              className={`h-11 w-11 md:h-8 md:w-8 text-[12px] num rounded font-medium ${
                n === page ? 'bg-selected text-ink' : 'text-ink-2 hover:bg-hover'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setPage(Math.min(pageCount, page + 1))}
            disabled={page === pageCount}
            aria-label="Next page"
            className="h-11 w-11 md:h-8 md:w-8 rounded text-ink-2 hover:bg-hover disabled:opacity-40 flex items-center justify-center"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </Card>
  )
}
