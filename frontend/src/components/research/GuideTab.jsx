import { EARNINGS_GUIDE, PLAYBOOKS, QUADRANT_GUIDE, RATIO_GUIDE, SIGNALS_GUIDE, SNAPSHOT_GUIDE } from '../../lib/guide'
import { GRADE_WORDS, evidenceLine, groupedByGrade } from '../../lib/signals'
import { Card } from '../ui'

const BOARD = 'grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start'
const COLUMN = 'flex flex-col gap-[var(--sd-gap,12px)] min-w-0'
const SPAN_5 = `${COLUMN} min-[1100px]:col-span-5`
const SPAN_7 = `${COLUMN} min-[1100px]:col-span-7`
const ROW = 'py-3 border-t border-line first:border-t-0 first:pt-0 last:pb-0'

function GuideGroup({ label, meaning, read }) {
  return (
    <div className={ROW}>
      <div className="text-[14px] font-bold text-ink">{label}</div>
      <p className="mt-1 text-[13.5px] text-ink-2 leading-relaxed">{meaning}</p>
      <p className="mt-1 text-[13.5px] text-ink leading-relaxed">{read}</p>
    </div>
  )
}

function GuideMetric({ name, text }) {
  return (
    <div>
      <div className="text-[13.5px] font-semibold text-ink">{name}</div>
      <p className="mt-0.5 text-[13px] text-ink-2 leading-relaxed">{text}</p>
    </div>
  )
}

function Snapshot() {
  return (
    <Card context="What each group reads, and what counts as good, ok, or caution" dot="off" title="Investment snapshot">
      {SNAPSHOT_GUIDE.map((g) => (
        <GuideGroup key={g.key} label={g.label} meaning={g.meaning} read={g.read} />
      ))}
    </Card>
  )
}

function Ratios() {
  return (
    <Card context="What each ratio measures, and where it's most useful" dot="off" title="Ratios">
      {RATIO_GUIDE.map((group) => (
        <div key={group.label} className={ROW}>
          <div className="text-[14px] font-bold text-ink">{group.label}</div>
          <div className="mt-2 space-y-3">
            {group.metrics.map((m) => (
              <GuideMetric key={m.name} name={m.name} text={m.text} />
            ))}
          </div>
        </div>
      ))}
    </Card>
  )
}

function Playbooks() {
  return (
    <Card context="Worked combinations, not single metrics in isolation" dot="off" title="Putting it together">
      <ul>
        {PLAYBOOKS.map((p) => (
          <li key={p} className={`${ROW} text-[13.5px] text-ink-2 leading-relaxed`}>
            {p}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Quadrant() {
  return (
    <Card context="How the two axes are built, and what each corner means" dot="off" title="Quality vs. valuation quadrant">
      <p className="text-[13.5px] text-ink-2 leading-relaxed">{QUADRANT_GUIDE.meaning}</p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {QUADRANT_GUIDE.corners.map((c) => (
          <div key={c.label} className="rounded-[10px] bg-tile px-3.5 py-3">
            <div className="text-[13px] font-semibold text-ink">{c.label}</div>
            <p className="mt-1 text-[13px] text-ink-2 leading-relaxed">{c.text}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function EarningsSignals() {
  return (
    <Card context="What the surprise bars and quarterly trend calls actually flag" dot="off" title="Earnings signals">
      <div className="space-y-3">
        {EARNINGS_GUIDE.map((e) => (
          <GuideMetric key={e.name} name={e.name} text={e.text} />
        ))}
      </div>
    </Card>
  )
}

function ChartSignals() {
  return (
    <Card context="How the Signals menu and the Setup card grade a chart signal" dot="off" title="Chart signals">
      <div className="space-y-3">
        {SIGNALS_GUIDE.map((e) => (
          <GuideMetric key={e.name} name={e.name} text={e.text} />
        ))}
      </div>
    </Card>
  )
}

function SignalsTested({ signals }) {
  const groups = groupedByGrade(signals)
  if (!groups.length) return null
  return (
    <Card context="Every chart signal the app tests each night, and how it did" dot="off" title="Signals tested">
      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.grade} aria-label={GRADE_WORDS[group.grade]}>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">{GRADE_WORDS[group.grade]}</h3>
            <ul className="mt-1.5 space-y-2">
              {group.signals.map((signal) => (
                <li key={signal.key}>
                  <div className="text-[13.5px] font-semibold text-ink">{signal.label}</div>
                  <p className="text-[13px] text-ink-2 leading-relaxed">{signal.description}</p>
                  <p className="text-[12.5px] text-ink-3">{evidenceLine(signal)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  )
}

export default function GuideTab({ signals }) {
  return (
    <div className={BOARD}>
      <div className={SPAN_7}>
        <Snapshot />
        <Ratios />
      </div>
      <div className={SPAN_5}>
        <Playbooks />
        <Quadrant />
        <EarningsSignals />
        <ChartSignals />
        <SignalsTested signals={signals} />
      </div>
    </div>
  )
}
