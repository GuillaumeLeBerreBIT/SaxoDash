import { useEffect, useState } from 'react'

/** Holds `value` until it stops changing for `delay`ms - for input driving a
 *  network request (a search box), where firing on every keystroke would
 *  outrun a rate limit `useDeferredValue` doesn't help with: that only
 *  lowers render priority, it doesn't skip the requests in between. */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
