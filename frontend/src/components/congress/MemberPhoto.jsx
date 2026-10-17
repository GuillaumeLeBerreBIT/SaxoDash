import { useState } from 'react'

import InvestorAvatar from '../investors/InvestorAvatar'

export default function MemberPhoto({ member, size = 36 }) {
  const [failed, setFailed] = useState(false)
  if (!member.photo_url || failed) return <InvestorAvatar name={member.name} size={size} />
  return (
    <img
      src={member.photo_url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full border border-white/[0.08] bg-zinc-800 object-cover object-top"
    />
  )
}
