import { NEGATIVE, POSITIVE } from '../../lib/charts'
import { fmtNum } from '../../lib/format'
import { sentimentRows } from '../../lib/insiders'

const summary = ({ label, mspr, change }) => `${label}: ${fmtNum(mspr, mspr % 1 === 0 ? 0 : 2)}, net ${fmtNum(change)} shares`

function Bar({ mspr, side }) {
  const active = side === 'above' ? mspr > 0 : mspr < 0
  return (
    <span className={`flex h-1/2 w-full ${side === 'above' ? 'items-end' : 'items-start'}`}>
      {active && (
        <span
          data-bar
          data-side={side}
          className="w-full rounded-sm"
          style={{ height: `${Math.min(Math.abs(mspr), 100)}%`, backgroundColor: mspr > 0 ? POSITIVE : NEGATIVE }}
        />
      )}
    </span>
  )
}

const JANUARY = '01'

function visibleLabel(row, index) {
  if (index === 0 || row.month.slice(5) === JANUARY) return row.label
  return row.label.split(' ')[0]
}

export default function InsiderSentimentChart({ sentiment }) {
  const rows = sentimentRows(sentiment)
  if (!rows.length) return null

  return (
    <div className="mt-4">
      <ol aria-label="Insider sentiment by month" className="flex items-stretch gap-1 h-32">
        {rows.map((row, index) => (
          <li key={row.month} aria-label={summary(row)} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
            <span className="relative flex w-full flex-1 flex-col">
              <Bar mspr={row.mspr} side="above" />
              <span aria-hidden="true" className="h-px w-full bg-white/[0.12]" />
              <Bar mspr={row.mspr} side="below" />
            </span>
            <span data-month-label className="text-[var(--fig-2xs)] text-zinc-500 whitespace-nowrap">
              {visibleLabel(row, index)}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[var(--fig-2xs)] text-zinc-500">Monthly share purchase ratio: 100 is all buying, -100 all selling.</p>
    </div>
  )
}
