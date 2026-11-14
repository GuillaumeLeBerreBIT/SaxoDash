import { fmtDate, fmtMoney, fmtPct } from '../../lib/format'
import {
  CHECK_STATUS_LABEL,
  GRADE_LABEL,
  actionLabel,
  actionTone,
  checkLine,
  trendSentence,
} from '../../lib/verdicts'
import { Card, Skeleton, Tag } from '../ui'

const PLAIN = { sign: false, decimals: 1 }

const FOOTER = 'Rules, not advice. Sell (review) means check the story, not an order.'

function Checks({ checks }) {
  return (
    <ul className="mt-3 divide-y divide-line">
      {checks.map((check) => (
        <li key={check.key} className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
          <span className="text-ink-2 num">{checkLine(check)}</span>
          <span className="font-semibold text-ink">{CHECK_STATUS_LABEL[check.status] ?? check.status}</span>
        </li>
      ))}
    </ul>
  )
}

function PriceLevels({ verdict }) {
  if (verdict.cheap_below == null && verdict.expensive_above == null) {
    return <p className="text-[13px] text-ink-3">No price levels: valuation not judged</p>
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2 num">
      {verdict.cheap_below != null && <span>{`Cheap below ${fmtMoney(verdict.cheap_below, 'USD')}`}</span>}
      {verdict.expensive_above != null && <span>{`Expensive above ${fmtMoney(verdict.expensive_above, 'USD')}`}</span>}
    </div>
  )
}

function Body({ verdict }) {
  const trend = trendSentence(verdict.pct_vs_ma200)
  return (
    <>
      <div className="flex items-center gap-2.5">
        <Tag tone={actionTone(verdict.action)} className="h-[26px] text-[13px]">
          {actionLabel(verdict)}
        </Tag>
        <span className="text-[13px] text-ink-3">As of {fmtDate(verdict.as_of)}</span>
      </div>
      <p className="mt-2 text-[14px] text-ink">{verdict.reason}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-semibold text-ink">
        <span>{`Quality: ${GRADE_LABEL.quality[verdict.quality] ?? verdict.quality}`}</span>
        <span>{`Price vs its own history: ${GRADE_LABEL.valuation[verdict.valuation] ?? verdict.valuation}`}</span>
      </div>
      <Checks checks={verdict.checks} />
      <div className="mt-3 flex flex-col gap-1">
        <PriceLevels verdict={verdict} />
        {trend && <p className="text-[13px] text-ink-2">{trend}</p>}
        {verdict.held && verdict.weight_pct != null && (
          <p className="text-[13px] text-ink-2">
            {`You hold it at ${fmtPct(verdict.weight_pct, PLAIN)} of your portfolio (cap ${fmtPct(verdict.weight_cap_pct, PLAIN)})`}
          </p>
        )}
      </div>
    </>
  )
}

function Content({ verdict }) {
  if (verdict.isLoading) {
    return (
      <div role="status" aria-label="Loading verdict" className="flex flex-col gap-3">
        <span className="sr-only">Loading verdict…</span>
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (verdict.isError) return <p role="alert" className="text-[13px] text-ink-3">Verdict unavailable right now</p>
  if (!verdict.data) return <p className="text-[13px] text-ink-3">Not covered by the nightly scan</p>
  return <Body verdict={verdict.data} />
}

export default function VerdictCard({ verdict }) {
  return (
    <Card
      context="Nightly rules over fundamentals and price history"
      dot={verdict.data && !verdict.isError ? 'ok' : 'off'}
      title="Verdict"
    >
      <Content verdict={verdict} />
      <p className="mt-3 text-[12px] text-ink-3">{FOOTER}</p>
    </Card>
  )
}
