import { fmtPct } from '../../lib/format'
import { INTERVALS, periodChange } from '../../lib/research'
import { TBtn } from '../ui'

export function RangeButtons({ controls }) {
  return (
    <div className="flex items-center gap-0.5">
      {INTERVALS.map((interval) => (
        <TBtn key={interval} active={controls.range === interval} onClick={() => controls.setRange(interval)}>
          {interval}
        </TBtn>
      ))}
    </div>
  )
}

export function LineSaveAlert({ failed }) {
  if (!failed) return null
  return (
    <span role="alert" className="ml-2 text-[var(--fig-2xs)] text-red-400">
      Couldn't save line
    </span>
  )
}

export function PeriodChange({ bars }) {
  const period = periodChange(bars)
  if (period == null) return null
  return (
    <span className="text-[var(--fig-2xs)] text-zinc-500">
      Period{' '}
      <span className={`num font-mono ${period >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {fmtPct(period)}
      </span>
    </span>
  )
}
