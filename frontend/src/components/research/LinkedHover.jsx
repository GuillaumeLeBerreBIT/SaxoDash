/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState } from 'react'

const LinkedHoverContext = createContext(null)

export function LinkedHoverProvider({ enabled, children }) {
  const [date, setDate] = useState(null)
  const value = useMemo(() => (enabled ? { date, setDate } : null), [enabled, date])
  return <LinkedHoverContext.Provider value={value}>{children}</LinkedHoverContext.Provider>
}

export const useLinkedHover = () => useContext(LinkedHoverContext)
