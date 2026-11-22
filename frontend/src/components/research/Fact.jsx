export default function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <span className="block text-[12px] text-ink-3">{label}</span>
      <span className="block text-[15px] font-semibold num text-ink">{value ?? '—'}</span>
    </div>
  )
}
