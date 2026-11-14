import { fmtDate } from '../../lib/format'
import { GRADE_WORDS, activeSignals, evidenceLine, signalGrade } from '../../lib/signals'
import { Card } from '../ui'

const GRADE_TONE = {
  supported: 'text-accent',
  against: 'text-warn-text',
  no_edge: 'text-ink-3',
  too_few: 'text-ink-3',
}

function footer(signals) {
  const period = signals.find((signal) => signal.period)?.period
  const span = period ? `Tested on index stocks from ${fmtDate(period.from)} to ${fmtDate(period.to)}` : 'Not tested yet'
  return `${span}, against the average stock, before costs. What happened in the past does not promise what happens next.`
}

export default function SetupCard({ stockSignals, signals }) {
  if (!stockSignals || !signals?.length) return null
  const active = activeSignals(stockSignals, signals)
  return (
    <Card
      context={stockSignals.as_of ? `Chart signals on ${fmtDate(stockSignals.as_of)}` : 'Chart signals'}
      dot={active.length ? 'ok' : 'off'}
      title="Setup"
    >
      {active.length === 0 ? (
        <p className="text-[13px] text-ink-3">No signals active on the latest session</p>
      ) : (
        <>
          <p className="text-[12px] text-ink-3">Active on the latest session</p>
          <ul className="mt-2 flex flex-col gap-2.5">
            {active.map((signal) => {
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
      <p className="mt-3 text-[12px] text-ink-3">{footer(signals)}</p>
    </Card>
  )
}
