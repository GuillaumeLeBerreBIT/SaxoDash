import { describe, expect, it } from 'vitest'

import fixture from './fixtures/indicator-parity.json'
import { relativeVolume, rsi, sma } from './indicators'

const closes = fixture.bars.map((bar) => bar.close)

describe('indicator parity fixture', () => {
  it('still matches indicators.js, so the Python side is checked against live definitions', () => {
    expect(sma(closes, 50)).toEqual(fixture.expected.sma50)
    expect(sma(closes, 200)).toEqual(fixture.expected.sma200)
    expect(rsi(closes, 14)).toEqual(fixture.expected.rsi14)
    expect(relativeVolume(fixture.bars, 20)).toEqual(fixture.expected.rvol)
  })
})
