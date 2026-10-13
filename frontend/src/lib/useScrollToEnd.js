import { useLayoutEffect, useRef } from 'react'

export function useScrollToEnd(columns, first, last) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth
  }, [columns, first, last])
  return ref
}
