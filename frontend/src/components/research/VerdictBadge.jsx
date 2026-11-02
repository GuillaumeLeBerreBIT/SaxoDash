import { Tag } from '../ui'

const TAG_TONE = { pos: 'up', caution: 'warn', neutral: undefined }

export default function VerdictBadge({ tone, text, className = '' }) {
  if (!text) return null
  return (
    <Tag tone={TAG_TONE[tone]} className={`h-auto! min-h-[22px] py-0.5 whitespace-normal! text-right ${className}`}>
      {text}
    </Tag>
  )
}
