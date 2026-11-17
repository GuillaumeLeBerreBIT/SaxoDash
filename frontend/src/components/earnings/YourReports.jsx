import { useSymbolEarnings } from '../../api/queries'
import { eventKey, rankEvents } from '../../lib/earnings'
import { lastResults, resultWord, whenWords } from '../../lib/earningsBrief'
import { fmtEur, fmtNum, fmtPct } from '../../lib/format'
import { displayName } from '../../lib/names'
import { InstrumentLogo, LetterAvatar } from '../ui'

const TONE = { up: 'text-up bg-up-subtle', down: 'text-down bg-down-subtle', flat: 'text-ink-2 bg-pill', warn: 'text-warn-text bg-pill' }
const TEXT_TONE = { up: 'text-up', down: 'text-down', flat: 'text-ink-2', warn: 'text-warn-text' }
const MAX_CARDS = 4

function Field({ label, children, sub }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] font-semibold text-ink-3">{label}</span>
      <span className="text-[16px] font-bold text-ink num">{children}</span>
      {sub ? <span className="text-[12px] text-ink-3 num">{sub}</span> : null}
    </div>
  )
}

function Expectation({ event }) {
  const result = resultWord(event)
  if (event.eps_actual != null) {
    return (
      <Field label="Result" sub={event.eps_estimate == null ? null : `expected ${fmtNum(event.eps_estimate, 2)}`}>
        <span className={TEXT_TONE[result.tone]}>{result.word}</span> EPS {fmtNum(event.eps_actual, 2)}
      </Field>
    )
  }
  return <Field label="Analysts expect">{event.eps_estimate == null ? '—' : `EPS ${fmtNum(event.eps_estimate, 2)}`}</Field>
}

function History({ symbol }) {
  const { data, isLoading } = useSymbolEarnings(symbol)
  const results = lastResults(data?.history)
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-ink-3">Last four reports</span>
      {isLoading ? (
        <span className="text-[13px] text-ink-3">…</span>
      ) : results.length === 0 ? (
        <span className="text-[13px] text-ink-3">No history</span>
      ) : (
        <span className="flex flex-wrap gap-1.5" data-testid="last-results">
          {results.map((row) => (
            <span key={row.date} className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${TONE[row.tone]}`}>
              {row.word}
            </span>
          ))}
        </span>
      )}
    </div>
  )
}

function ReportCard({ event, onOpen }) {
  return (
    <article
      data-testid="your-report"
      className="grid grid-cols-1 items-center gap-4 rounded-[14px] bg-pane p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-7"
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <InstrumentLogo symbol={event.symbol} size={44} fallback={<LetterAvatar symbol={event.symbol} size={44} chars={2} className="rounded-full" />} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span title={event.name || event.symbol} className="truncate text-[17px] font-bold text-ink">{displayName(event.name) || event.symbol}</span>
          <span className="text-[13px] font-semibold text-earn first-letter:uppercase">{whenWords(event)}</span>
        </div>
      </div>
      <Expectation event={event} />
      <History symbol={event.symbol} />
      <Field
        label={event.held ? 'You hold' : 'You watch it'}
        sub={event.weight_pct == null ? null : `${fmtPct(event.weight_pct, { sign: false, decimals: 1 })} of your portfolio`}
      >
        {event.held && event.value != null ? fmtEur(event.value, { decimals: 0 }) : event.symbol}
      </Field>
      <button
        type="button"
        onClick={() => onOpen(event.symbol)}
        className="h-10 justify-self-start whitespace-nowrap rounded-[10px] bg-accent px-4 text-[14px] font-bold text-on-accent hover:bg-accent-hover md:justify-self-end"
      >
        {`Open ${event.symbol}`}
      </button>
    </article>
  )
}

export default function YourReports({ events, onOpen }) {
  const mine = rankEvents(events.filter((event) => event.mine)).slice(0, MAX_CARDS)
  if (mine.length === 0) return null
  return (
    <section aria-label="Your stocks reporting" className="flex flex-col gap-3">
      {mine.map((event) => (
        <ReportCard key={eventKey(event)} event={event} onOpen={onOpen} />
      ))}
      <p className="text-[12px] text-ink-3">A report can move a price sharply in one session. A stop-loss does not protect against a gap at the open.</p>
    </section>
  )
}
