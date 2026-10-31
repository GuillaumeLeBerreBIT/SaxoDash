import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { DEFAULT_APPEARANCE, DENSITY, readAppearance, themeVars } from '../lib/theme.js'

const STORAGE_KEY = 'saxodash:appearance'

const AppearanceContext = createContext(null)

function tryStorage(action, fallback) {
  try {
    return action()
  } catch {
    return fallback
  }
}

function load() {
  return readAppearance(tryStorage(() => localStorage.getItem(STORAGE_KEY), null))
}

function persist(appearance) {
  tryStorage(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance)), null)
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

  useEffect(() => {
    persist(appearance)
  }, [appearance])

  const setAppearance = useCallback((patch) => {
    setState((current) => readAppearance(JSON.stringify({ ...current, ...patch })))
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

// eslint-disable-next-line react-refresh/only-export-components
export function useAppearanceOrDefault() {
  return useContext(AppearanceContext) ?? DEFAULT_APPEARANCE
}
