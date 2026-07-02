/*
 * ProtectedRoute.jsx — Blocks unauthenticated access.
 * Shows nothing while auth is loading (prevents flash).
 * Redirects to /login if no user after loading.
 */
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export default ProtectedRoute
