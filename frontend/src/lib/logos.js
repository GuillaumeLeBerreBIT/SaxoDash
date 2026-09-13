const ELBSTREAM_BASE = 'https://api.elbstream.com/logos/symbol'

/** A free, no-key logo lookup by ticker symbol (elbstream.com) - works for
 *  both a stock and an ETF, since a fund's "logo" is its issuer's mark.
 *  Deliberately not ISIN-keyed: Saxo's OpenAPI does not distribute ISINs at
 *  all (a licensing restriction, confirmed via Saxo's own support docs) -
 *  the symbol is the one identifier every instrument already carries.
 *  Free tier requires attribution, credited once in the sidebar footer
 *  rather than wherever a logo happens to render. */
export function instrumentLogoUrl(symbol) {
  return symbol ? `${ELBSTREAM_BASE}/${symbol}` : null
}
