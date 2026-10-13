import { useLayoutEffect, useRef } from 'react'

export function useScrollToEnd(columns, first, last) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    let current = true
    const scrollToEnd = () => {
      if (current && ref.current) ref.current.scrollLeft = ref.current.scrollWidth
    }
    scrollToEnd()
    document.fonts?.ready.then(scrollToEnd)
    return () => {
      current = false
    }
  }, [columns, first, last])
  return ref
}
