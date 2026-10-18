import CongressCard from './CongressCard'

const CARD_SIZE = { contentVisibility: 'auto', containIntrinsicSize: 'auto 160px' }

export default function CongressCards({ members }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
      {members.map((member) => (
        <div key={member.slug} style={CARD_SIZE}><CongressCard member={member} /></div>
      ))}
    </div>
  )
}
