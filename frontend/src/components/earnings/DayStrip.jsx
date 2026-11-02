import { dayDate } from '../../lib/earnings'

export default function DayStrip({ days, counts, windowFrom, selectedDay, onSelect }) {
  return (
    <div className="sticky top-[calc(env(safe-area-inset-top)+49px)] z-10 -mx-4 px-4 py-2 mb-3 bg-page flex gap-1.5 overflow-x-auto">
      {days.map(([key, label]) => {
        const count = counts[key] || 0
        const date = dayDate(windowFrom, key)
        return (
          <button
            key={key}
            type="button"
            aria-pressed={selectedDay === key}
            aria-label={`${count} reporting on ${label} ${date}`}
            onClick={() => onSelect(key)}
            className={`shrink-0 min-w-[60px] h-11 rounded-[10px] px-2 flex flex-col items-center justify-center ${
              selectedDay === key ? 'bg-selected text-ink' : 'bg-tile text-ink-2'
            } ${count ? '' : 'opacity-50'}`}
          >
            <span className="text-[12px] font-semibold">{label} {date}</span>
            <span className="text-[12px] num">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
