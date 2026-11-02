import { fmtPct, pctTone } from '../../lib/format'
import { INTERVALS, periodChange } from '../../lib/research'
import { TBtn } from '../ui'

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

export function RangeButtons({ controls }) {
  const zoomed = controls.timeView?.barCount != null
  return (
    <div className="inline-flex items-center gap-0.5 p-[3px] rounded-[9px] bg-track">
      {INTERVALS.map((interval) => (
        <TBtn key={interval} active={!zoomed && controls.range === interval} onClick={() => controls.setRange(interval)}>
          {interval}
        </TBtn>
      ))}
    </div>
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
