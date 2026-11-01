import { useState } from 'react'

import { fmtDate } from '../../lib/format'
import { secUrl } from '../../lib/secLinks'
import { Chip, Tag } from '../ui'

const FORM_LABELS = { '10-K': 'Annual report', '10-Q': 'Quarterly report', '8-K': 'Current report' }
const FORM_ORDER = ['10-K', '10-Q', '8-K']

export default function FilingsList({ filings }) {
  const [form, setForm] = useState('all')
  const present = FORM_ORDER.filter((candidate) => filings.some((filing) => filing.form === candidate))
  const active = form === 'all' || present.includes(form) ? form : 'all'
  const shown = active === 'all' ? filings : filings.filter((filing) => filing.form === active)

  if (!filings.length) {
    return <p className="text-[13px] text-ink-3">No annual, quarterly or current reports were found for this company.</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {['all', ...present].map((key) => (
          <Chip key={key} active={active === key} onClick={() => setForm(key)}>
            {key === 'all' ? 'All' : key}
          </Chip>
        ))}
      </div>
      <ul className="mt-3">
        {shown.map((filing) => {
          const href = secUrl(filing.url) ?? secUrl(filing.report_url)
          return (
            <li key={filing.accession || `${filing.form}-${filing.filed}`} className="flex items-center gap-x-3 min-h-[var(--sd-row-h)] py-1.5 border-t border-line first:border-t-0 text-[13.5px]">
              <span className="shrink-0 whitespace-nowrap">
                <Tag className="w-[46px] justify-center">{filing.form}</Tag>
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-ink font-medium">{FORM_LABELS[filing.form] ?? filing.form}</span>
                <span className="block whitespace-nowrap text-[12px] text-ink-3 num">{fmtDate(filing.filed)}</span>
              </span>
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open on SEC.gov: ${filing.form} filed ${fmtDate(filing.filed)} (opens in a new tab)`}
                  className="ml-auto text-[13px] font-semibold text-ink-2 hover:text-ink hover:underline whitespace-nowrap"
                >
                  Open on SEC.gov ↗
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
