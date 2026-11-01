import { Plus } from 'lucide-react'

import { PANEL_TYPES } from '../../lib/boards'

export default function PanelLibrary({ onAdd }) {
  return (
    <section aria-label="Panel library" className="sd-panel bg-pane rounded-xl p-3">
      <ul className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
        {Object.entries(PANEL_TYPES).map(([type, spec]) => (
          <li key={type}>
            <button
              type="button"
              aria-label={`Add ${spec.name}`}
              onClick={() => onAdd(type)}
              className="flex items-start gap-3 w-full h-full min-h-11 p-3 rounded-[10px] bg-tile text-left hover:bg-hover"
            >
              <span aria-hidden="true" className="w-7 h-7 shrink-0 rounded-lg grid place-items-center bg-accent-subtle text-ink">
                <Plus size={14} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">{spec.name}</span>
                <span className="block text-[12px] text-ink-3">{spec.blurb}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
