import { fmtNum } from '../../lib/format'

const VOTE_WORDS = {
  buy: ['Buy', 'text-up'],
  sell: ['Sell', 'text-down'],
  neutral: ['Neutral', 'text-ink-2'],
}

export default function TechnicalsTable({ votes }) {
  if (!votes?.length) return null

  return (
    <div className="overflow-x-auto">
      <table aria-label="Technical indicators" className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="text-ink-3">
            <th scope="col" className="text-left font-medium py-1.5 pr-2 whitespace-nowrap">Indicator</th>
            <th scope="col" className="text-right font-medium py-1.5 px-2 whitespace-nowrap">Value</th>
            <th scope="col" className="text-right font-medium py-1.5 pl-2 whitespace-nowrap">Signal</th>
          </tr>
        </thead>
        <tbody>
          {votes.map((vote) => {
            const [word, tone] = VOTE_WORDS[vote.vote]
            return (
              <tr key={vote.key} className="border-t border-line">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal text-ink-2">
                  <span className="block">{vote.label}</span>
                  <span className="block text-ink-3">{vote.reading}</span>
                </th>
                <td className="py-1.5 px-2 text-right align-top num text-ink">{fmtNum(vote.value, 2)}</td>
                <td className="py-1.5 pl-2 text-right align-top whitespace-nowrap">
                  <span className={tone}>{word}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
