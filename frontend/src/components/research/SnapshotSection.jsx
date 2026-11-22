import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { fmtNum, fmtPct } from '../../lib/format'
import { SNAPSHOT_GROUPS } from '../../lib/snapshot'
import { InfoTip, Move, Panel } from '../ui'
import FundamentalsGate from './FundamentalsGate'
import VerdictBadge from './VerdictBadge'

function fmtField(value, fmt) {
  if (fmt === 'move') return <Move value={value} />
  if (value == null) return '—'
  if (fmt === 'times') return `${fmtNum(value, 2)}×`
  if (fmt === 'wholeTimes') return `${fmtNum(value, 0)}×`
  if (fmt === 'pct') return fmtPct(value, { sign: false, decimals: 1 })
  return fmtNum(value, 2)
}

function Group({ group, data, valuationGrade }) {
  const [open, setOpen] = useState(false)
  const verdict = group.verdict(data, valuationGrade)
  return (
    <div className="py-1">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${group.label} figures`}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 rounded py-1.5 text-left"
      >
        <span className="text-[13px] font-bold text-ink">{group.label}</span>
        <span className="flex min-w-0 items-center gap-2">
          <VerdictBadge {...verdict} />
          <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open ? (
        <dl className="pb-1.5">
          {group.metrics.map((m) => (
            <div key={m.field} className="flex items-baseline justify-between gap-3 py-0.5">
              <dt className="text-[13px] text-ink-2">{m.label}</dt>
              <dd className="text-[13px] num text-ink">{fmtField(data[m.field], m.fmt)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

const RETURN_FIELDS = { '1M': 'price_return_1m', YTD: 'price_return_ytd', '1Y': 'price_return_1y' }

function withPageReturns(data, returns = []) {
  const own = Object.fromEntries(
    returns.filter((row) => RETURN_FIELDS[row.key] && row.pct != null).map((row) => [RETURN_FIELDS[row.key], row.pct]),
  )
  return { ...data, ...own }
}

export default function SnapshotSection({ fundamentals, returns, valuationGrade, bare = false }) {
  return (
    <FundamentalsGate
      fundamentals={fundamentals}
      bare={bare}
      title="Investment snapshot"
      fallback="A snapshot needs company fundamentals, which are unavailable for this symbol."
    >
      {(data) => (
        <Panel
          bare={bare}
          context="Five reads of the last twelve months. Open one for its figures."
          title="Investment snapshot"
          right={
            <InfoTip>
              Growth reads TTM YoY revenue and EPS growth. Profitability reads ROE and net
              margin. Financial health reads debt/equity, current ratio and interest coverage.
              Valuation reads PEG and the verdict's P/E grade, or P/E against its own annual
              history when there is no verdict. Momentum reads the
              1-year and YTD price return, from the same prices as the Performance card. No
              composite score.
            </InfoTip>
          }
        >
          <div className="divide-y divide-line">
            {SNAPSHOT_GROUPS.map((group) => (
              <Group key={group.key} group={group} data={withPageReturns(data, returns)} valuationGrade={valuationGrade} />
            ))}
          </div>
        </Panel>
      )}
    </FundamentalsGate>
  )
}
