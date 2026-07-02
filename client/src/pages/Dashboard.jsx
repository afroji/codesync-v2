import { useAuth } from '../context/AuthContext'

function Dashboard() {
  const { user, logout } = useAuth()

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center gap-4"
      style={{ background: 'var(--color-bg-room)', color: 'var(--color-text-primary)' }}
    >
      <p style={{ color: 'var(--color-text-muted)' }}>Dashboard coming in Day 14</p>
      {user && <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Logged in as {user.name}</p>}
      <button onClick={logout} className="btn btn-secondary">
        Logout
      </button>
    </div>
  )
}

export default Dashboard
