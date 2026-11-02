import { fmtStatement, waterfallSteps } from '../../lib/statements'
import { useChartColors } from '../../theme/useChartColors'

const stepColor = (step, c) => {
  if (step.kind === 'total') return c.primary
  return step.to < step.from ? c.down : c.up
}

export default function ProfitWaterfall({ period }) {
  const c = useChartColors()
  const steps = waterfallSteps(period)
  if (!steps.length) return null

  const levels = steps.flatMap((step) => [step.from, step.to])
  const low = Math.min(0, ...levels)
  const high = Math.max(0, ...levels)
  const span = high - low || 1
  const share = (value) => ((value - low) / span) * 100

  return (
    <ol className="space-y-1.5">
      {steps.map((step) => {
        const start = share(Math.min(step.from, step.to))
        const end = share(Math.max(step.from, step.to))
        return (
          <li key={step.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_5rem] items-center gap-3 min-h-[34px] text-[13px]">
            <span data-testid="step-label" className={step.kind === 'total' ? 'font-bold text-ink' : 'text-ink-2'}>
              {step.label}
            </span>
            <span className="relative h-3 rounded-[3px]" style={{ backgroundColor: c.track }}>
              <span
                data-testid="step-bar"
                className="absolute top-0 bottom-0 rounded-[3px]"
                style={{ left: `${start}%`, width: `${Math.max(end - start, 0.5)}%`, backgroundColor: stepColor(step, c) }}
              />
            </span>
            <span className={`num text-right ${step.kind === 'total' ? 'font-bold text-ink' : 'text-ink-2'}`}>{fmtStatement(step.to - step.from)}</span>
          </li>
        )
      })}
    </ol>
  )
}
