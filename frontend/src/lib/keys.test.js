import { describe, expect, it } from 'vitest'
import { activatesRow } from './keys'

describe('activatesRow', () => {
  it('treats Enter and Space as activation, like a button', () => {
    expect(activatesRow({ key: 'Enter' })).toBe(true)
    expect(activatesRow({ key: ' ' })).toBe(true)
    expect(activatesRow({ key: 'a' })).toBe(false)
    expect(activatesRow({ key: 'Escape' })).toBe(false)
  })
})
