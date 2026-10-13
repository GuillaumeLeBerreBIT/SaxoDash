import { describe, expect, it } from 'vitest'

import { secUrl } from './secLinks'

describe('secUrl', () => {
  it('keeps an https www.sec.gov address', () => {
    const url = 'https://www.sec.gov/Archives/edgar/data/1/x.htm'
    expect(secUrl(url)).toBe(url)
  })

  it.each([
    'http://www.sec.gov/x',
    'https://evil.example/https://www.sec.gov/',
    'javascript:alert(1)',
    '',
    null,
    undefined,
    42,
  ])('rejects %s', (value) => {
    expect(secUrl(value)).toBeNull()
  })
})
