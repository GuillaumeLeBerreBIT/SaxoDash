import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'

import { describe, expect, it } from 'vitest'

const PALETTE_CLASS = /\b(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow)-(zinc|emerald|red|amber|blue|sky|green|rose|slate|gray)-\d{2,3}\b/
const HEX_LITERAL = /#[0-9a-fA-F]{6}\b/

const indexCss = readFileSync(join(cwd(), 'src/index.css'), 'utf8')

const sources = import.meta.glob(['../**/*.{js,jsx}', '!../**/*.test.{js,jsx}', '!../lib/theme.js', '!../**/fixtures/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const offences = (pattern) =>
  Object.entries(sources).flatMap(([path, text]) =>
    text.split('\n').flatMap((line, index) => (pattern.test(line) ? [`${path.replace(/^\.\.\//, 'src/')}:${index + 1}: ${line.trim()}`] : [])),
  )

describe('colour comes only from the theme', () => {
  it('scans the source tree', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50)
  })

  it('uses no Tailwind palette classes', () => {
    expect(offences(PALETTE_CLASS)).toEqual([])
  })

  it('uses no hex colour literals outside lib/theme.js', () => {
    expect(offences(HEX_LITERAL)).toEqual([])
  })

  it('reads index.css', () => {
    expect(indexCss).toMatch(/@import/)
  })

  it('keeps index.css on theme variables', () => {
    expect(indexCss.split('\n').filter((line) => HEX_LITERAL.test(line))).toEqual([])
  })

  it('no longer bridges Tailwind palettes onto the theme', () => {
    expect(indexCss).not.toMatch(/bridge\.css/)
  })
})
