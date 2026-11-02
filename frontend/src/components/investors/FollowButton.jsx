import { Star } from 'lucide-react'

import { useFollowInvestor } from '../../api/queries'

const LABELLED = 'sd-raised bg-raised h-8 px-3 rounded-lg text-[13px]'
const ICON_ONLY = 'rounded-md px-1.5 h-7 text-[12px]'

export default function FollowButton({ investor, labelled = false, className = '' }) {
  const follow = useFollowInvestor()
  const { slug, name, followed } = investor
  return (
    <button
      type="button"
      aria-pressed={Boolean(followed)}
      aria-label={`${followed ? 'Unfollow' : 'Follow'} ${name}`}
      onClick={() => follow.mutate({ slug, followed: !followed })}
      className={`relative z-10 inline-flex items-center gap-1.5 ${labelled ? LABELLED : ICON_ONLY} font-semibold focus-visible:outline-2 focus-visible:outline-focus ${
        followed ? 'text-warn [[data-theme=light]_&]:text-warn-text hover:text-ink' : 'text-ink-3 hover:text-ink'
      } ${className}`}
    >
      <Star size={15} fill={followed ? 'currentColor' : 'none'} />
      {labelled ? <span aria-hidden="true">{followed ? 'Following' : 'Follow'}</span> : null}
    </button>
  )
}
