import { actionLabel, actionTone } from '../../lib/verdicts'

const TONE_TEXT = { up: 'text-up', warn: 'text-warn' }

export default function ActionBadge({ verdict, className = '' }) {
  if (verdict === undefined) return null
  if (verdict === null) {
    return (
      <span className="text-[12px] text-ink-3" title="No verdict for this one">
        —
      </span>
    )
  }
  const toneName = verdict.capped ? 'warn' : actionTone(verdict.action)
  const tone = TONE_TEXT[toneName] ?? 'text-ink-2'
  return (
    <span
      title={verdict.reason}
      data-tone={toneName ?? 'neutral'}
      className={`inline-block max-w-full truncate align-middle text-[13px] font-semibold ${tone} ${className}`}
    >
      {actionLabel(verdict)}
    </span>
  )
}
