import { useState } from 'react'

import { instrumentKey } from '../../lib/research'

export function useInstrumentReset(instrument, reset) {
  const key = instrumentKey(instrument?.uic, instrument?.assetType)
  const [seenKey, setSeenKey] = useState(key)
  if (seenKey !== key) {
    setSeenKey(key)
    if (seenKey != null) reset()
  }
  return key
}
