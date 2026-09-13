import { TONE_DOT } from '../../lib/snapshot'

/** The dot-plus-text rendering for a `{tone, text}` verdict from lib/snapshot.js,
 *  shared by every tab that surfaces one instead of each defining its own copy. */
export default function VerdictBadge({ tone, text, className = '' }) {
  if (!text) return null
  return (
    <span className={`flex items-center gap-1.5 text-[11.5px] text-zinc-400 text-right ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
      {text}
    </span>
  )
}
