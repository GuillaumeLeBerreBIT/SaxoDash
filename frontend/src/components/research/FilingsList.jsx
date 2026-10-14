import { useState } from 'react'

import { fmtDate } from '../../lib/format'
import { secUrl } from '../../lib/secLinks'
import { Badge, Chip } from '../ui'

const FORM_LABELS = { '10-K': 'Annual report', '10-Q': 'Quarterly report', '8-K': 'Current report' }
const FORM_ORDER = ['10-K', '10-Q', '8-K']

export default function FilingsList({ filings }) {
  const [form, setForm] = useState('all')
  const present = FORM_ORDER.filter((candidate) => filings.some((filing) => filing.form === candidate))
  const active = form === 'all' || present.includes(form) ? form : 'all'
  const shown = active === 'all' ? filings : filings.filter((filing) => filing.form === active)

  if (!filings.length) {
    return <p className="text-[var(--fig-xs)] text-zinc-500">No annual, quarterly or current reports were found for this company.</p>
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
      <ul className="mt-3 divide-y divide-white/[0.06]">
        {shown.map((filing) => {
          const href = secUrl(filing.url) ?? secUrl(filing.report_url)
          return (
            <li key={filing.accession || `${filing.form}-${filing.filed}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[var(--fig-xs)]">
              <span className="shrink-0 whitespace-nowrap">
                <Badge>{filing.form}</Badge>
              </span>
              <span className="min-w-0">
                <span className="block text-zinc-100 sm:inline">{FORM_LABELS[filing.form] ?? filing.form}</span>{' '}
                <span className="block whitespace-nowrap text-zinc-500 num font-mono sm:inline sm:ml-2">{fmtDate(filing.filed)}</span>
              </span>
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open on SEC.gov: ${filing.form} filed ${fmtDate(filing.filed)} (opens in a new tab)`}
                  className="ml-auto text-sky-400 hover:text-sky-300 whitespace-nowrap"
                >
                  Open on SEC.gov
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
