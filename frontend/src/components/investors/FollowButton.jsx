import { Star } from 'lucide-react'

import { useFollowInvestor } from '../../api/queries'

export default function FollowButton({ investor, labelled = false, className = '' }) {
  const follow = useFollowInvestor()
  const { slug, name, followed } = investor
  return (
    <button
      type="button"
      aria-pressed={Boolean(followed)}
      aria-label={`${followed ? 'Unfollow' : 'Follow'} ${name}`}
      onClick={() => follow.mutate({ slug, followed: !followed })}
      className={`relative z-10 inline-flex items-center gap-1.5 rounded-md px-1.5 h-7 text-[var(--fig-xs)] focus-visible:outline-2 focus-visible:outline-blue-500 ${
        followed ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-500 hover:text-zinc-200'
      } ${className}`}
    >
      <Star size={15} fill={followed ? 'currentColor' : 'none'} />
      {labelled ? <span aria-hidden="true">{followed ? 'Following' : 'Follow'}</span> : null}
    </button>
  )
}
