import { fmtPct, pctTone } from '../../lib/format'
import { INTERVALS, periodChange } from '../../lib/research'
import { Segmented } from '../ui'

const MOVE_TONE = { positive: 'text-up', negative: 'text-down', neutral: 'text-flat' }
const MOVE_ARROW = { positive: '▲ ', negative: '▼ ', neutral: '' }

export function MoveCaption({ change, suffix, className = '' }) {
  const tone = pctTone(change)
  return (
    <span className={`num whitespace-nowrap ${MOVE_TONE[tone]} ${className}`}>
      <span aria-hidden="true">{MOVE_ARROW[tone]}</span>
      {fmtPct(change)}{suffix ? ` ${suffix}` : ''}
    </span>
  )
}

const VIEW_OPTIONS = [
  { value: 'price', label: 'Price' },
  { value: 'advanced', label: 'Advanced chart' },
]

export function ChartViewSwitch({ value, onChange }) {
  return <Segmented label="Chart view" value={value} onChange={onChange} options={VIEW_OPTIONS} />
}

const INTERVAL_OPTIONS = INTERVALS.map((interval) => ({ value: interval, label: interval }))

export function RangeButtons({ controls }) {
  const zoomed = controls.timeView?.barCount != null
  return (
    <Segmented
      label="Chart range"
      options={INTERVAL_OPTIONS}
      value={zoomed ? null : controls.range}
      onChange={controls.setRange}
    />
  )
}

export function LineSaveAlert({ failed }) {
  if (!failed) return null
  return (
    <span role="alert" className="ml-2 text-[12px] text-down">
      Couldn't save line
    </span>
  )
}

export function PeriodChange({ bars }) {
  const period = periodChange(bars)
  if (period == null) return null
  return (
    <span className="text-[12px] text-ink-3">
      Period <MoveCaption change={period} />
    </span>
  )
}
