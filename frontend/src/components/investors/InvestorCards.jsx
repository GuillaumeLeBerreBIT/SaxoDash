import InvestorCard from './InvestorCard'

export default function InvestorCards({ investors }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
      {investors.map((investor) => (
        <InvestorCard key={investor.slug} investor={investor} />
      ))}
    </div>
  )
}
