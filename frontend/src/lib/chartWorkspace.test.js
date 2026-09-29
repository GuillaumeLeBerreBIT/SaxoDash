import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readWorkspace, sameSlot, sanitizeWorkspace, withActiveSlot, writeWorkspace } from './chartWorkspace'

const nvda = { symbol: 'NVDA', uic: 211, assetType: 'Stock' }
const amd = { symbol: 'AMD', uic: 7, assetType: 'Stock' }
const DEFAULTS = { layout: '1', slots: [null], active: 0 }

describe('sanitizeWorkspace', () => {
  it('defaults to one empty pane', () => {
    expect(sanitizeWorkspace(null)).toEqual(DEFAULTS)
    expect(sanitizeWorkspace('garbage')).toEqual(DEFAULTS)
  })

  it('falls back to a single chart for an unknown layout', () => {
    expect(sanitizeWorkspace({ layout: '7', slots: [nvda, amd], active: 1 })).toEqual({
      layout: '1',
      slots: [nvda],
      active: 0,
    })
  })

  it('fits the slots to the layout', () => {
    expect(sanitizeWorkspace({ layout: '4', slots: [nvda], active: 0 }).slots).toEqual([nvda, null, null, null])
    expect(sanitizeWorkspace({ layout: '2h', slots: [nvda, amd, nvda], active: 0 }).slots).toEqual([nvda, amd])
  })

  it('empties a malformed slot and drops a non-integer uic', () => {
    const { slots } = sanitizeWorkspace({
      layout: '2h',
      slots: [{ symbol: '' }, { symbol: 'AMD', uic: '7', assetType: 5 }],
      active: 0,
    })
    expect(slots).toEqual([null, { symbol: 'AMD', uic: null, assetType: null }])
  })

  it('resets an active index outside the layout', () => {
    expect(sanitizeWorkspace({ layout: '2h', slots: [nvda, amd], active: 3 }).active).toBe(0)
    expect(sanitizeWorkspace({ layout: '2h', slots: [nvda, amd], active: -1 }).active).toBe(0)
  })
})

describe('readWorkspace and writeWorkspace', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('round-trips a workspace', () => {
    const workspace = { layout: '2v', slots: [nvda, amd], active: 1 }
    expect(writeWorkspace(workspace)).toBe(true)
    expect(readWorkspace()).toEqual(workspace)
  })

  it('reads the defaults when nothing is stored', () => {
    expect(readWorkspace()).toEqual(DEFAULTS)
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readWorkspace()).toEqual(DEFAULTS)
    expect(writeWorkspace(DEFAULTS)).toBe(false)
  })
})

describe('withActiveSlot', () => {
  const workspace = { layout: '2h', slots: [nvda, null], active: 1 }

  it('puts the slot into the active pane', () => {
    expect(withActiveSlot(workspace, amd)).toEqual({ layout: '2h', slots: [nvda, amd], active: 1 })
  })

  it('returns the same workspace when the active pane already holds it', () => {
    const filled = { layout: '2h', slots: [nvda, amd], active: 1 }
    expect(withActiveSlot(filled, { ...amd })).toBe(filled)
  })
})

describe('sameSlot', () => {
  it('compares symbol, uic and asset type', () => {
    expect(sameSlot(nvda, { ...nvda })).toBe(true)
    expect(sameSlot(nvda, { ...nvda, assetType: 'Cfd' })).toBe(false)
    expect(sameSlot(null, nvda)).toBe(false)
  })
})
