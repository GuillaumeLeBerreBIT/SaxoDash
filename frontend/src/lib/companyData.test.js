import { describe, expect, it } from 'vitest'

import { COMPANY_DATA, companyDataStatus, listingCurrency } from './companyData'

const stock = { uic: 211, assetType: 'Stock' }
const fund = { uic: 300, assetType: 'Etf' }

describe('listingCurrency', () => {
  it('prefers the held position, then the instrument details', () => {
    expect(listingCurrency({ position: { currency: 'EUR' }, details: { currency: 'USD' } })).toBe('EUR')
    expect(listingCurrency({ position: null, details: { currency: 'USD' } })).toBe('USD')
    expect(listingCurrency({})).toBeNull()
  })
})

describe('companyDataStatus', () => {
  it('waits while the instrument is still being looked up', () => {
    expect(companyDataStatus({ resolution: 'resolving', instrument: null })).toBe(COMPANY_DATA.pending)
  })

  it('treats a fund as having no company data, whatever its currency', () => {
    expect(companyDataStatus({ resolution: 'resolved', instrument: fund, currency: 'USD' })).toBe(COMPANY_DATA.fund)
  })

  it('serves a listing priced in US dollars', () => {
    expect(companyDataStatus({ resolution: 'resolved', instrument: stock, currency: 'USD' })).toBe(COMPANY_DATA.eligible)
  })

  it('refuses a listing in another currency, since the bare ticker names a US company', () => {
    expect(companyDataStatus({ resolution: 'resolved', instrument: stock, currency: 'EUR' })).toBe(COMPANY_DATA.foreign)
    expect(companyDataStatus({ resolution: 'unresolved', instrument: null, currency: 'GBP' })).toBe(COMPANY_DATA.foreign)
  })

  it('waits for the currency of a resolved instrument whose details are still loading', () => {
    expect(companyDataStatus({ resolution: 'resolved', instrument: stock, currency: null, detailsLoading: true })).toBe(
      COMPANY_DATA.pending,
    )
  })

  it('serves a symbol nobody could resolve, since nothing says it is not a US company', () => {
    expect(companyDataStatus({ resolution: 'unresolved', instrument: null, currency: null })).toBe(COMPANY_DATA.eligible)
  })

  it('serves a resolved instrument whose details never arrived', () => {
    expect(companyDataStatus({ resolution: 'resolved', instrument: stock, currency: null, detailsLoading: false })).toBe(
      COMPANY_DATA.eligible,
    )
  })

  it('assumes a resolved instrument when no resolution is given', () => {
    expect(companyDataStatus({ instrument: stock, currency: 'USD' })).toBe(COMPANY_DATA.eligible)
  })
})
