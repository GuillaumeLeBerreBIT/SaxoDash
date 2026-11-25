import { useMemo } from 'react'
import { chartPalette } from '../lib/charts.js'
import { useAppearanceOrDefault } from './ThemeProvider.jsx'

export function useChartColors() {
  const { theme, moves, cheapBand, expensiveBand } = useAppearanceOrDefault()
  return useMemo(() => chartPalette({ theme, moves, cheapBand, expensiveBand }), [theme, moves, cheapBand, expensiveBand])
}
