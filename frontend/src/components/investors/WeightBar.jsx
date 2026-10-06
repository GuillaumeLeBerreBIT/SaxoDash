export default function WeightBar({ weight, max }) {
  const widthPercent = weight == null || max === 0 ? 0 : (weight / max) * 100
  return (
    <div
      role="img"
      aria-label={`Weight: ${weight}% of max ${max}%`}
      style={{ width: `${widthPercent}%` }}
      className="h-1.5 bg-blue-500/60 rounded-sm"
    />
  )
}
