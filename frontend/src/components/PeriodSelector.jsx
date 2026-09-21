import { useState } from 'react'
import { PERIOD_PRESETS, resolvePeriod } from '../lib/periods'
import { Input, Select } from './ui'

export default function PeriodSelector({ value, onChange }) {
  const [customFrom, setCustomFrom] = useState(value.date_from)
  const [customTo, setCustomTo] = useState(value.date_to)
  const isCustom = value.key === 'custom'

  return (
    <div className="flex items-center gap-2">
      <Select
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
        className="h-8"
      >
        {PERIOD_PRESETS.map((p) => (
          <option key={p.key} value={p.key}>{p.label}</option>
        ))}
        <option value="custom">Custom range</option>
      </Select>
      {isCustom && (
        <>
          <Input
            type="date"
            aria-label="From date"
            value={customFrom}
            onChange={(e) => {
              const nextFrom = e.target.value
              setCustomFrom(nextFrom)
              if (nextFrom && customTo) {
                onChange({ key: 'custom', date_from: nextFrom, date_to: customTo, label: 'Custom range' })
              }
            }}
            className="h-8"
          />
          <span className="text-zinc-600 text-[var(--fig-xs)]">to</span>
          <Input
            type="date"
            aria-label="To date"
            value={customTo}
            onChange={(e) => {
              const nextTo = e.target.value
              setCustomTo(nextTo)
              if (customFrom && nextTo) {
                onChange({ key: 'custom', date_from: customFrom, date_to: nextTo, label: 'Custom range' })
              }
            }}
            className="h-8"
          />
        </>
      )}
    </div>
  )
}
