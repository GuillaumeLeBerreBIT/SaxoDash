import { ACTION_LABEL, actionTone } from '../../lib/verdicts'
import { Tag } from '../ui'

export default function ActionBadge({ verdict, className = '' }) {
  if (verdict === undefined) return null
  if (verdict === null) {
    return (
      <span className={`text-[12px] text-ink-3 ${className}`} title="No verdict for this one">
        —
      </span>
    )
  }
  return (
    <span title={verdict.reason} className={`inline-flex max-w-full ${className}`}>
      <Tag tone={actionTone(verdict.action)} className="h-[18px] max-w-full truncate">
        {ACTION_LABEL[verdict.action] ?? verdict.action}
      </Tag>
    </span>
  )
}
