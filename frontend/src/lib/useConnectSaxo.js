import { useCallback, useState } from 'react'
import { connectSaxo } from '../api/client'

export function useConnectSaxo() {
  const [failed, setFailed] = useState(false)
  const connect = useCallback(async () => {
    setFailed(false)
    try {
      await connectSaxo()
    } catch {
      setFailed(true)
    }
  }, [])
  return { connect, failed }
}
