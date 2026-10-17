import { useState } from 'react'

import { initials } from '../../lib/investorHub'

export default function InvestorAvatar({ name, photo, size = 36, className = '' }) {
  const [failedPhoto, setFailedPhoto] = useState(null)
  if (photo && failedPhoto !== photo) {
    return (
      <img
        src={photo}
        alt=""
        loading="lazy"
        onError={() => setFailedPhoto(photo)}
        style={{ width: size, height: size }}
        className={`shrink-0 rounded-full border border-white/[0.08] bg-zinc-800 object-cover object-top ${className}`}
      />
    )
  }
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
