import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { ThemeProvider, useAppearance } from './ThemeProvider.jsx'

const KEY = 'saxodash:appearance'
const root = document.documentElement

const probe = {}
function Probe() {
  const appearance = useAppearance()
  useEffect(() => {
    probe.current = appearance
  })
  return null
}

function mount() {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    root.removeAttribute('style')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies stored appearance', () => {
    localStorage.setItem(KEY, '{"theme":"light","moves":"cvd"}')
    mount()
    expect(root.dataset.theme).toBe('light')
    expect(root.dataset.moves).toBe('cvd')
    expect(root.style.getPropertyValue('--sd-up')).toBe('#1F5FD1')
    expect(root.style.colorScheme).toBe('light')
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    mount()
    expect(root.dataset.theme).toBe('republic')
    expect(root.style.colorScheme).toBe('dark')
  })

  it('setAppearance persists and re-applies', () => {
    mount()
    act(() => probe.current.setAppearance({ theme: 'blue' }))
    expect(localStorage.getItem(KEY)).toContain('"theme":"blue"')
    expect(root.style.getPropertyValue('--sd-accent')).toBe('#7FB2FF')
  })

  it('still applies a change when storage refuses writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    mount()
    act(() => probe.current.setAppearance({ theme: 'blue' }))
    expect(root.dataset.theme).toBe('blue')
    expect(root.style.getPropertyValue('--sd-accent')).toBe('#7FB2FF')
  })

  it('writes density sizes', () => {
    mount()
    expect(root.style.getPropertyValue('--sd-row-h')).toBe('46px')
    act(() => probe.current.setAppearance({ density: 'compact' }))
    expect(root.dataset.density).toBe('compact')
    expect(root.style.getPropertyValue('--sd-row-h')).toBe('38px')
    expect(root.style.getPropertyValue('--sd-gap')).toBe('8px')
  })
})
