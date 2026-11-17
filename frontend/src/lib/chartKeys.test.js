import { describe, expect, it } from 'vitest'

import { annotationKeyCommand, chartKeyCommand, nudgePoint } from './chartKeys'

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

  it('places at the session being read, or the latest when nothing is read', () => {
    expect(chartKeyCommand({ key: 'Enter' }, { ...view, hover: 12 })).toEqual({ place: 12 })
    expect(chartKeyCommand({ key: 'Enter' }, view)).toEqual({ place: 99 })
  })
})

describe('annotationKeyCommand', () => {
  it('moves up and down in small steps, further with Shift', () => {
    expect(annotationKeyCommand({ key: 'ArrowUp' })).toEqual({ dy: -4 })
    expect(annotationKeyCommand({ key: 'ArrowDown', shiftKey: true })).toEqual({ dy: 20 })
  })

  it('moves through time only for something tied to a session', () => {
    expect(annotationKeyCommand({ key: 'ArrowLeft' })).toEqual({ dIndex: -1 })
    expect(annotationKeyCommand({ key: 'ArrowRight', shiftKey: true })).toEqual({ dIndex: 5 })
    expect(annotationKeyCommand({ key: 'ArrowLeft' }, { movesInTime: false })).toBeNull()
  })

  it('edits on Enter and leaves Delete to the selection', () => {
    expect(annotationKeyCommand({ key: 'Enter' })).toEqual({ edit: true })
    expect(annotationKeyCommand({ key: 'Delete' })).toBeNull()
  })
})

describe('nudgePoint', () => {
  it('keeps the session inside the bars', () => {
    expect(nudgePoint({ index: 0, y: 50 }, { dIndex: -1 }, 30)).toEqual({ index: 0, y: 50 })
    expect(nudgePoint({ index: 28, y: 50 }, { dIndex: 5, dy: 4 }, 30)).toEqual({ index: 29, y: 54 })
  })
})
