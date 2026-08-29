import { useEffect, useState } from 'react'
import { connectSaxo } from '../api/client'
import { useSaxoStatus } from '../api/queries'
import { Badge } from './ui'

export default function SaxoConnectionStatus() {
  const { data: status } = useSaxoStatus()
  const [error] = useState(
    () => new URLSearchParams(window.location.search).get('saxo') === 'error'
  )

  useEffect(() => {
    if (error) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [error])

  if (!status) return null

  if (!status.connected) {
    return (
      <div className="flex items-center gap-2">
        {error && <Badge tone="red">Connection failed</Badge>}
        <button
          onClick={connectSaxo}
          className="text-[12px] px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
        >
          Connect Saxo
        </button>
      </div>
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
