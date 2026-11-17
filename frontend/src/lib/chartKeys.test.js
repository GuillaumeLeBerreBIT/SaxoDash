import { describe, expect, it } from 'vitest'

import { chartKeyCommand } from './chartKeys'

const view = { hover: null, count: 100, slots: 120 }

describe('chartKeyCommand', () => {
  it('steps the reading from the latest bar, and stops at either end', () => {
    expect(chartKeyCommand({ key: 'ArrowLeft' }, view)).toEqual({ hover: 98 })
    expect(chartKeyCommand({ key: 'ArrowRight' }, view)).toEqual({ hover: 99 })
    expect(chartKeyCommand({ key: 'ArrowLeft' }, { ...view, hover: 0 })).toEqual({ hover: 0 })
    expect(chartKeyCommand({ key: 'Home' }, view)).toEqual({ hover: 0 })
    expect(chartKeyCommand({ key: 'End' }, { ...view, hover: 3 })).toEqual({ hover: 99 })
  })

  it('moves the window a quarter of its width with Shift, back in time to the left', () => {
    expect(chartKeyCommand({ key: 'ArrowLeft', shiftKey: true }, view)).toEqual({ pan: 30 })
    expect(chartKeyCommand({ key: 'ArrowRight', shiftKey: true }, view)).toEqual({ pan: -30 })
  })

  it('zooms, resets and clears', () => {
    expect(chartKeyCommand({ key: '+' }, view)).toEqual({ zoom: 96 })
    expect(chartKeyCommand({ key: '-' }, view)).toEqual({ zoom: 150 })
    expect(chartKeyCommand({ key: '0' }, view)).toEqual({ reset: true })
    expect(chartKeyCommand({ key: 'Escape' }, { ...view, hover: 5 })).toEqual({ hover: null })
  })

  it('ignores other keys and an empty chart', () => {
    expect(chartKeyCommand({ key: 'a' }, view)).toBeNull()
    expect(chartKeyCommand({ key: 'ArrowLeft' }, { ...view, count: 0 })).toBeNull()
  })
})
