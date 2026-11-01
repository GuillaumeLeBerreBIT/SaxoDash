import { Navigate, useLocation, useParams } from 'react-router-dom'
import { legacyTarget } from '../lib/navigation'

export default function LegacyRedirect({ redirect }) {
  const params = useParams()
  const { search, hash } = useLocation()
  return <Navigate to={`${legacyTarget(redirect, params, search)}${hash}`} replace />
}
