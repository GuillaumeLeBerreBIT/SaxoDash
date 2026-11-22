import { describe, expect, it } from 'vitest'

import { pickedSector } from './sectors'

const sectors = [
  { sector: 'Energy', stocks: [{ ticker: 'XOM' }] },
  { sector: 'Utilities', stocks: [{ ticker: 'NEE' }] },
]

describe('pickedSector', () => {
  it('returns nothing before the sectors load', () => {
    expect(pickedSector(undefined, 'Energy', 'XOM')).toBeNull()
    expect(pickedSector([], 'Energy', 'XOM')).toBeNull()
  })

  it('prefers the requested sector', () => {
    expect(pickedSector(sectors, 'Utilities', 'XOM').sector).toBe('Utilities')
  })

  it('falls back to the sector of the followed symbol', () => {
    expect(pickedSector(sectors, null, 'NEE').sector).toBe('Utilities')
    expect(pickedSector(sectors, 'Nonsense', 'NEE').sector).toBe('Utilities')
  })

  it('falls back to the first sector when nothing else matches', () => {
    expect(pickedSector(sectors, null, 'AAPL').sector).toBe('Energy')
    expect(pickedSector(sectors, null, '').sector).toBe('Energy')
  })
})
