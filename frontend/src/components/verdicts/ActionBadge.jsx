import { actionLabel, actionTone } from '../../lib/verdicts'
import { Tag } from '../ui'

export default function ActionBadge({ verdict }) {
  if (verdict === undefined) return null
  if (verdict === null) {
    return (
      <span className="text-[12px] text-ink-3" title="No verdict for this one">
        —
      </span>
    )
  }
  return (
    <span title={verdict.reason} className="inline-flex max-w-full">
      <Tag tone={actionTone(verdict.action)} className="h-[18px] max-w-full overflow-hidden">
        {actionLabel(verdict)}
      </Tag>
    </span>
  )
}
