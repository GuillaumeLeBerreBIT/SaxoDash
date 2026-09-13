import { useLayoutEffect, useState } from 'react'

/** The measured rect a portaled dropdown positions itself from, tracked
 *  while `active` and re-measured on scroll/resize. Portaling to <body> is
 *  what lets the dropdown escape a clipping ancestor (an `overflow-x-auto`
 *  table wrapper, in PeersTab's case) - see 1b14d3e/0a4aa02. Shared by
 *  PeersTab's "Add peer" search and InstrumentSearchBar so the positioning
 *  logic exists once. */
export function usePortalMenuRect(ref, active, { minWidth = 0 } = {}) {
  const [rect, setRect] = useState(null)

  useLayoutEffect(() => {
    if (!active) return undefined
    const update = () => {
      const r = ref.current?.getBoundingClientRect()
      if (r) setRect({ top: r.bottom, left: r.left, width: Math.max(r.width, minWidth) })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [active, ref, minWidth])

  return active ? rect : null
}
