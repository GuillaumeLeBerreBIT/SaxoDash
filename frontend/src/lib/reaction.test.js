import { describe, expect, it } from 'vitest'

import fixture from './fixtures/reaction-parity.json'
import { earningsMove } from './reaction'

describe('earningsMove', () => {
  it.each(fixture.cases)('matches research/reaction.py for $date $session', ({ date, session, pct, basis }) => {
    const expected = pct == null ? null : { pct, basis }
    expect(earningsMove(date, session, fixture.closes)).toEqual(expected)
  })
})
