import { useState } from 'react'
import { PERIOD_PRESETS, resolvePeriod } from '../lib/periods'

export default function PeriodSelector({ value, onChange }) {
  const [customFrom, setCustomFrom] = useState(value.date_from)
  const [customTo, setCustomTo] = useState(value.date_to)
  const isCustom = value.key === 'custom'

  const inputClass = 'h-8 px-2 bg-zinc-900 border border-zinc-800 rounded text-[var(--fig-xs)] text-zinc-200'

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Select period"
        value={isCustom ? 'custom' : value.key}
        onChange={(e) => {
          const key = e.target.value
          if (key === 'custom') {
            onChange({ key: 'custom', date_from: customFrom, date_to: customTo, label: 'Custom range' })
          } else {
            onChange({ key, ...resolvePeriod(key) })
          }
        }}
        className={inputClass}
      >
        {PERIOD_PRESETS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
        <option value="custom">Custom range</option>
      </select>
      {isCustom && (
        <>
          <input
            type="date"
            aria-label="From date"
            value={customFrom}
            onChange={(e) => {
              setCustomFrom(e.target.value)
              onChange({ key: 'custom', date_from: e.target.value, date_to: customTo, label: 'Custom range' })
            }}
            className={inputClass}
          />
          <span className="text-zinc-600 text-[var(--fig-xs)]">to</span>
          <input
            type="date"
            aria-label="To date"
            value={customTo}
            onChange={(e) => {
              setCustomTo(e.target.value)
              onChange({ key: 'custom', date_from: customFrom, date_to: e.target.value, label: 'Custom range' })
            }}
            className={inputClass}
          />
        </>
      )}
    </div>
  )
}
