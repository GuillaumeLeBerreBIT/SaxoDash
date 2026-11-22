import { fmtDate } from '../../lib/format'
import { GRADE_WORDS, activeSignals, evidenceLine, signalGrade, standingRows } from '../../lib/signals'
import { Panel } from '../ui'

const GRADE_TONE = {
  supported: 'text-accent',
  against: 'text-warn-text',
  no_edge: 'text-ink-3',
  unproven: 'text-ink-3',
  too_few: 'text-ink-3',
}

function footer(signals) {
  const period = signals.find((signal) => signal.period)?.period
  const span = period ? `Tested on index stocks from ${fmtDate(period.from)} to ${fmtDate(period.to)}` : 'Not tested yet'
  return `${span}, against the average stock, before costs. What happened in the past does not promise what happens next.`
}

function Standing({ context }) {
  const rows = standingRows(context)
  if (!rows.length) return null
  return (
    <dl data-testid="price-standing" className="mb-3 flex flex-col gap-1.5 border-b border-line pb-3">
      {rows.map((row) => (
        <div key={row.key} className="flex items-baseline justify-between gap-3">
          <dt className="text-[12px] text-ink-2">{row.label}</dt>
          <dd className="text-right text-[13px] font-semibold text-ink tabular-nums">
            {row.value}
            {row.note ? <span className="block text-[12px] font-normal text-ink-3">{row.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const MEANINGFUL = new Set(['supported', 'against'])

function othersLine(count) {
  if (!count) return null
  const many = count === 1 ? 'One other chart signal is active; it' : `${count} other chart signals are active; they`
  return `${many} showed no reliable edge in testing and ${count === 1 ? 'is' : 'are'} listed in the Guide.`
}

export default function SetupCard({ stockSignals, signals, bare = false, className = '' }) {
  if (!stockSignals || !signals?.length) return null
  const active = activeSignals(stockSignals, signals)
  const shown = active.filter((signal) => MEANINGFUL.has(signalGrade(signal)))
  const others = othersLine(active.length - shown.length)
  return (
    <Panel
      bare={bare}
      className={className}
      context={stockSignals.as_of ? `Chart signals on ${fmtDate(stockSignals.as_of)}` : 'Chart signals'}
      dot={shown.length ? 'ok' : 'off'}
      title="Setup"
    >
      <div className={bare ? 'max-w-[760px]' : ''}>
        <Standing context={stockSignals.context} />
        {shown.length === 0 ? (
          <p className="text-[13px] text-ink-3">No signal that held up in testing is active on the latest session</p>
        ) : (
          <>
            <p className="text-[12px] text-ink-3">Active on the latest session</p>
            <ul className="mt-2 flex flex-col gap-2.5">
              {shown.map((signal) => {
                const grade = signalGrade(signal)
                return (
                  <li key={signal.key} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-semibold text-ink">{signal.label}</span>
                      <span className={`text-[12px] font-medium shrink-0 ${GRADE_TONE[grade]}`}>{GRADE_WORDS[grade]}</span>
                    </div>
                    <p className="text-[12px] text-ink-2">{signal.description}</p>
                    <p className="text-[12px] text-ink-3">{evidenceLine(signal)}</p>
                  </li>
                )
              })}
            </ul>
          </>
        )}
        {others ? <p data-testid="other-signals" className="mt-2 text-[12px] text-ink-3">{others}</p> : null}
        <p className="mt-3 text-[12px] text-ink-3">{footer(signals)}</p>
      </div>
    </Panel>
  )
}
