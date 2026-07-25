import { Navigate, Outlet } from 'react-router-dom'
import { isAuthenticated } from '../api/client'

export default function RequireAuth() {
  return isAuthenticated() ? <Outlet /> : <Navigate to="/login" replace />
}
