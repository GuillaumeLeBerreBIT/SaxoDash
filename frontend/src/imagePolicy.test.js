import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'

import { instrumentLogoUrl } from './lib/logos'

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const policy = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? ''
const directives = Object.fromEntries(policy.split(';').map((part) => part.trim().split(/\s+/)).filter((part) => part[0]).map(([name, ...values]) => [name, values]))

const allows = (url) => {
  const { protocol, hostname } = new URL(url)
  return (directives['img-src'] ?? []).some((source) => {
    if (source === `${protocol}//${hostname}`) return true
    return source.startsWith(`${protocol}//*.`) && hostname.endsWith(source.slice(`${protocol}//*`.length))
  })
}

describe('image policy', () => {
  it('restricts images only, leaving scripts, styles and API calls alone', () => {
    expect(Object.keys(directives)).toEqual(['img-src'])
  })

  it('allows the app itself and inline images', () => {
    expect(directives['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']))
  })

  it.each([
    ['stock logos', instrumentLogoUrl('AAPL')],
    ['investor photos', 'https://commons.wikimedia.org/wiki/Special:FilePath/Prem%20Watsa.jpg?width=160'],
    ['the photo thumbnail Commons redirects to', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/x.jpg/160px-x.jpg'],
    ['firm logos', 'https://www.google.com/s2/favicons?domain=scionasset.com&sz=128'],
    ['the icon Google redirects to', 'https://t2.gstatic.com/faviconV2?url=https://scionasset.com'],
    ['Congress photos', 'https://unitedstates.github.io/images/congress/225x275/P000197.jpg'],
  ])('allows %s', (_, url) => {
    expect(allows(url)).toBe(true)
  })

  it('refuses any other host', () => {
    expect(allows('https://tracker.example.com/pixel.gif')).toBe(false)
  })
})
