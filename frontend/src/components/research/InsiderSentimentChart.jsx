import { fmtNum } from '../../lib/format'
import { sentimentRows } from '../../lib/insiders'
import { useChartColors } from '../../theme/useChartColors'

const summary = ({ label, mspr, change }) => `${label}: ${fmtNum(mspr, mspr % 1 === 0 ? 0 : 2)}, net ${fmtNum(change)} shares`

function Bar({ mspr, side, c }) {
  const active = side === 'above' ? mspr > 0 : mspr < 0
  return (
    <span className={`flex h-1/2 w-full ${side === 'above' ? 'items-end' : 'items-start'}`}>
      {active && (
        <span
          data-bar
          data-side={side}
          className="w-full rounded-sm"
          style={{ height: `${Math.min(Math.abs(mspr), 100)}%`, backgroundColor: mspr > 0 ? c.up : c.down }}
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
  const c = useChartColors()
  const rows = sentimentRows(sentiment)
  if (!rows.length) return null

  return (
    <div>
      <ol aria-label="Insider sentiment by month" className="flex items-stretch gap-1 h-32">
        {rows.map((row, index) => (
          <li key={row.month} aria-label={summary(row)} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
            <span className="relative flex w-full flex-1 flex-col">
              <Bar mspr={row.mspr} side="above" c={c} />
              <span aria-hidden="true" className="h-px w-full bg-ink-3" />
              <Bar mspr={row.mspr} side="below" c={c} />
            </span>
            <span data-month-label className="text-[11px] text-ink-3 whitespace-nowrap">
              {visibleLabel(row, index)}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[12px] text-ink-3">Monthly share purchase ratio: 100 is all buying, -100 all selling.</p>
    </div>
  )
}
