import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider, useAppearance } from './ThemeProvider.jsx'
import { useChartColors } from './useChartColors.js'

function Probe() {
  const c = useChartColors()
  const { setAppearance } = useAppearance()
  return (
    <div>
      <span data-testid="primary">{c.primary}</span>
      <button onClick={() => setAppearance({ theme: 'blue' })}>blue</button>
    </div>
  )
}

describe('useChartColors', () => {
  beforeEach(() => localStorage.clear())

  it('re-renders on theme change without remounting', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    const node = screen.getByTestId('primary')
    expect(node.textContent).toBe('#FFFFFF')
    act(() => screen.getByText('blue').click())
    expect(screen.getByTestId('primary')).toBe(node)
    expect(node.textContent).toBe('#7FB2FF')
  })
})
