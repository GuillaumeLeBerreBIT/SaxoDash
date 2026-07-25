import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { isAuthenticated } from '../api/client'

export default function RequireAuth() {
  const location = useLocation()
  return isAuthenticated() ? (
    <Outlet />
  ) : (
    <Navigate to="/login" state={{ from: location }} replace />
  )
}
