export default function ImportProgress({ progress }) {
  if (!progress) return null
  const done = progress.quarters_expected ? progress.quarters_imported / progress.quarters_expected : 0
  return (
    <div className="flex flex-col gap-1 text-[12px] text-ink-2">
      <span className="num">
        {`Importing history · ${progress.quarters_imported} of ${progress.quarters_expected} quarters · tickers ${progress.cusips_resolved}/${progress.cusips_seen}`}
      </span>
      <span aria-hidden="true" className="block h-1 rounded-full bg-track overflow-hidden">
        <span className="block h-full bg-accent" style={{ width: `${Math.round(done * 100)}%` }} />
      </span>
    </div>
  )
}
