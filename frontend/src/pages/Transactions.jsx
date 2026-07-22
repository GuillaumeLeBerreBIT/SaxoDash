import { useEffect, useMemo, useState } from 'react'
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { getTransactions } from '../api/client'
import { fmtEur, fmtNum } from '../lib/format'
import { Card, PageHeader, Badge } from '../components/ui'

const TYPES = ['All', 'BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'FEE']
const toneFor = (t) => ({ BUY: 'blue', SELL: 'zinc', DIVIDEND: 'amber', DEPOSIT: 'teal', FEE: 'red' }[t] || 'zinc')
const signedTotal = (t) =>
  t.type === 'SELL' || t.type === 'DEPOSIT' || t.type === 'DIVIDEND'
    ? '+' + fmtEur(t.total)
    : t.type === 'FEE'
    ? '-' + fmtEur(t.total)
    : fmtEur(t.total)

function toCsv(rows) {
  const header = ['Date', 'Type', 'Instrument', 'Ticker', 'Qty', 'Price', 'Total', 'Account']
  const lines = rows.map((t) => [t.date, t.type, t.instrument, t.ticker, t.qty, t.price, t.total, t.account].join(','))
  return [header.join(','), ...lines].join('\n')
}

export default function Transactions() {
  const [allTx, setAllTx] = useState([])
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [page, setPage] = useState(1)

  useEffect(() => {
    getTransactions('?page_size=1000')
      .then((res) => setAllTx(res.results ?? res))
      .catch(() => setError('Failed to load transactions'))
  }, [])

  const filtered = useMemo(
    () =>
      allTx.filter(
        (t) =>
          (typeFilter === 'All' || t.type === typeFilter) &&
          (search === '' || (t.instrument + t.ticker).toLowerCase().includes(search.toLowerCase()))
      ),
    [allTx, typeFilter, search]
  )

  const perPage = 10
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage))
  const visible = filtered.slice((page - 1) * perPage, page * perPage)

  function handleExport() {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transactions.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <div className="text-red-400 text-sm">{error}</div>

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transactions"
        subtitle="All account activity"
        right={
          <button
            onClick={handleExport}
            className="h-9 px-3 rounded-md text-[12.5px] font-medium border border-zinc-700 text-zinc-300 hover:bg-zinc-800 flex items-center gap-2"
          >
            <Download size={13} /> Export CSV
          </button>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">
              <Search size={14} />
            </span>
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search instrument or ticker"
              className="w-full h-9 pl-9 pr-3 bg-zinc-950 border border-zinc-800 rounded-md text-[13px] text-zinc-100 placeholder-zinc-600 focus:border-zinc-600 outline-none"
            />
          </div>
          <div className="flex items-center gap-1 p-0.5 bg-zinc-950 border border-zinc-800 rounded-md">
            {TYPES.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTypeFilter(t)
                  setPage(1)
                }}
                className={`px-2.5 h-8 text-[11.5px] font-medium rounded ${
                  typeFilter === t ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] text-zinc-500 uppercase tracking-wide border-b border-zinc-800">
                <th className="px-5 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">Instrument</th>
                <th className="px-2 py-2 font-medium">Ticker</th>
                <th className="px-2 py-2 font-medium text-right">Qty</th>
                <th className="px-2 py-2 font-medium text-right">Price</th>
                <th className="px-2 py-2 font-medium text-right">Total</th>
                <th className="px-5 py-2 font-medium">Account</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30">
                  <td className="px-5 py-3 num text-zinc-300">{t.date}</td>
                  <td className="px-2 py-3">
                    <Badge tone={toneFor(t.type)}>{t.type}</Badge>
                  </td>
                  <td className="px-2 py-3 text-zinc-100">{t.instrument}</td>
                  <td className="px-2 py-3 text-zinc-400 font-medium">{t.ticker}</td>
                  <td className="px-2 py-3 text-right num text-zinc-300">{fmtNum(t.qty, Number(t.qty) % 1 === 0 ? 0 : 4)}</td>
                  <td className="px-2 py-3 text-right num text-zinc-300">{fmtEur(t.price)}</td>
                  <td className="px-2 py-3 text-right num text-zinc-100 font-medium">{signedTotal(t)}</td>
                  <td className="px-5 py-3 text-zinc-400">{t.account}</td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-zinc-500 py-8">
                    No transactions match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 flex items-center justify-between border-t border-zinc-800">
          <div className="text-[12px] text-zinc-500">
            Showing {filtered.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="w-8 h-8 rounded text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 flex items-center justify-center"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`w-8 h-8 text-[12px] rounded font-medium ${
                  n === page ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'
                }`}
              >
                {n}
              </button>
            ))}
            <button
              onClick={() => setPage(Math.min(pageCount, page + 1))}
              disabled={page === pageCount}
              className="w-8 h-8 rounded text-zinc-400 hover:bg-zinc-800 disabled:opacity-40 flex items-center justify-center"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </Card>
    </div>
  )
}
