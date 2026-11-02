import { healthNotice } from '../../lib/discover'
import { StatusDot } from '../ui'

const DOT_TONES = { error: 'error', warning: 'warn', info: 'off' }

export default function DiscoverHealth({ health, asOf }) {
  const notice = healthNotice(health, asOf)
  if (!notice) return null
  return (
    <p role="status" className="flex items-start gap-2 text-[13px] text-ink-2">
      <StatusDot tone={DOT_TONES[notice.tone] ?? 'off'} className="mt-[5px]" />
      <span className="min-w-0">{notice.text}</span>
    </p>
  )
}
