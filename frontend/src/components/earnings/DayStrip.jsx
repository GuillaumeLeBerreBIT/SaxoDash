import { dayDate } from '../../lib/earnings'

export default function DayStrip({ days, counts, mineCounts = {}, windowFrom, selectedDay, onSelect }) {
  return (
    <div className="sticky top-[calc(env(safe-area-inset-top)+49px)] z-10 -mx-4 px-4 py-2 mb-3 bg-page flex gap-1.5 overflow-x-auto md:static md:mx-0 md:px-0 md:py-0">
      {days.map(([key, label]) => {
        const count = counts[key] || 0
        const mine = mineCounts[key] || 0
        const date = dayDate(windowFrom, key)
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selectedDay === key}
            aria-label={`${label} ${date}, ${count} reporting${mine ? `, ${mine} of yours` : ''}`}
            onClick={() => onSelect(key)}
            className={`shrink-0 min-w-[72px] h-14 rounded-[12px] px-2 flex flex-col items-center justify-center md:flex-1 md:h-16 ${
              selectedDay === key ? 'bg-selected text-ink' : 'bg-tile text-ink-2'
            } ${count ? '' : 'opacity-50'}`}
          >
            <span className="text-[12px] font-semibold">{label} {date}</span>
            <span className="text-[12px] num">{count} reporting</span>
            {mine ? <span className="text-[11px] font-semibold text-earn">{mine === 1 ? '1 of yours' : `${mine} of yours`}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
