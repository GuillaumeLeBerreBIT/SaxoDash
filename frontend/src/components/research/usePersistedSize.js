import { useState } from 'react'

import { readSize, writeSize } from '../../lib/railLayout'

export function usePersistedSize(limits) {
  const [size, setSize] = useState(() => readSize(limits.key, limits))
  const update = (next) => {
    setSize(next)
    writeSize(limits.key, next)
  }
  return [size, update]
}
