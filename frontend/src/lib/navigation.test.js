import { describe, expect, it } from 'vitest'

import { PAGE_COMMANDS } from './commands'
import { NAV_ITEMS } from './navigation'

describe('navigation', () => {
  it('offers every sidebar destination in the palette, in the same order', () => {
    expect(PAGE_COMMANDS.map((c) => c.to)).toEqual(NAV_ITEMS.map((i) => i.to))
    expect(PAGE_COMMANDS.map((c) => c.label)).toEqual(NAV_ITEMS.map((i) => i.label))
  })

  it('includes Discover and Spending', () => {
    const labels = PAGE_COMMANDS.map((c) => c.label)
    expect(labels).toContain('Discover')
    expect(labels).toContain('Spending')
  })
})
