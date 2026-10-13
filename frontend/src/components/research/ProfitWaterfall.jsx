import { NEGATIVE, POSITIVE, REPORTED, TRACK } from '../../lib/charts'
import { fmtStatement, waterfallSteps } from '../../lib/statements'

const stepColor = (step) => {
  if (step.kind === 'total') return REPORTED
  return step.to < step.from ? NEGATIVE : POSITIVE
}

export default function ProfitWaterfall({ period }) {
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
          <li key={step.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_5rem] items-center gap-3 text-[var(--fig-xs)]">
            <span data-testid="step-label" className={step.kind === 'total' ? 'text-zinc-100' : 'text-zinc-400'}>
              {step.label}
            </span>
            <span className="relative h-3 rounded-sm" style={{ backgroundColor: TRACK }}>
              <span
                data-testid="step-bar"
                className="absolute top-0 bottom-0 rounded-sm"
                style={{ left: `${start}%`, width: `${Math.max(end - start, 0.5)}%`, backgroundColor: stepColor(step) }}
              />
            </span>
            <span className="num font-mono text-right text-zinc-200">{fmtStatement(step.to - step.from)}</span>
          </li>
        )
      })}
    </ol>
  )
}
