import { useDeferredValue, useMemo, useState } from 'react'
import { X } from 'lucide-react'

import { useInstrumentSearch, usePeerFundamentals, usePeers } from '../../api/queries'
import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { MAX_PEER_SLOTS, resolvePeerSlots } from '../../lib/research'
import { Card, CardHeader, Skeleton } from '../ui'
import FundamentalsGate from './FundamentalsGate'

const RECOMMENDATION_LABELS = [
  ['strong_buy', 'Strong buy'],
  ['buy', 'Buy'],
  ['hold', 'Hold'],
  ['sell', 'Sell'],
  ['strong_sell', 'Strong sell'],
]

function dominantRecommendation(rec) {
  if (!rec) return null
  let best = null
  for (const [key, label] of RECOMMENDATION_LABELS) {
    const count = rec[key] || 0
    if (!best || count > best.count) best = { label, count }
  }
  return best && best.count > 0 ? best.label : null
}

const METRIC_ROWS = [
  { key: 'price_return_1y', label: '1Y return', format: (v) => fmtPct(v) },
  { key: 'market_cap', label: 'Market cap', format: (v) => fmtCompact(v) },
  { key: 'pe_ratio', label: 'P/E', format: (v) => fmtNum(v, 2) },
  { key: 'peg_ratio', label: 'PEG', format: (v) => fmtNum(v, 2) },
  { key: 'revenue_growth_ttm_yoy', label: 'Revenue growth (YoY)', format: (v) => fmtPct(v, { sign: false }) },
  { key: 'eps_growth_ttm_yoy', label: 'EPS growth (YoY)', format: (v) => fmtPct(v, { sign: false }) },
  { key: 'net_margin', label: 'Net margin', format: (v) => fmtPct(v, { sign: false }) },
  { key: 'roe', label: 'ROE', format: (v) => fmtPct(v, { sign: false }) },
  { key: 'recommendation', label: 'Analyst view', format: (v) => dominantRecommendation(v) ?? '—' },
]

/** One empty slot's inline search: pick a symbol to add as a manual peer. */
function AddPeerSearch({ onPick }) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const { data: results = [], isError } = useInstrumentSearch(deferredQuery)

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Add peer"
        aria-label="Add peer"
        className="w-full h-7 px-2 bg-zinc-950 border border-white/10 rounded text-[11.5px] text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500/60"
      />
      {isError && (
        <div className="absolute z-10 mt-1 w-full bg-zinc-900 border border-white/10 rounded shadow-lg px-2 py-1.5 text-[11px] text-amber-400">
          Search unavailable — reconnect Saxo
        </div>
      )}
      {!isError && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto bg-zinc-900 border border-white/10 rounded shadow-lg">
          {results.map((result) => (
            <button
              key={`${result.uic}-${result.asset_type}`}
              type="button"
              onClick={() => {
                onPick(result.symbol)
                setQuery('')
              }}
              className="w-full text-left px-2 h-7 text-[11.5px] text-zinc-100 hover:bg-white/[0.06]"
            >
              {result.symbol}
              <span className="text-zinc-500 ml-1.5 truncate">{result.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PeersTab({ symbol, fundamentals }) {
  const peers = usePeers(symbol)
  const [overrides, setOverrides] = useState([])

  const autoSymbols = peers.data?.available ? peers.data.symbols : []
  const overridesKey = JSON.stringify(overrides)
  const autoSymbolsKey = JSON.stringify(autoSymbols)
  const slots = useMemo(
    () => resolvePeerSlots(symbol, autoSymbols, overrides),
    // autoSymbols/overrides are recreated every render; their JSON is the stable dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol, autoSymbolsKey, overridesKey],
  )
  const peerResults = usePeerFundamentals(slots.map((s) => s.symbol))

  const setOverride = (slot, value) => {
    setOverrides((prev) => {
      const next = [...prev]
      next[slot] = value
      return next
    })
  }

  const filledSlots = new Set(slots.map((s) => s.slot))
  const nextEmptySlot = Array.from({ length: MAX_PEER_SLOTS }).findIndex((_, i) => !filledSlots.has(i))

  return (
    <FundamentalsGate fundamentals={fundamentals} title="Peers" fallback="Peer data is unavailable for this symbol.">
      {(currentData) => (
        <Card padding={false}>
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <CardHeader title="Peer comparison" subtitle="Valuation, growth and quality, side by side" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left px-4 py-2 text-[10px] uppercase tracking-wide text-zinc-600 font-medium">
                    {symbol}
                  </th>
                  {slots.map((s, i) => (
                    <th key={s.symbol} className="text-right px-3 py-2 font-medium">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-zinc-100">{s.symbol}</span>
                        <button
                          type="button"
                          onClick={() => setOverride(s.slot, null)}
                          aria-label={`Remove ${s.symbol}`}
                          className="text-zinc-600 hover:text-red-400"
                        >
                          <X size={11} />
                        </button>
                      </div>
                      {peerResults[i]?.isLoading ? <Skeleton className="h-3 w-12 ml-auto mt-1" /> : null}
                    </th>
                  ))}
                  {nextEmptySlot !== -1 ? (
                    <th className="text-right px-3 py-2 w-40">
                      <AddPeerSearch onPick={(sym) => setOverride(nextEmptySlot, sym)} />
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {METRIC_ROWS.map((row) => (
                  <tr key={row.key} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-2 text-zinc-500">{row.label}</td>
                    <td className="px-3 py-2 num font-mono text-right text-zinc-100">
                      {row.format(currentData[row.key])}
                    </td>
                    {slots.map((s, i) => {
                      const peerData = peerResults[i]?.data
                      const unavailable = peerData && peerData.available === false
                      return (
                        <td key={s.symbol} className="px-3 py-2 num font-mono text-right text-zinc-300">
                          {unavailable ? '—' : row.format(peerData?.[row.key])}
                        </td>
                      )
                    })}
                    {nextEmptySlot !== -1 ? <td /> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </FundamentalsGate>
  )
}
