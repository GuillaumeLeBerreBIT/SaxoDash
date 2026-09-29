import { describe, expect, it } from 'vitest'
import { CHART_LAYOUTS, activeAfterResize, gridStyle, layoutById, paneStyle, resizeSlots } from './chartLayouts'

const nvda = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }
const amd = { symbol: 'AMD', uic: 7, assetType: 'Stock' }
const tsla = { symbol: 'TSLA', uic: 9, assetType: 'Stock' }
const cells = (template) => template.split(' ').length

describe('CHART_LAYOUTS', () => {
  it('lists the five presets in menu order', () => {
    expect(CHART_LAYOUTS.map((preset) => [preset.id, preset.label])).toEqual([
      ['1', 'Single chart'],
      ['2h', 'Side by side'],
      ['2v', 'Stacked'],
      ['3', 'One large, two small'],
      ['4', 'Grid of four'],
    ])
  })

  it('gives every preset exactly one grid cell per pane', () => {
    for (const preset of CHART_LAYOUTS) {
      const spanned = preset.tallPane == null ? 0 : 1
      expect(cells(preset.columns) * cells(preset.rows) - spanned).toBe(preset.panes)
    }
  })
})

describe('layoutById', () => {
  it('finds a preset by id', () => {
    expect(layoutById('2v').panes).toBe(2)
  })

  it('falls back to a single chart for an unknown id', () => {
    expect(layoutById('9x9').id).toBe('1')
    expect(layoutById(undefined).id).toBe('1')
  })
})

describe('resizeSlots', () => {
  it('pads a grown layout with empty slots', () => {
    expect(resizeSlots([nvda], 3)).toEqual([nvda, null, null])
  })

  it('keeps the first slots when shrinking', () => {
    expect(resizeSlots([nvda, amd, tsla, null], 2)).toEqual([nvda, amd])
  })

  it('returns a new array', () => {
    const slots = [nvda]
    expect(resizeSlots(slots, 1)).not.toBe(slots)
  })
})

describe('activeAfterResize', () => {
  it('activates the first empty slot when the layout grows', () => {
    expect(activeAfterResize(0, 1, [nvda, null, null, null])).toBe(1)
  })

  it('prefers an already-empty slot over a new one', () => {
    expect(activeAfterResize(0, 2, [nvda, null, null, null])).toBe(1)
  })

  it('clamps the active slot when the layout shrinks past it', () => {
    expect(activeAfterResize(3, 4, [nvda, amd])).toBe(1)
  })

  it('keeps an active slot that survives the shrink', () => {
    expect(activeAfterResize(0, 4, [nvda, amd])).toBe(0)
  })
})

describe('gridStyle and paneStyle', () => {
  it('turns a preset into grid templates', () => {
    expect(gridStyle(layoutById('3'))).toEqual({ gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr' })
  })

  it('lets only the tall pane span both rows', () => {
    expect(paneStyle(layoutById('3'), 0)).toEqual({ gridRow: 'span 2' })
    expect(paneStyle(layoutById('3'), 1)).toBeUndefined()
    expect(paneStyle(layoutById('4'), 0)).toBeUndefined()
  })
})
