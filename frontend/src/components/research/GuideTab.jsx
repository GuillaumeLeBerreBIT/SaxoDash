import { EARNINGS_GUIDE, PLAYBOOKS, QUADRANT_GUIDE, RATIO_GUIDE, SNAPSHOT_GUIDE } from '../../lib/guide'
import { Card, CardHeader } from '../ui'

function GuideGroup({ label, meaning, read }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">{label}</div>
      <p className="mt-1.5 text-[12.5px] text-zinc-500 leading-relaxed">{meaning}</p>
      <p className="mt-1.5 text-[12.5px] text-zinc-300 leading-relaxed">{read}</p>
    </div>
  )
}

function GuideMetric({ name, text }) {
  return (
    <div>
      <div className="text-[12.5px] font-medium text-zinc-200">{name}</div>
      <p className="mt-1 text-[12px] text-zinc-400 leading-relaxed">{text}</p>
    </div>
  )
}

export default function GuideTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Investment snapshot" subtitle="What each group reads, and what counts as good, ok, or caution" />
        <div className="mt-2 divide-y divide-white/[0.06]">
          {SNAPSHOT_GUIDE.map((g) => (
            <GuideGroup key={g.key} label={g.label} meaning={g.meaning} read={g.read} />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Ratios" subtitle="What each ratio measures, and where it's most useful" />
        <div className="mt-2 divide-y divide-white/[0.06]">
          {RATIO_GUIDE.map((group) => (
            <div key={group.label} className="py-3 first:pt-0 last:pb-0">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500 font-medium">{group.label}</div>
              <div className="mt-2 space-y-3">
                {group.metrics.map((m) => (
                  <GuideMetric key={m.name} name={m.name} text={m.text} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Quality vs. valuation quadrant" subtitle="How the two axes are built, and what each corner means" />
        <p className="mt-2 text-[12.5px] text-zinc-500 leading-relaxed">{QUADRANT_GUIDE.meaning}</p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {QUADRANT_GUIDE.corners.map((c) => (
            <div key={c.label} className="rounded-lg border border-white/[0.06] p-3">
              <div className="text-[12px] font-medium text-zinc-200">{c.label}</div>
              <p className="mt-1 text-[12px] text-zinc-400 leading-relaxed">{c.text}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Earnings signals" subtitle="What the surprise bars and quarterly trend calls actually flag" />
        <div className="mt-2 space-y-3">
          {EARNINGS_GUIDE.map((e) => (
            <GuideMetric key={e.name} name={e.name} text={e.text} />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Putting it together" subtitle="Worked combinations, not single metrics in isolation" />
        <ul className="mt-2 space-y-2.5 list-disc list-inside text-[12.5px] text-zinc-300 leading-relaxed">
          {PLAYBOOKS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
