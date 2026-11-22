import { useState } from 'react'

import { fmtDate, fmtEur, fmtMoney, fmtPct, fmtQty } from '../../lib/format'
import { priceZone } from '../../lib/priceBar'
import { priceBasis } from '../../lib/pricing'
import PriceBar from '../verdicts/PriceBar'
import { CHECK_BASIS_NOTE, CHECK_STATUS_LABEL, GRADE_LABEL, checkLine, trendSentence } from '../../lib/verdicts'
import { Button, Move, Skeleton } from '../ui'

const PLAIN = { sign: false, decimals: 1 }
const WORD_TONE = { up: 'text-up', warn: 'text-warn-text' }
const STATUS_TONE = { fail: 'text-down' }
const CELL = 'min-w-0 flex flex-col gap-1 py-3 min-[900px]:py-0 min-[900px]:px-5 min-[900px]:first:pl-0 min-[900px]:last:pr-0'
const CELL_LABEL = 'text-[12px] font-medium text-ink-3'
const CELL_VALUE = 'text-[17px] font-bold text-ink'
const CELL_LINE = 'text-[13px] text-ink-2 num'
const FOOTER = 'Rules, not advice. Review means read the story again, not an order to sell.'

const names = (checks) => checks.map((check) => check.label).join(', ')

function checkCount(checks) {
  const failed = checks.filter((check) => check.status === 'fail')
  const unknown = checks.filter((check) => check.status === 'unknown')
  const answered = checks.length - unknown.length
  return { failed, unknown, answered }
}

const BAR_TONE = { pass: 'bg-up', fail: 'bg-down', unknown: 'bg-ink-3/30' }

function CheckBars({ checks }) {
  if (!checks.length) return null
  return (
    <span data-testid="check-bars" className="mt-1 flex gap-1" aria-hidden="true">
      {checks.map((check) => (
        <span key={check.key} title={`${check.label}: ${CHECK_STATUS_LABEL[check.status] ?? check.status}`} className={`h-1.5 flex-1 rounded-full ${BAR_TONE[check.status] ?? BAR_TONE.unknown}`} />
      ))}
    </span>
  )
}

function WeightBar({ weight, cap }) {
  if (weight == null || cap == null) return null
  const scale = cap * 2.2
  const over = Number(weight) > cap
  return (
    <span data-testid="weight-bar" className="mt-1 flex items-center gap-2.5" aria-hidden="true">
      <span className="relative h-1.5 flex-1 rounded-full bg-track">
        <span className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-warn' : 'bg-ink'}`} style={{ width: `${Math.min(100, (Number(weight) / scale) * 100)}%` }} />
        <span className="absolute -top-1 h-3.5 w-0.5 bg-ink-3" style={{ left: `${(cap / scale) * 100}%` }} />
      </span>
    </span>
  )
}

function CompanyCell({ verdict }) {
  const [open, setOpen] = useState(false)
  const { failed, unknown, answered } = checkCount(verdict.checks ?? [])
  const allPass = failed.length === 0
  return (
    <div data-testid="answer-company" className={CELL}>
      <span className={CELL_LABEL}>Company</span>
      <span className="flex flex-wrap items-center gap-2">
        <span className={CELL_VALUE}>{GRADE_LABEL.quality[verdict.quality] ?? verdict.quality}</span>
        {answered > 0 ? (
          <span className={`text-[13px] font-semibold ${allPass ? 'text-up' : 'text-down'}`}>
            {allPass ? `${answered} of ${answered} checks pass` : `${failed.length} of ${answered} checks fail`}
          </span>
        ) : null}
      </span>
      <CheckBars checks={verdict.checks ?? []} />
      {failed.length > 0 ? <span className={CELL_LINE}>{`Fails: ${names(failed)}.`}</span> : null}
      {unknown.length > 0 ? <span className="text-[13px] text-ink-3">{`No figure for: ${names(unknown)}.`}</span> : null}
      {allPass && answered > 0 ? <span className={CELL_LINE}>Every check clears the bar.</span> : null}
      {verdict.checks?.length ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="self-start rounded text-[13px] font-semibold text-accent hover:underline"
        >
          {open ? 'Hide the checks' : 'Show the checks'}
        </button>
      ) : null}
      {open ? (
        <>
          <ul className="divide-y divide-line">
            {verdict.checks.map((check) => (
              <li key={check.key} className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
                <span className="text-ink-2 num">{checkLine(check)}</span>
                <span className={`font-semibold ${STATUS_TONE[check.status] ?? 'text-ink-3'}`}>{CHECK_STATUS_LABEL[check.status] ?? check.status}</span>
              </li>
            ))}
          </ul>
          <span className="text-[12px] text-ink-3">{CHECK_BASIS_NOTE}</span>
        </>
      ) : null}
    </div>
  )
}

function PriceCell({ verdict }) {
  const trend = trendSentence(verdict.pct_vs_ma200)
  const judged = verdict.cheap_below != null || verdict.expensive_above != null
  const barred = priceZone({ price: verdict.last_close, cheapBelow: verdict.cheap_below, expensiveAbove: verdict.expensive_above }) != null
  return (
    <div data-testid="answer-price" className={CELL}>
      <span className={CELL_LABEL}>Price</span>
      <span className={CELL_VALUE}>{GRADE_LABEL.valuation[verdict.valuation] ?? verdict.valuation}</span>
      {barred ? (
        <PriceBar price={verdict.last_close} cheapBelow={verdict.cheap_below} expensiveAbove={verdict.expensive_above} className="mt-1.5" />
      ) : (
        <>
          {verdict.cheap_below != null ? <span className={CELL_LINE}>{`Usual P/E low ${fmtMoney(verdict.cheap_below, 'USD')}`}</span> : null}
          {verdict.expensive_above != null ? <span className={CELL_LINE}>{`Usual P/E high ${fmtMoney(verdict.expensive_above, 'USD')}`}</span> : null}
        </>
      )}
      {judged ? null : <span className="text-[13px] text-ink-3">Too little earnings history for a usual P/E range.</span>}
      {trend ? <span className="text-[13px] text-ink-3 num">{trend}</span> : null}
    </div>
  )
}

function weightLine(position, verdict) {
  const weight = verdict?.weight_pct ?? position.weight
  if (weight == null) return null
  const cap = verdict?.weight_cap_pct == null ? '' : `, cap ${fmtPct(verdict.weight_cap_pct, PLAIN)}`
  return `${fmtPct(weight, PLAIN)} of your portfolio${cap}`
}

function YouCell({ position, verdict }) {
  if (!position) {
    return (
      <div data-testid="answer-you" className={CELL}>
        <span className={CELL_LABEL}>You</span>
        <span className={CELL_VALUE}>Not in your portfolio</span>
      </div>
    )
  }
  const pnl = position.pnl == null ? null : Number(position.pnl)
  const basis = position.price_source && position.price_source !== 'live' ? priceBasis(position.price_source).note : null
  const weight = weightLine(position, verdict)
  return (
    <div data-testid="answer-you" className={CELL}>
      <span className={CELL_LABEL}>You</span>
      <span className={`${CELL_VALUE} num`}>{`${fmtQty(position.qty)} shares · ${fmtEur(position.value, { decimals: 0 })}`}</span>
      {pnl == null ? null : (
        <span className="flex flex-wrap items-baseline gap-2 text-[13px] num">
          <span className={`font-semibold ${pnl >= 0 ? 'text-up' : 'text-down'}`}>{fmtEur(pnl, { sign: true, decimals: 0 })}</span>
          <Move value={position.pnl_pct} />
          <span className="text-ink-3">{`average price paid ${fmtMoney(position.avg_cost, position.currency)}`}</span>
        </span>
      )}
      {weight ? <span className={CELL_LINE}>{weight}</span> : null}
      <WeightBar weight={verdict?.weight_pct ?? position.weight} cap={verdict?.weight_cap_pct} />
      {basis ? <span className="text-[12px] text-ink-3">{basis}</span> : null}
    </div>
  )
}

function Headline({ verdict, sentence, note }) {
  if (verdict?.isLoading) {
    return (
      <div role="status" aria-label="Loading verdict" className="flex flex-col gap-2">
        <span className="sr-only">Loading verdict…</span>
        <Skeleton className="h-7 w-2/3" />
      </div>
    )
  }
  if (verdict?.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className="text-[14px] text-ink-2">Verdict unavailable right now.</p>
        <Button size="sm" onClick={() => verdict.refetch?.()}>Retry</Button>
      </div>
    )
  }
  if (!verdict?.data || !sentence?.word) {
    return <p className="text-[14px] text-ink-2">{note ?? 'No verdict: not covered by the nightly scan.'}</p>
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className={`inline-block text-[22px] font-bold leading-none lowercase first-letter:uppercase ${WORD_TONE[sentence.tone] ?? 'text-ink-2'}`}>{sentence.word}</span>
      <span className="text-[16px] font-medium text-ink">{sentence.why}</span>
      {sentence.next ? <span className="basis-full text-[14px] text-ink-2 num">{sentence.next}</span> : null}
    </div>
  )
}

export default function AnswerCard({ verdict, sentence, position, note }) {
  const data = verdict?.isError || verdict?.isLoading ? null : verdict?.data
  return (
    <section data-testid="answer-card" aria-label="What to do" className="sd-panel bg-pane rounded-xl px-4 py-4 flex flex-col gap-3">
      <Headline verdict={verdict} sentence={sentence} note={note} />
      <div className={`grid grid-cols-1 border-t border-line divide-y divide-line min-[900px]:divide-y-0 ${data ? 'min-[900px]:grid-cols-3 min-[900px]:divide-x min-[900px]:pt-3' : ''}`}>
        {data ? <CompanyCell verdict={data} /> : null}
        {data ? <PriceCell verdict={data} /> : null}
        <YouCell position={position} verdict={data} />
      </div>
      {sentence?.earnings ? <p className="text-[13px] font-medium text-warn-text">{sentence.earnings}</p> : null}
      {data ? <p className="text-[12px] text-ink-3">{`As of ${fmtDate(data.as_of)}. ${FOOTER}`}</p> : null}
    </section>
  )
}
