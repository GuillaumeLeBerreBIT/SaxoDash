const TEXT_TONE = { pos: 'text-up', caution: 'text-warn-text', neutral: 'text-ink-2' }

export default function VerdictBadge({ tone, text, className = '' }) {
  if (!text) return null
  return (
    <span data-tone={tone ?? 'neutral'} className={`text-right text-[13px] font-semibold ${TEXT_TONE[tone] ?? TEXT_TONE.neutral} ${className}`}>
      {text}
    </span>
  )
}
