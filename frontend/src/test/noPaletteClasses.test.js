import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cwd } from 'node:process'

import { describe, expect, it } from 'vitest'

const FAMILIES = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const PREFIXES = 'bg|text|border|ring|ring-offset|fill|stroke|from|via|to|divide|outline|shadow|placeholder|accent|caret|decoration'
const PALETTE_CLASS = new RegExp(`\\b(${PREFIXES})-(${FAMILIES})-\\d{2,3}\\b`)
const FIXED_COLOUR_CLASS = new RegExp(`\\b(${PREFIXES})-(white|black)\\b`)
const HEX_LITERAL = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/
const RGB_LITERAL = /\brgba?\(/

const ALLOWED = [
  { file: 'src/components/ui.jsx', token: 'bg-white', why: 'instrument logo disc must stay white so a logo reads on every theme' },
  { file: 'src/components/investors/InvestorAvatar.jsx', token: 'bg-white', why: 'firm logo disc must stay white so a favicon reads on every theme' },
  { file: 'src/lib/charts.js', token: 'rgba(', why: 'withAlpha composes an rgba string from a theme hex' },
]

const indexCss = readFileSync(join(cwd(), 'src/index.css'), 'utf8')

const sources = import.meta.glob(['../**/*.{js,jsx}', '!../**/*.test.{js,jsx}', '!../lib/theme.js', '!../**/fixtures/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const allowed = (file, line) => ALLOWED.some((entry) => entry.file === file && line.includes(entry.token))

const offences = (pattern) =>
  Object.entries(sources).flatMap(([path, text]) => {
    const file = path.replace(/^\.\.\//, 'src/')
    return text.split('\n').flatMap((line, index) =>
      pattern.test(line) && !allowed(file, line) ? [`${file}:${index + 1}: ${line.trim()}`] : [],
    )
  })

describe('colour comes only from the theme', () => {
  it('scans the source tree', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50)
  })

  it('uses no Tailwind palette classes', () => {
    expect(offences(PALETTE_CLASS)).toEqual([])
  })

  it('uses no fixed white or black classes outside the named allow-list', () => {
    expect(offences(FIXED_COLOUR_CLASS)).toEqual([])
  })

  it('uses no hex colour literals outside lib/theme.js', () => {
    expect(offences(HEX_LITERAL)).toEqual([])
  })

  it('uses no rgb or rgba literals outside the named allow-list', () => {
    expect(offences(RGB_LITERAL)).toEqual([])
  })

  it('keeps every allow-list entry pointing at a line that still exists', () => {
    for (const entry of ALLOWED) {
      const text = sources[`../${entry.file.replace(/^src\//, '')}`]
      expect(text, entry.file).toContain(entry.token)
    }
  })

  it('reads index.css', () => {
    expect(indexCss).toMatch(/@import/)
  })

  it('keeps index.css on theme variables', () => {
    const lines = indexCss.split('\n')
    expect(lines.filter((line) => HEX_LITERAL.test(line))).toEqual([])
    expect(lines.filter((line) => RGB_LITERAL.test(line))).toEqual([])
  })

  it('no longer bridges Tailwind palettes onto the theme', () => {
    expect(indexCss).not.toMatch(/bridge\.css/)
  })
})
