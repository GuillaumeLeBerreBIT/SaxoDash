import { useState } from 'react'

export const LIST_PAGE = 25
export const DIRECTORY_PAGE = 24

export function usePaged(items, size = LIST_PAGE, step = size) {
  const [count, setCount] = useState(size)
  const total = items?.length ?? 0
  const shown = Math.min(count, total)
  return {
    rows: (items ?? []).slice(0, count),
    shown,
    total,
    more: total > count ? () => setCount(count + step) : null,
  }
}
