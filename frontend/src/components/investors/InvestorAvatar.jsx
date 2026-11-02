import { useState } from 'react'

import { initials } from '../../lib/investorHub'

const IMAGE_STYLES = {
  photo: 'bg-pill object-cover object-top',
  logo: 'bg-white object-contain',
}
const LOGO_INSET = 0.12

export default function InvestorAvatar({ name, photo, logo, size = 36, className = '' }) {
  const [failed, setFailed] = useState(() => new Set())
  const image = [['photo', photo], ['logo', logo]].find(([, src]) => src && !failed.has(src))
  if (image) {
    const [kind, src] = image
    return (
      <img
        key={src}
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailed((current) => new Set(current).add(src))}
        style={{ width: size, height: size, padding: kind === 'logo' ? Math.round(size * LOGO_INSET) : 0 }}
        className={`shrink-0 rounded-full ring-1 ring-line ${IMAGE_STYLES[kind]} ${className}`}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={`shrink-0 rounded-full bg-pill ring-1 ring-line flex items-center justify-center font-semibold text-ink-2 ${className}`}
    >
      {initials(name)}
    </span>
  )
}
