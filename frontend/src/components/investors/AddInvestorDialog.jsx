import { Modal } from '../ui'

export default function AddInvestorDialog({ onClose }) {
  return <Modal title="Add investor" onClose={onClose}><p className="text-[var(--fig-sm)] text-zinc-400">Search arrives with the next change.</p></Modal>
}
