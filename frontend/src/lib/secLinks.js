const SEC_PREFIX = 'https://www.sec.gov/'

export const secUrl = (value) => (typeof value === 'string' && value.startsWith(SEC_PREFIX) ? value : null)
