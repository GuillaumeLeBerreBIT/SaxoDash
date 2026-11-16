import { describe, expect, it } from 'vitest'

import { copySentence } from './copySentence'

const copy = { available: true, benchmark: 'S&P 500', since: '2021-02-15', clone_return_pct: 80, benchmark_return_pct: 50, excess_return_pct: 30 }

describe('copySentence', () => {
  it('says what copying returned and how it compares with the index', () => {
    expect(copySentence(copy, 'Nancy Pelosi')).toBe(
      'If you had copied Nancy Pelosi since Feb 2021 you would be up 80.0%, 30.0 points ahead of the S&P 500 (+50.0%).',
    )
  })

  it('says down and behind', () => {
    expect(copySentence({ ...copy, clone_return_pct: -12.5, benchmark_return_pct: 50, excess_return_pct: -62.5 }, 'A B')).toBe(
      'If you had copied A B since Feb 2021 you would be down 12.5%, 62.5 points behind the S&P 500 (+50.0%).',
    )
  })

  it('says in line when the gap rounds to nothing', () => {
    expect(copySentence({ ...copy, clone_return_pct: 50.01, excess_return_pct: 0.01 }, 'A B')).toBe(
      'If you had copied A B since Feb 2021 you would be up 50.0%, in line with the S&P 500 (+50.0%).',
    )
  })

  it('says so when the copy could not be measured', () => {
    expect(copySentence({ available: false }, 'A B')).toBe('Too few priced trades to say what copying A B would have returned.')
    expect(copySentence(undefined, 'A B')).toBe('Too few priced trades to say what copying A B would have returned.')
  })
})
