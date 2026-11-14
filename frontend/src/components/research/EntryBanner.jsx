const TONE = { up: 'text-up', warn: 'text-warn-text' }

export default function EntryBanner({ sentence }) {
  if (!sentence) return null
  return (
    <div data-testid="entry-banner" className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3.5 py-2.5 border-b border-line">
      {sentence.word ? (
        <span className={`text-[17px] font-bold tracking-wide ${TONE[sentence.tone] ?? 'text-ink'}`}>{sentence.word}</span>
      ) : null}
      {sentence.why ? <span className="text-[13px] font-semibold text-ink">{sentence.why}</span> : null}
      {sentence.next ? <span className="text-[13px] text-ink-2">{sentence.next}</span> : null}
      {sentence.risk ? <span className="basis-full text-[12.5px] text-ink-3">{sentence.risk}</span> : null}
      {sentence.earnings ? <span className="basis-full text-[12.5px] font-medium text-warn-text">{sentence.earnings}</span> : null}
    </div>
  )
}
