import { useMemo } from 'react'
import { chartPalette } from '../lib/charts.js'
import { useAppearanceOrDefault } from './ThemeProvider.jsx'

export function useChartColors() {
  const { theme, moves } = useAppearanceOrDefault()
  return useMemo(() => chartPalette({ theme, moves }), [theme, moves])
}
