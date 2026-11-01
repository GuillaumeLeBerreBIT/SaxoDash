export default function AnalystCounts({ rows }) {
  return (
    <dl className="mt-1 grid gap-1 text-center" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map(([label, count]) => (
        <div key={label} className="flex flex-col-reverse justify-end">
          <dt className="text-[12px] text-ink-3">{label}</dt>
          <dd className="num text-[13.5px] font-semibold text-ink">{count}</dd>
        </div>
      ))}
    </dl>
  )
}
