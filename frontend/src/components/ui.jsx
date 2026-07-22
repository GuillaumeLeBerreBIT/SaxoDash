export function Card({ children, className = '', padding = true, interactive = false, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-gradient-to-b from-zinc-900 to-zinc-900/70 border border-white/[0.06] border-t-white/[0.09] rounded-xl shadow-sm shadow-black/40 ${
        interactive ? 'hover:border-white/[0.12] cursor-pointer transition-colors duration-200' : ''
      } ${padding ? 'p-5' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, right, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div>
        <h3 className="text-[13px] font-medium text-zinc-200">{title}</h3>
        {subtitle && <p className="text-[12px] text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function PageHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h1 className="text-[22px] font-medium tracking-tight text-zinc-50">{title}</h1>
        {subtitle && <p className="text-[13px] text-zinc-500 mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

const statTones = {
  blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/15',
  emerald: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15',
  red: 'bg-red-500/10 text-red-400 border border-red-500/15',
  zinc: 'bg-zinc-800/80 text-zinc-300 border border-zinc-700/70',
}

export function StatCard({ label, value, badge, badgeTone = 'zinc', note }) {
  return (
    <Card>
      <div className="text-[11px] text-zinc-500 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-2.5 text-[clamp(20px,1.9vw,28px)] font-semibold text-zinc-50 tracking-tight num font-mono whitespace-nowrap">
        {value}
      </div>
      {(badge || note) && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {badge && (
            <span
              className={`inline-flex items-center whitespace-nowrap max-w-full overflow-hidden text-ellipsis text-[11.5px] px-2 py-0.5 rounded-md font-medium num font-mono ${
                statTones[badgeTone] || statTones.zinc
              }`}
            >
              {badge}
            </span>
          )}
          {note && <span className="text-[12px] text-zinc-500">{note}</span>}
        </div>
      )}
    </Card>
  )
}

const badgeTones = {
  blue: 'bg-blue-500/10 text-blue-400 border-blue-500/15',
  zinc: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/70',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/15',
  red: 'bg-red-500/10 text-red-400 border-red-500/15',
  teal: 'bg-teal-500/10 text-teal-400 border-teal-500/15',
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/15',
}

export function Badge({ tone = 'zinc', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center text-[10.5px] font-medium tracking-wide uppercase px-1.5 py-0.5 rounded border ${
        badgeTones[tone] || badgeTones.zinc
      } ${className}`}
    >
      {children}
    </span>
  )
}

