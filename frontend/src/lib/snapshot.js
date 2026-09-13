/** Rule-based one-line reads for the Research Investment Snapshot. Pure and
 *  tested in isolation; the component only renders what these return. Thresholds
 *  are named here so the InfoTip copy and the code cannot drift apart. */

// The color for each verdict's tone, shared by every place a {tone, text}
// verdict from this file is rendered.
export const TONE_DOT = { pos: 'bg-emerald-400', neutral: 'bg-zinc-500', caution: 'bg-amber-400' }

// Exported so lib/quadrant.js's numeric scores read the same thresholds as
// the verdict text above - two parallel systems judging the same input
// against different cutoffs is worse than one file both files trust.
export const T = {
  revFast: 15, revSteady: 5,
  epsGap: 3,
  roeStrong: 15, marginStrong: 10, roeOk: 8, marginOk: 5,
  deHigh: 2, deLow: 1, currLow: 1, currStrong: 1.5, coverLow: 3,
  pegCheap: 1, pegRich: 2,
  momUp: 10, momDown: -10,
  histBand: 0.1,
}

const has = (...vals) => vals.some((v) => v != null)
const limited = { tone: 'neutral', text: 'Limited data' }

export function growthVerdict(f) {
  const rev = f.revenue_growth_ttm_yoy
  const eps = f.eps_growth_ttm_yoy
  if (!has(rev, eps, f.revenue_growth_5y)) return limited

  let tone = 'neutral'
  let text
  if (rev == null) {
    text = 'Revenue trend unclear'
  } else if (rev > T.revFast) {
    tone = 'pos'
    text = 'Revenue growing fast'
  } else if (rev > T.revSteady) {
    text = 'Steady revenue growth'
  } else if (rev > 0) {
    text = 'Modest revenue growth'
  } else {
    tone = 'caution'
    text = 'Revenue contracting'
  }

  if (rev != null && eps != null) {
    if (eps > rev + T.epsGap) text += '; EPS outpacing revenue'
    else if (eps < rev - T.epsGap) text += '; EPS lagging revenue'
  }
  return { tone, text }
}

export function profitabilityVerdict(f) {
  const { roe, net_margin: nm } = f
  if (!has(roe, nm, f.gross_margin, f.operating_margin_ttm)) return limited
  if ((roe ?? 0) > T.roeStrong && (nm ?? 0) > T.marginStrong) {
    return { tone: 'pos', text: 'Highly profitable' }
  }
  if ((roe ?? 0) > T.roeOk || (nm ?? 0) > T.marginOk) {
    return { tone: 'neutral', text: 'Profitable' }
  }
  return { tone: 'caution', text: 'Thin or negative margins' }
}

export function healthVerdict(f) {
  const { debt_to_equity: de, current_ratio: cr, interest_coverage: ic } = f
  if (!has(de, cr, ic, f.quick_ratio)) return limited
  if ((de ?? 0) > T.deHigh || (cr ?? 99) < T.currLow || (ic ?? 99) < T.coverLow) {
    return { tone: 'caution', text: 'Leveraged or tight on liquidity' }
  }
  if ((de ?? 99) < T.deLow && (cr ?? 0) > T.currStrong) {
    return { tone: 'pos', text: 'Conservative balance sheet' }
  }
  return { tone: 'neutral', text: 'Adequate balance sheet' }
}

export function valuationVerdict(f) {
  const peg = f.peg_ratio
  const pe = f.pe_ratio
  const hist = f.valuation_history?.pe
  if (!has(peg, pe) && !hist) return limited

  let tone = 'neutral'
  const parts = []
  if (peg != null) {
    if (peg < T.pegCheap) {
      tone = 'pos'
      parts.push('growth looks cheap vs. earnings growth')
    } else if (peg > T.pegRich) {
      tone = 'caution'
      parts.push('expensive vs. growth')
    } else {
      parts.push('fairly priced vs. growth')
    }
  }
  if (hist && pe != null) {
    if (pe > hist.median * (1 + T.histBand)) {
      tone = 'caution'
      parts.push(`P/E above its ${hist.n}-yr range`)
    } else if (pe < hist.median * (1 - T.histBand)) {
      if (tone !== 'caution') tone = 'pos'
      parts.push(`P/E below its ${hist.n}-yr range`)
    } else {
      parts.push(`P/E in line with its ${hist.n}-yr range`)
    }
  }
  return { tone, text: parts.join('; ') || 'Limited data' }
}

export function momentumVerdict(f) {
  const y = f.price_return_1y
  if (!has(y, f.price_return_ytd, f.price_return_1m)) return limited
  let tone = 'neutral'
  let text
  if (y == null) text = 'Price trend unclear'
  else if (y > T.momUp) {
    tone = 'pos'
    text = 'Up over the past year'
  } else if (y < T.momDown) {
    tone = 'caution'
    text = 'Down over the past year'
  } else {
    text = 'Roughly flat over the past year'
  }
  if ((f.price_return_ytd ?? 0) < 0) text += '; lagging YTD'
  return { tone, text }
}

export const SNAPSHOT_GROUPS = [
  {
    key: 'growth', label: 'Growth', verdict: growthVerdict,
    metrics: [
      { label: 'Revenue YoY', field: 'revenue_growth_ttm_yoy', fmt: 'pct' },
      { label: 'EPS YoY', field: 'eps_growth_ttm_yoy', fmt: 'pct' },
      { label: 'Revenue 5Y', field: 'revenue_growth_5y', fmt: 'pct' },
    ],
  },
  {
    key: 'profitability', label: 'Profitability', verdict: profitabilityVerdict,
    metrics: [
      { label: 'ROE', field: 'roe', fmt: 'pct' },
      { label: 'Net margin', field: 'net_margin', fmt: 'pct' },
      { label: 'Gross margin', field: 'gross_margin', fmt: 'pct' },
      { label: 'Op. margin', field: 'operating_margin_ttm', fmt: 'pct' },
    ],
  },
  {
    key: 'health', label: 'Financial health', verdict: healthVerdict,
    metrics: [
      { label: 'Current ratio', field: 'current_ratio', fmt: 'num' },
      { label: 'Debt/equity', field: 'debt_to_equity', fmt: 'num' },
      { label: 'Int. coverage', field: 'interest_coverage', fmt: 'num' },
      { label: 'Quick ratio', field: 'quick_ratio', fmt: 'num' },
    ],
  },
  {
    key: 'valuation', label: 'Valuation', verdict: valuationVerdict,
    metrics: [
      { label: 'P/E', field: 'pe_ratio', fmt: 'num' },
      { label: 'Forward P/E', field: 'forward_pe', fmt: 'num' },
      { label: 'PEG', field: 'peg_ratio', fmt: 'num' },
      { label: 'EV/EBITDA', field: 'ev_ebitda', fmt: 'num' },
    ],
  },
  {
    key: 'momentum', label: 'Momentum', verdict: momentumVerdict,
    metrics: [
      { label: '1 month', field: 'price_return_1m', fmt: 'pct' },
      { label: 'YTD', field: 'price_return_ytd', fmt: 'pct' },
      { label: '1 year', field: 'price_return_1y', fmt: 'pct' },
      { label: 'Beta', field: 'beta', fmt: 'num' },
    ],
  },
]
