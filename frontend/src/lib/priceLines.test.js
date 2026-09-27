import { describe, expect, it } from 'vitest'

import { CATEGORY_AXIS_TEXT, NEGATIVE, POSITIVE } from './charts'
import {
  LINE_STROKES,
  MIN_PRICE,
  chartLines,
  edgeOf,
  isTypingTarget,
  linePatch,
  parsePriceInput,
  roundPrice,
} from './priceLines'

describe('chartLines', () => {
  it('turns the decimal strings DRF sends into numbers', () => {
    const lines = chartLines(
      { target_price: '250.00', stop_price: '180.50' },
      [{ id: 7, price: '95.25' }],
    )

    expect(lines).toEqual([
      { id: 'target', kind: 'target', price: 250 },
      { id: 'stop', kind: 'stop', price: 180.5 },
      { id: 7, kind: 'free', price: 95.25 },
    ])
  })

  it('draws no line for a missing or empty level', () => {
    expect(chartLines({ target_price: null, stop_price: '' })).toEqual([])
    expect(chartLines(undefined)).toEqual([])
  })

  it('drops a level that is not a positive number', () => {
    expect(chartLines({ target_price: '0.00', stop_price: 'abc' }, [{ id: 1, price: '-2' }])).toEqual([])
  })
})

describe('roundPrice', () => {
  it('rounds to cents', () => {
    expect(roundPrice(123.456)).toBe(123.46)
  })

  it('never goes below the minimum price', () => {
    expect(roundPrice(0)).toBe(MIN_PRICE)
    expect(roundPrice(-40)).toBe(MIN_PRICE)
    expect(roundPrice(0.001)).toBe(MIN_PRICE)
  })
})

describe('parsePriceInput', () => {
  it('reads a plain or decimal number', () => {
    expect(parsePriceInput('112')).toBe(112)
    expect(parsePriceInput(' 112.5 ')).toBe(112.5)
    expect(parsePriceInput('.5')).toBe(0.5)
    expect(parsePriceInput('99.999')).toBe(100)
  })

  it('rejects anything that is not a positive number', () => {
    for (const text of ['', '   ', 'abc', '12,5', '-3', '0', '0.00', '1e3', '12.3.4']) {
      expect(parsePriceInput(text)).toBeNull()
    }
  })
})

describe('edgeOf', () => {
  const geometry = { top: 120, bottom: 80 }

  it('places a price above, below or inside the visible range', () => {
    expect(edgeOf(130, geometry)).toBe('above')
    expect(edgeOf(70, geometry)).toBe('below')
    expect(edgeOf(100, geometry)).toBeNull()
  })
})

describe('isTypingTarget', () => {
  it('is true for fields the user types into', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true)
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true)
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    expect(isTypingTarget(editable)).toBe(true)
  })

  it('is false for everything else', () => {
    expect(isTypingTarget(document.body)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('linePatch', () => {
  it('writes the thesis field that owns the line', () => {
    expect(linePatch({ id: 'target', kind: 'target', price: 1 }, 250)).toEqual({ target_price: '250.00' })
    expect(linePatch({ id: 'stop', kind: 'stop', price: 1 }, 180.456)).toEqual({ stop_price: '180.46' })
  })

  it('has nothing to patch for a freeform line', () => {
    expect(linePatch({ id: 7, kind: 'free', price: 1 }, 10)).toBeNull()
  })
})

describe('LINE_STROKES', () => {
  it('uses the app colours for each kind of line', () => {
    expect(LINE_STROKES).toEqual({ target: POSITIVE, stop: NEGATIVE, free: CATEGORY_AXIS_TEXT })
  })
})
