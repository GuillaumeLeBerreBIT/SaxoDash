const ELBSTREAM_BASE = 'https://api.elbstream.com/logos'

/** Elbstream indexes some European UCITS ETFs by ISIN only, not by their
 *  exchange ticker - confirmed by hand for each entry below (its symbol
 *  404s, its ISIN doesn't). Saxo won't give us the ISIN (see AGENTS.md), but
 *  a fund's ISIN is public and permanent, so hardcoding it here is safe.
 *  Add an entry only once you've confirmed the bare symbol actually 404s -
 *  most US-listed stocks and ETFs resolve by symbol just fine. */
const FUND_ISIN_OVERRIDES = {
  IWDA: 'IE00B4L5Y983', // iShares Core MSCI World UCITS ETF
  VWCE: 'IE00BK5BQT80', // Vanguard FTSE All-World UCITS ETF
  VUSA: 'IE00B3XXRP09', // Vanguard S&P 500 UCITS ETF
}

/** A free, no-key logo lookup (elbstream.com) - works for both a stock and
 *  an ETF, since a fund's "logo" is its issuer's mark. Keyed by ticker
 *  symbol by default, since that's the one identifier every Saxo instrument
 *  already carries; FUND_ISIN_OVERRIDES routes the known exceptions to the
 *  ISIN endpoint instead. Free tier requires attribution, credited once in
 *  the sidebar footer rather than wherever a logo happens to render. */
export function instrumentLogoUrl(symbol) {
  if (!symbol) return null
  const isin = FUND_ISIN_OVERRIDES[symbol.toUpperCase()]
  return isin ? `${ELBSTREAM_BASE}/isin/${isin}` : `${ELBSTREAM_BASE}/symbol/${symbol}`
}
