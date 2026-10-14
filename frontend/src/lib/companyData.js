import { isEtf } from './research'

const COMPANY_DATA_CURRENCY = 'USD'

export const COMPANY_DATA = {
  pending: 'pending',
  eligible: 'eligible',
  fund: 'fund',
  foreign: 'foreign',
  unverified: 'unverified',
}

export const TAB_GATE = {
  show: 'show',
  pending: 'pending',
  hidden: 'hidden',
  refused: 'refused',
}

export function listingCurrency({ position, instrument, details } = {}) {
  return position?.currency || instrument?.currency || details?.currency || null
}

export function companyDataStatus({ instrument, currency, lookingUp = false, requireInstrument = false }) {
  if (lookingUp) return COMPANY_DATA.pending
  if (currency && currency !== COMPANY_DATA_CURRENCY) return COMPANY_DATA.foreign
  if (isEtf(instrument)) return COMPANY_DATA.fund
  if (currency) return COMPANY_DATA.eligible
  if (instrument || requireInstrument) return COMPANY_DATA.unverified
  return COMPANY_DATA.eligible
}

const GATES = {
  company: {
    [COMPANY_DATA.eligible]: TAB_GATE.show,
    [COMPANY_DATA.fund]: TAB_GATE.hidden,
    [COMPANY_DATA.foreign]: TAB_GATE.hidden,
    [COMPANY_DATA.unverified]: TAB_GATE.refused,
  },
  ticker: {
    [COMPANY_DATA.eligible]: TAB_GATE.show,
    [COMPANY_DATA.fund]: TAB_GATE.show,
    [COMPANY_DATA.foreign]: TAB_GATE.refused,
    [COMPANY_DATA.unverified]: TAB_GATE.refused,
  },
}

export function tabGate(needs, status) {
  if (!needs) return TAB_GATE.show
  if (status === COMPANY_DATA.pending) return TAB_GATE.pending
  return GATES[needs][status]
}
