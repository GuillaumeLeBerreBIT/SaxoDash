import { useEffect, useState } from 'react'
import { getPortfolioSummary, getPositions, getNetWorth } from '../api/client'
import { fmtEur, fmtPct, fmtNum } from '../lib/format'
import { Card, CardHeader, PageHeader, Badge } from '../components/ui'

const SECTOR_PALETTE = ['#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#0ea5e9', '#1e40af']

export default function Portfolio() {
  const [summary, setSummary] = useState(null)
  const [positions, setPositions] = useState([])
  const [netWorth, setNetWorth] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getPortfolioSummary(), getPositions(), getNetWorth()])
      .then(([summaryRes, positionsRes, netWorthRes]) => {
        setSummary(summaryRes)
        setPositions(positionsRes)
        setNetWorth(netWorthRes)
      })
      .catch(() => setError('Failed to load portfolio data'))
  }, [])

  if (error) return <div className="text-red-400 text-sm">{error}</div>
  if (!summary || !netWorth) return <div className="text-zinc-500 text-sm">Loading…</div>

  const totals = positions.reduce(
    (s, p) => ({
      qty: s.qty + Number(p.qty),
      value: s.value + Number(p.value),
      pnl: s.pnl + Number(p.pnl),
    }),
    { qty: 0, value: 0, pnl: 0 }
  )

  const sectorTotals = new Map()
  positions.forEach((p) => {
    sectorTotals.set(p.sector, (sectorTotals.get(p.sector) || 0) + Number(p.value))
  })
  const sectors = Array.from(sectorTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name,
      pct: (value / totals.value) * 100,
      color: SECTOR_PALETTE[i % SECTOR_PALETTE.length],
    }))

  return (
    <div className="space-y-5">
      <PageHeader title="Portfolio" subtitle="Holdings and allocation" />

      <Card>
        <div className="grid grid-cols-3 gap-0">
          <div className="pr-5">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium">Investment portfolio</div>
            <div className="mt-1.5 text-[18px] font-medium text-zinc-50 num">{fmtEur(summary.total_value)}</div>
            <div className={`text-[12px] num mt-0.5 ${Number(summary.total_pnl_pct) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
              {fmtPct(summary.total_pnl_pct)}
            </div>
          </div>
          <div className="pl-5 border-l border-zinc-800">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wide font-medium">Bank balance</div>
            <div className="mt-1.5 text-[18px] font-medium text-zinc-50 num">{fmtEur(netWorth.bank_total)}</div>
            <div className="text-[12px] text-zinc-500 mt-0.5">All connected accounts</div>
          </div>
          <div className="pl-5 border-l-2 border-blue-500/60">
            <div className="text-[11px] text-blue-400 uppercase tracking-wide font-medium">Total net worth</div>
            <div className="mt-1.5 text-[22px] font-medium text-zinc-50 num">{fmtEur(netWorth.net_worth)}</div>
            <div className="text-[12px] text-zinc-500 mt-0.5">Portfolio + bank accounts</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-20 gap-4" style={{ gridTemplateColumns: '65fr 35fr' }}>
        <Card padding={false}>
          <div className="p-5 pb-3">
            <CardHeader title="Holdings" subtitle="All positions" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] text-zinc-500 uppercase tracking-wide border-b border-zinc-800">
                  <th className="px-5 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium text-right">Qty</th>
                  <th className="px-2 py-2 font-medium text-right">Avg</th>
                  <th className="px-2 py-2 font-medium text-right">Price</th>
                  <th className="px-2 py-2 font-medium text-right">Value</th>
                  <th className="px-2 py-2 font-medium text-right">P&L</th>
                  <th className="px-5 py-2 font-medium text-right">Weight</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.ticker} className="border-b border-zinc-800/60 hover:bg-zinc-800/30">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                        <span className="font-medium text-zinc-100">{p.ticker}</span>
                        <span className="text-zinc-500 truncate max-w-[140px]">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <Badge tone={p.type === 'ETF' ? 'amber' : 'zinc'}>{p.type}</Badge>
                    </td>
                    <td className="px-2 py-3 text-right num text-zinc-300">{fmtNum(p.qty, 0)}</td>
                    <td className="px-2 py-3 text-right num text-zinc-400">{fmtEur(p.avg_cost)}</td>
                    <td className="px-2 py-3 text-right num text-zinc-200">{fmtEur(p.current_price)}</td>
                    <td className="px-2 py-3 text-right num text-zinc-100">{fmtEur(p.value)}</td>
                    <td className={`px-2 py-3 text-right num ${Number(p.pnl) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {fmtEur(p.pnl, { sign: true })}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="num text-zinc-300 w-10 text-right">{Number(p.weight).toFixed(1)}%</span>
                        <div className="w-14 h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${Number(p.weight)}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-zinc-800/20">
                  <td className="px-5 py-3 font-medium text-zinc-300" colSpan={2}>
                    Total ({positions.length} holdings)
                  </td>
                  <td className="px-2 py-3 text-right num text-zinc-300">{fmtNum(totals.qty, 0)}</td>
                  <td className="px-2 py-3" />
                  <td className="px-2 py-3" />
                  <td className="px-2 py-3 text-right num text-zinc-100 font-medium">{fmtEur(totals.value)}</td>
                  <td className="px-2 py-3 text-right num text-blue-400 font-medium">{fmtEur(totals.pnl, { sign: true })}</td>
                  <td className="px-5 py-3 text-right num text-zinc-300">100,0%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Overview" />
            <div className="mt-4 divide-y divide-zinc-800">
              {[
                { label: 'Invested cost', val: fmtEur(summary.total_cost) },
                { label: 'Current value', val: fmtEur(summary.total_value) },
                { label: 'Total P&L', val: fmtEur(summary.total_pnl, { sign: true }) },
                { label: 'Total P&L %', val: fmtPct(summary.total_pnl_pct) },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <span className="text-[12.5px] text-zinc-500">{r.label}</span>
                  <span className="text-[13px] text-zinc-100 num font-medium">{r.val}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Sector breakdown" />
            <div className="mt-4 space-y-3">
              {sectors.map((s) => (
                <div key={s.name}>
                  <div className="flex items-center justify-between text-[12px] mb-1">
                    <span className="text-zinc-300">{s.name}</span>
                    <span className="text-zinc-400 num">{s.pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
