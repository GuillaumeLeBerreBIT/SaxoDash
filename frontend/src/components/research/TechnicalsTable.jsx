import { fmtNum } from '../../lib/format'

const VOTE_WORDS = {
  buy: ['Buy', 'text-emerald-400'],
  sell: ['Sell', 'text-red-400'],
  neutral: ['Neutral', 'text-zinc-400'],
}

export default function TechnicalsTable({ votes }) {
  if (!votes?.length) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[var(--fig-2xs)]">
        <thead>
          <tr className="text-zinc-500">
            <th scope="col" className="text-left font-medium py-1.5 pr-2 whitespace-nowrap">Indicator</th>
            <th scope="col" className="text-right font-medium py-1.5 px-2 whitespace-nowrap">Value</th>
            <th scope="col" className="text-right font-medium py-1.5 pl-2 whitespace-nowrap">Signal</th>
          </tr>
        </thead>
        <tbody>
          {votes.map((vote) => {
            const [word, tone] = VOTE_WORDS[vote.vote]
            return (
              <tr key={vote.key} className="border-t border-white/[0.06]">
                <td className="py-1.5 pr-2 text-zinc-300 whitespace-nowrap">{vote.label}</td>
                <td className="py-1.5 px-2 text-right num font-mono text-zinc-100">{fmtNum(vote.value, 2)}</td>
                <td className="py-1.5 pl-2 text-right text-zinc-400 whitespace-nowrap">
                  {vote.reading} · <span className={tone}>{word}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
