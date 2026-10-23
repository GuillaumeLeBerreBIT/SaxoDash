import { describe, expect, it } from 'vitest'

import { companyDataStatus } from './companyData'
import cases from './fixtures/company-data-parity.json'

describe('company data parity fixture', () => {
  it.each(cases)('$name', ({ instrument, currency, expected }) => {
    expect(companyDataStatus({ instrument, currency })).toBe(expected)
  })
})
