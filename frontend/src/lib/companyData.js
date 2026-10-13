import { isEtf } from './research'

const COMPANY_DATA_CURRENCY = 'USD'

export const COMPANY_DATA = {
  pending: 'pending',
  eligible: 'eligible',
  fund: 'fund',
  foreign: 'foreign',
}

export const RESOLUTION = {
  resolving: 'resolving',
  resolved: 'resolved',
  unresolved: 'unresolved',
}

export function listingCurrency({ position, details } = {}) {
  return position?.currency ?? details?.currency ?? null
}

export function companyDataStatus({ resolution, instrument, currency, detailsLoading = false }) {
  if (resolution === RESOLUTION.resolving) return COMPANY_DATA.pending
  if (isEtf(instrument)) return COMPANY_DATA.fund
  if (currency) return currency === COMPANY_DATA_CURRENCY ? COMPANY_DATA.eligible : COMPANY_DATA.foreign
  if (instrument && detailsLoading) return COMPANY_DATA.pending
  return COMPANY_DATA.eligible
}
