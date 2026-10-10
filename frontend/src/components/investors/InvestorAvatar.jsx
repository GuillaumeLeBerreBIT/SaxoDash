import { initials } from '../../lib/investorHub'

export default function InvestorAvatar({ name, size = 36, className = '' }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={`shrink-0 rounded-full bg-zinc-800 border border-white/[0.08] flex items-center justify-center font-semibold text-zinc-300 ${className}`}
    >
      {initials(name)}
    </span>
  )
}
