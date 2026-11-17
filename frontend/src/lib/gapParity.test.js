import { describe, expect, it } from 'vitest'

import fixture from './fixtures/gap-parity.json'
import { volumeGaps } from './indicators'

describe('gap parity fixture', () => {
  it('finds the same gaps as the Signal Lab definitions', () => {
    const gaps = volumeGaps(fixture.bars)

    expect(gaps.filter((gap) => gap.up).map((gap) => gap.index)).toEqual(fixture.expected.gap_up)
    expect(gaps.filter((gap) => !gap.up).map((gap) => gap.index)).toEqual(fixture.expected.gap_down)
  })
})
