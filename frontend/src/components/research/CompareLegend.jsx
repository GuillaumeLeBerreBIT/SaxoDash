import { valueAt } from '../../lib/compare'
import { fmtDate, fmtDayMonth, fmtPct } from '../../lib/format'

function reading(line, hover) {
  if (line.status === 'loading') return 'Loading'
  if (line.status === 'error') return 'Unavailable'
  const value = valueAt(line, hover)
  return value == null ? 'No data' : fmtPct(value, { decimals: 1 })
}

export default function CompareLegend({ lines, date, hover, hidden, onToggle, onRemove }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pt-2 text-[13px] num" data-testid="compare-legend">
      <span className="w-full min-[760px]:w-auto text-ink-2">{fmtDate(date)}</span>
      {lines.map((line) => {
        const shown = !hidden.has(line.key)
        return (
          <span key={line.key} className={`inline-flex items-center gap-1.5 ${shown ? '' : 'opacity-45'}`}>
            <button
              type="button"
              aria-pressed={shown}
              aria-label={`${shown ? 'Hide' : 'Show'} ${line.label}`}
              onClick={() => onToggle(line.key)}
              className="inline-flex items-center gap-1.5 rounded hover:text-ink"
            >
              <span aria-hidden="true" className="w-2.5 h-[3px] rounded-sm" style={{ backgroundColor: line.color }} />
              <span className="font-semibold text-ink">{line.label}</span>
              {line.from ? <span className="text-ink-3">from {fmtDayMonth(line.from)}</span> : null}
            </button>
            <span className={line.status === 'ok' ? 'text-ink' : 'text-ink-3'}>{reading(line, hover)}</span>
            {line.removable ? (
              <button
                type="button"
                aria-label={`Remove ${line.label}`}
                onClick={() => onRemove(line.instrument)}
                className="px-1 rounded text-ink-3 hover:text-ink hover:bg-hover"
              >
                ×
              </button>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}
