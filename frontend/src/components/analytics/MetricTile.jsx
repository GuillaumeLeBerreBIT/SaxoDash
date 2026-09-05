export default function MetricTile({ label, value, hint }) {
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-md px-3 py-2.5">
      <div className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium leading-tight">{label}</div>
      <div className="num mt-1 text-[15px] text-zinc-100">{value}</div>
      {hint && <div className="text-[10px] text-zinc-600 mt-0.5">{hint}</div>}
    </div>
  )
}
