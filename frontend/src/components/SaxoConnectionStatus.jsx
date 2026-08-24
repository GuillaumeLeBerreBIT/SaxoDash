import { useEffect, useState } from 'react'
import { getSaxoStatus, connectSaxo } from '../api/client'
import { Badge } from './ui'

export default function SaxoConnectionStatus() {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    getSaxoStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  if (!status) return null

  if (!status.connected) {
    return (
      <button
        onClick={connectSaxo}
        className="text-[12px] px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
      >
        Connect Saxo
      </button>
    )
  }

  if (status.needs_reauth) {
    return (
      <button
        onClick={connectSaxo}
        className="text-[12px] px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
      >
        Reconnect Saxo
      </button>
    )
  }

  return <Badge tone="emerald">Saxo connected</Badge>
}
