const ELBSTREAM_BASE = 'https://api.elbstream.com/logos/isin'

/** A free, no-key logo lookup by ISIN (elbstream.com) - works for both a
 *  stock and an ETF, since a fund's "logo" is its issuer's mark. Free tier
 *  requires attribution, credited once in the sidebar footer rather than
 *  wherever a logo happens to render. */
export function instrumentLogoUrl(isin) {
  return isin ? `${ELBSTREAM_BASE}/${isin}` : null
}
