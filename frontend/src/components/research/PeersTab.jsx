import { useDeferredValue, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { useInstrumentSearch, usePeerFundamentals, usePeers } from '../../api/queries'
import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { quadrantPoint } from '../../lib/quadrant'
import { nextEmptySlot, resolvePeerSlots } from '../../lib/research'
import { valuationVerdict } from '../../lib/snapshot'
import { QUADRANT_GUIDE } from '../../lib/guide'
import { Card, Input, InstrumentLogo, Skeleton } from '../ui'
import { usePortalMenuRect } from '../usePortalMenuRect'
import FundamentalsGate from './FundamentalsGate'
import QualityValuationQuadrant from './QualityValuationQuadrant'
import VerdictBadge from './VerdictBadge'

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

/** One empty slot's inline search: pick a symbol to add as a manual peer.
 *  The results menu portals to <body>, positioned from a measured rect,
 *  so it isn't clipped by the table's overflow-x-auto wrapper (which the
 *  CSS spec also turns into a vertical clipping container). */
function AddPeerSearch({ onPick }) {
  const [query, setQuery] = useState('')
  const wrapperRef = useRef(null)
  const deferredQuery = useDeferredValue(query)
  const { data: results = [], isError } = useInstrumentSearch(deferredQuery)
  const showMenu = isError || results.length > 0
  // Widened past the narrow input column so a floated menu still shows a
  // symbol and its full description.
  const menuRect = usePortalMenuRect(wrapperRef, showMenu, { minWidth: 280 })

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Add peer"
        aria-label="Add peer"
        className="w-full h-7! px-2! text-[12px]! font-normal"
      />
      {menuRect && isError && createPortal(
        <div
          style={{ position: 'fixed', top: menuRect.top + 4, left: menuRect.left, width: menuRect.width }}
          className="z-50 bg-raised border border-line rounded-lg shadow-lg px-2.5 py-1.5 text-[12px] text-warn"
        >
          Search unavailable — reconnect Saxo
        </div>,
        document.body,
      )}
      {menuRect && !isError && results.length > 0 && createPortal(
        <div
          style={{ position: 'fixed', top: menuRect.top + 4, left: menuRect.left, width: menuRect.width }}
          className="z-50 max-h-56 overflow-y-auto bg-raised border border-line rounded-lg shadow-lg py-1"
        >
          {results.map((result) => (
            <button
              key={`${result.uic}-${result.asset_type}`}
              type="button"
              onClick={() => {
                onPick(result.symbol)
                setQuery('')
              }}
              className="flex items-baseline gap-1.5 w-full text-left px-2.5 py-1.5 text-[13px] text-ink hover:bg-hover"
            >
              <span className="shrink-0 font-semibold">{result.symbol}</span>
              <span className="text-ink-3 truncate">{result.description}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

const SPAN_5 = 'min-[1100px]:col-span-5'
const SPAN_7 = 'min-[1100px]:col-span-7'
const SPAN_12 = 'min-[1100px]:col-span-12'
const HEAD = 'h-[38px] min-w-[132px] px-2.5 text-right align-middle text-[12px] font-medium text-ink-3 whitespace-nowrap'
const LABEL = 'h-[var(--sd-row-h)] px-2.5 text-[13.5px] text-ink-2 whitespace-nowrap'
const CELL = 'h-[var(--sd-row-h)] px-2.5 text-[13.5px] text-right whitespace-nowrap'

function PeerHead({ symbol, note, action }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <InstrumentLogo symbol={symbol} size={20} />
      <span className="text-left leading-tight">
        <span className="block text-[13.5px] font-bold text-ink">{symbol}</span>
        {note ? <span className="block text-[12px] font-normal text-ink-3">{note}</span> : null}
      </span>
      {action}
    </div>
  )
}

function Corners({ className }) {
  return (
    <Card className={className} context="Corners of the quadrant" dot="off" title="How to read it">
      <ul>
        {QUADRANT_GUIDE.corners.map((corner) => (
          <li key={corner.label} className="py-2.5 border-t border-line first:border-t-0 first:pt-0">
            <div className="text-[13.5px] font-semibold text-ink">{corner.label}</div>
            <p className="mt-0.5 text-[13px] text-ink-2">{corner.text}</p>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default function PeersTab({ symbol, fundamentals }) {
  const peers = usePeers(symbol)
  const [overrides, setOverrides] = useState([])

  const autoSymbols = peers.data?.available ? peers.data.symbols : []
  const slots = resolvePeerSlots(symbol, autoSymbols, overrides)
  const peerResults = usePeerFundamentals(slots.map((s) => s.symbol))

  const setOverride = (slot, value) => {
    setOverrides((prev) => {
      const next = [...prev]
      next[slot] = value
      return next
    })
  }

  const emptySlot = nextEmptySlot(slots)

  return (
    <FundamentalsGate fundamentals={fundamentals} title="Peers" fallback="Peer data is unavailable for this symbol.">
      {(currentData) => {
        const quadrantPoints = [
          quadrantPoint(symbol, currentData, true),
          ...slots.map((s, i) => {
            const peerData = peerResults[i]?.data
            return peerData?.available ? quadrantPoint(s.symbol, peerData) : null
          }),
        ].filter(Boolean)

        const unscored = [
          ...(quadrantPoint(symbol, currentData) ? [] : [symbol]),
          ...slots.filter((s, i) => peerResults[i]?.data?.available && !quadrantPoint(s.symbol, peerResults[i].data)).map((s) => s.symbol),
        ]

        return (
          <div className="grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start">
            <Card
              flush
              className={SPAN_12}
              context="Finnhub · valuation, growth and quality, side by side"
              dot="ok"
              title="Peer comparison"
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={`${HEAD} pl-[18px] w-[180px]`} />
                      <th className={`${HEAD} bg-selected rounded-t-lg`}>
                        <PeerHead symbol={symbol} note="this company" />
                      </th>
                      {slots.map((s, i) => (
                        <th key={s.symbol} className={HEAD}>
                          <PeerHead
                            symbol={s.symbol}
                            action={
                              <button
                                type="button"
                                onClick={() => setOverride(s.slot, null)}
                                aria-label={`Remove ${s.symbol}`}
                                className="grid place-items-center w-5 h-5 rounded text-ink-3 hover:text-down hover:bg-hover"
                              >
                                <X size={12} aria-hidden="true" />
                              </button>
                            }
                          />
                          {peerResults[i]?.isLoading ? <Skeleton className="h-3 w-12 ml-auto mt-1" /> : null}
                        </th>
                      ))}
                      {emptySlot !== -1 ? (
                        <th className={`${HEAD} w-40 pr-[18px]`}>
                          <AddPeerSearch onPick={(sym) => setOverride(emptySlot, sym)} />
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-line">
                      <td className={`${LABEL} pl-[18px]`}>Verdict</td>
                      <td className={`${CELL} bg-selected`}>
                        <VerdictBadge {...valuationVerdict(currentData)} className="justify-end" />
                      </td>
                      {slots.map((s, i) => {
                        const peerData = peerResults[i]?.data
                        const unavailable = !peerData || peerData.available === false
                        return (
                          <td key={s.symbol} className={CELL}>
                            {unavailable ? <span className="text-ink-3">—</span> : <VerdictBadge {...valuationVerdict(peerData)} className="justify-end" />}
                          </td>
                        )
                      })}
                      {emptySlot !== -1 ? <td /> : null}
                    </tr>
                    {METRIC_ROWS.map((row) => (
                      <tr key={row.key} className="border-t border-line">
                        <td className={`${LABEL} pl-[18px]`}>{row.label}</td>
                        <td className={`${CELL} num font-semibold text-ink bg-selected`}>
                          {row.format(currentData[row.key])}
                        </td>
                        {slots.map((s, i) => {
                          const peerData = peerResults[i]?.data
                          const unavailable = peerData && peerData.available === false
                          return (
                            <td key={s.symbol} className={`${CELL} num text-ink-2`}>
                              {unavailable ? '—' : row.format(peerData?.[row.key])}
                            </td>
                          )
                        })}
                        {emptySlot !== -1 ? <td /> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <QualityValuationQuadrant points={quadrantPoints} unscored={unscored} className={SPAN_7} />
            {quadrantPoints.length >= 2 ? <Corners className={SPAN_5} /> : null}
          </div>
        )
      }}
    </FundamentalsGate>
  )
}
