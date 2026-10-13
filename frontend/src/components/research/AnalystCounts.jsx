export default function AnalystCounts({ rows }) {
  return (
    <dl className="mt-1 grid gap-1 text-center" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map(([label, count]) => (
        <div key={label} className="flex flex-col-reverse justify-end">
          <dt className="text-[var(--fig-2xs)] text-zinc-500">{label}</dt>
          <dd className="num font-mono text-[var(--fig-sm)] text-zinc-100">{count}</dd>
        </div>
      ))}
    </dl>
  )
}
