import { describe, expect, it } from 'vitest'
import {
  DEFAULT_APPEARANCE,
  DENSITY,
  MOVES,
  ROLES,
  THEMES,
  contrastRatio,
  readAppearance,
  themeVars,
} from './theme'

describe('theme tokens', () => {
  it.each(Object.keys(THEMES))('every theme defines every role: %s', (t) => {
    expect(Object.keys(THEMES[t]).sort()).toEqual([...ROLES].sort())
  })

  it("values are DESIGN.md's", () => {
    expect(THEMES.republic.pane).toBe('#12100E')
    expect(THEMES.republic.ink3).toBe('#7E7B78')
    expect(THEMES.republic.up).toBe('#5BC860')
    expect(THEMES.republic.down).toBe('#EB503F')
    expect(THEMES.blue.accent).toBe('#7FB2FF')
    expect(THEMES.light.accent).toBe('#1F5FD1')
    expect(THEMES.blue.s1).toBe('#3987e5')
    expect(THEMES.light.s1).toBe('#2a78d6')
    expect(THEMES.light.heatU3).toBe('#6FBF8E')
  })

  it.each(Object.keys(THEMES))('faint text passes AA on the pane: %s', (t) => {
    expect(contrastRatio(THEMES[t].ink3, THEMES[t].pane)).toBeGreaterThanOrEqual(4.5)
  })

  it('maps role keys to css variables mechanically', () => {
    const vars = themeVars('republic', 'green-red')
    expect(vars['--sd-pane']).toBe('#12100E')
    expect(vars['--sd-page-top']).toBe('#25211C')
    expect(vars['--sd-ink-2']).toBe('#929191')
    expect(vars['--sd-up-subtle']).toBe('#1E2E1A')
    expect(vars['--sd-line-input']).toBe('#6B6865')
    expect(vars['--sd-primary-line']).toBe('#FFFFFF')
    expect(vars['--sd-heat-d3']).toBe('#3D1C19')
    expect(vars['--sd-heat-0']).toBe('#171512')
    expect(vars['--sd-on-accent']).toBe('#12100E')
    expect(vars['--sd-s1']).toBe('#3987e5')
    expect(Object.keys(vars)).toHaveLength(ROLES.length)
  })

  it('cvd swaps gain and loss', () => {
    expect(themeVars('republic', 'cvd')['--sd-up']).toBe('#4C9AFF')
    expect(themeVars('blue', 'cvd')['--sd-down']).toBe('#FF9A3C')
    expect(themeVars('light', 'cvd')['--sd-down']).toBe('#C2570C')
    expect(themeVars('light', 'cvd')['--sd-heat-u3']).toBe('#6E97E2')
  })

  it('cvd leaves the neutral heat step and flat alone', () => {
    expect(themeVars('republic', 'cvd')['--sd-heat-0']).toBe(THEMES.republic.heat0)
    expect(themeVars('blue', 'cvd')['--sd-flat']).toBe(THEMES.blue.flat)
    expect(Object.keys(MOVES.cvd.dark)).not.toContain('heat0')
  })

  it('exposes density steps', () => {
    expect(DENSITY).toEqual({
      comfortable: { rowH: 46, gap: 12 },
      compact: { rowH: 38, gap: 8 },
    })
  })

  it('contrastRatio matches WCAG extremes', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
  })
})

describe('readAppearance', () => {
  it('falls back', () => {
    expect(readAppearance(null)).toEqual(DEFAULT_APPEARANCE)
    expect(readAppearance('not json')).toEqual(DEFAULT_APPEARANCE)
    expect(readAppearance('{"theme":"neon","moves":"x","density":9}')).toEqual(DEFAULT_APPEARANCE)
    expect(DEFAULT_APPEARANCE).toEqual({ theme: 'republic', moves: 'green-red', density: 'comfortable' })
  })

  it('keeps valid fields', () => {
    expect(readAppearance('{"theme":"blue"}')).toEqual({
      theme: 'blue',
      moves: 'green-red',
      density: 'comfortable',
    })
  })
})
