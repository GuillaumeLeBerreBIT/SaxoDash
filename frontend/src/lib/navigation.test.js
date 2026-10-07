import { describe, expect, it } from 'vitest'
import { PAGE_COMMANDS } from './commands'
import { MOBILE_PRIMARY, NAV_ITEMS, mobileOverflow } from './navigation'

describe('mobile navigation split', () => {
  it('keeps the four primary destinations in tab order', () => {
    expect(MOBILE_PRIMARY).toEqual(['/', '/portfolio', '/research', '/spending'])
  })
  it('puts every other destination in the overflow, each exactly once', () => {
    const overflow = mobileOverflow().map((item) => item.to)
    const primary = NAV_ITEMS.filter((item) => MOBILE_PRIMARY.includes(item.to)).map((item) => item.to)
    expect([...primary, ...overflow].sort()).toEqual(NAV_ITEMS.map((item) => item.to).sort())
    expect(overflow).not.toContain('/portfolio')
  })
})

describe('navigation', () => {
  it('offers every sidebar destination in the palette, in the same order', () => {
    expect(PAGE_COMMANDS.map((c) => c.to)).toEqual(NAV_ITEMS.map((i) => i.to))
    expect(PAGE_COMMANDS.map((c) => c.label)).toEqual(NAV_ITEMS.map((i) => i.label))
  })

  it('includes Discover, Investors and Spending', () => {
    const labels = PAGE_COMMANDS.map((c) => c.label)
    expect(labels).toContain('Discover')
    expect(labels).toContain('Investors')
    expect(labels).toContain('Spending')
  })
})
