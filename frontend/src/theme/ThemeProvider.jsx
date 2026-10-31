import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react'
import { DENSITY, readAppearance, themeVars } from '../lib/theme.js'

const STORAGE_KEY = 'saxodash:appearance'

const AppearanceContext = createContext(null)

function load() {
  try {
    return readAppearance(localStorage.getItem(STORAGE_KEY))
  } catch {
    return readAppearance(null)
  }
}

function persist(appearance) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance))
  } catch {
    return
  }
}

function apply({ theme, moves, density }) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.dataset.moves = moves
  root.dataset.density = density
  for (const [name, value] of Object.entries(themeVars(theme, moves))) {
    root.style.setProperty(name, value)
  }
  root.style.setProperty('--sd-row-h', `${DENSITY[density].rowH}px`)
  root.style.setProperty('--sd-gap', `${DENSITY[density].gap}px`)
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark'
}

export function ThemeProvider({ children }) {
  const [appearance, setState] = useState(load)

  useLayoutEffect(() => {
    apply(appearance)
  }, [appearance])

  const setAppearance = useCallback((patch) => {
    setState((current) => {
      const next = readAppearance(JSON.stringify({ ...current, ...patch }))
      persist(next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ ...appearance, setAppearance }), [appearance, setAppearance])

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppearance() {
  const value = useContext(AppearanceContext)
  if (!value) throw new Error('useAppearance needs ThemeProvider')
  return value
}
