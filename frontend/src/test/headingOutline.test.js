import { describe, expect, it } from 'vitest'

import { expectValidHeadingOutline } from './headingOutline'

const outlineOf = (html) => {
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('expectValidHeadingOutline', () => {
  it('accepts h1 then h2, h3 and back to h2', () => {
    expect(() => expectValidHeadingOutline(outlineOf('<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>'))).not.toThrow()
  })

  it('rejects a skipped level', () => {
    expect(() => expectValidHeadingOutline(outlineOf('<h1>a</h1><h3>b</h3>'))).toThrow()
  })

  it('rejects an outline whose first heading is not an h1', () => {
    expect(() => expectValidHeadingOutline(outlineOf('<h2>a</h2>'))).toThrow()
  })

  it('rejects two h1s', () => {
    expect(() => expectValidHeadingOutline(outlineOf('<h1>a</h1><h1>b</h1>'))).toThrow()
  })
})
