import InvestorCard from './InvestorCard'

const CARD_SIZE = { contentVisibility: 'auto', containIntrinsicSize: 'auto 200px' }

export default function InvestorCards({ investors }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
      {investors.map((investor) => (
        <div key={investor.slug} style={CARD_SIZE}><InvestorCard investor={investor} /></div>
      ))}
    </div>
  )
}
