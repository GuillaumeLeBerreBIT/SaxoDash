import { describe, expect, it } from 'vitest'

import { COMPANY_DATA, TAB_GATE, companyDataStatus, listingCurrency, tabGate } from './companyData'

const stock = { uic: 211, assetType: 'Stock' }
const fund = { uic: 300, assetType: 'Etf' }

describe('listingCurrency', () => {
  it('prefers the held position, then the resolved instrument, then its details', () => {
    expect(listingCurrency({ position: { currency: 'EUR' }, instrument: { currency: 'USD' }, details: { currency: 'USD' } })).toBe('EUR')
    expect(listingCurrency({ instrument: { currency: 'GBP' }, details: { currency: 'USD' } })).toBe('GBP')
    expect(listingCurrency({ details: { currency: 'USD' } })).toBe('USD')
  })

  it('skips an empty currency instead of taking it as the answer', () => {
    expect(listingCurrency({ position: { currency: '' }, instrument: { currency: '' }, details: { currency: 'EUR' } })).toBe('EUR')
    expect(listingCurrency({})).toBeNull()
  })
})

describe('companyDataStatus', () => {
  it('waits while any lookup is in flight, whatever is already known', () => {
    expect(companyDataStatus({ lookingUp: true, instrument: stock, currency: 'USD' })).toBe(COMPANY_DATA.pending)
    expect(companyDataStatus({ lookingUp: true, instrument: null })).toBe(COMPANY_DATA.pending)
  })

  it('serves a stock priced in US dollars', () => {
    expect(companyDataStatus({ instrument: stock, currency: 'USD' })).toBe(COMPANY_DATA.eligible)
  })

  it('refuses a listing in another currency, since the bare ticker names a US company', () => {
    expect(companyDataStatus({ instrument: stock, currency: 'EUR' })).toBe(COMPANY_DATA.foreign)
    expect(companyDataStatus({ instrument: null, currency: 'GBP' })).toBe(COMPANY_DATA.foreign)
  })

  it('treats a fund in another currency as foreign first', () => {
    expect(companyDataStatus({ instrument: fund, currency: 'EUR' })).toBe(COMPANY_DATA.foreign)
  })

  it('treats a US-dollar fund, or one whose currency is unknown, as a fund', () => {
    expect(companyDataStatus({ instrument: fund, currency: 'USD' })).toBe(COMPANY_DATA.fund)
    expect(companyDataStatus({ instrument: fund, currency: null })).toBe(COMPANY_DATA.fund)
  })

  it('does not vouch for a resolved stock whose currency never arrived', () => {
    expect(companyDataStatus({ instrument: stock, currency: null })).toBe(COMPANY_DATA.unverified)
  })

  it('serves a ticker nobody could resolve, since nothing says it is not a US company', () => {
    expect(companyDataStatus({ instrument: null, currency: null })).toBe(COMPANY_DATA.eligible)
  })

  it('does not serve an unresolved ticker where an instrument is required', () => {
    expect(companyDataStatus({ instrument: null, currency: null, requireInstrument: true })).toBe(COMPANY_DATA.unverified)
  })
})

describe('tabGate', () => {
  const gates = (needs) => Object.fromEntries(Object.values(COMPANY_DATA).map((status) => [status, tabGate(needs, status)]))

  it('always shows a tab that needs nothing', () => {
    expect(new Set(Object.values(gates(undefined)))).toEqual(new Set([TAB_GATE.show]))
  })

  it('gates a company tab', () => {
    expect(gates('company')).toEqual({
      pending: TAB_GATE.pending,
      eligible: TAB_GATE.show,
      fund: TAB_GATE.hidden,
      foreign: TAB_GATE.hidden,
      unverified: TAB_GATE.refused,
    })
  })

  it('gates a tab that only looks a ticker up, which a US-dollar fund may use', () => {
    expect(gates('ticker')).toEqual({
      pending: TAB_GATE.pending,
      eligible: TAB_GATE.show,
      fund: TAB_GATE.show,
      foreign: TAB_GATE.refused,
      unverified: TAB_GATE.refused,
    })
  })
})
