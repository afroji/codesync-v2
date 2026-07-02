import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CURSOR_COLORS } from '../styles/index.js'

function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [showJoinInput, setShowJoinInput] = useState(false)
  const [joinCode, setJoinCode] = useState('')

  const handleCreateRoom = () => {
    const roomId = crypto.randomUUID()
    navigate(`/room/${roomId}`)
  }

  const handleJoinSubmit = (e) => {
    e.preventDefault()
    if (joinCode.trim()) {
      navigate(`/room/${joinCode.trim()}`)
    }
  }

  return (
    <div
      className="relative min-h-screen w-full flex flex-col"
      style={{ background: 'var(--color-bg-room)', color: 'var(--color-text-primary)' }}
    >
      {/* subtle grid backdrop */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          opacity: 0.4,
        }}
      />

      {/* wordmark */}
      <div className="relative flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center"
            style={{ width: 16, height: 16, background: 'var(--color-accent-primary)', borderRadius: 4 }}
          >
            <div style={{ width: 6, height: 6, background: 'var(--color-bg-room)', borderRadius: 1 }} />
          </div>
          <span className="font-semibold" style={{ fontSize: 14, letterSpacing: '-0.01em' }}>
            CodeSync
          </span>
        </div>

        {user && (
          <Link to="/dashboard" className="flex items-center gap-2" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{user.name}</span>
            <div
              className="flex items-center justify-center font-semibold"
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: CURSOR_COLORS[0].bg,
                color: 'var(--color-bg-room)',
                fontSize: 11,
              }}
            >
              {user.name?.[0]?.toUpperCase()}
            </div>
          </Link>
        )}
      </div>

      {/* hero */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-10 text-center">
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '2px',
            color: 'var(--color-text-muted)',
            marginBottom: 20,
          }}
        >
          NO ACCOUNT NEEDED
        </div>

        <h1
          className="font-semibold"
          style={{ fontSize: 44, letterSpacing: '-0.025em', lineHeight: 1.05, margin: 0 }}
        >
          Code together, instantly.
        </h1>

        <p style={{ fontSize: 16, color: 'var(--color-text-secondary)', margin: '16px 0 32px', lineHeight: 1.5 }}>
          No account needed. Create a room and share the link.
        </p>

        <div className="flex gap-3" style={{ marginBottom: showJoinInput ? 16 : 0 }}>
          <button onClick={handleCreateRoom} className="btn btn-primary" style={{ padding: '10px 22px', fontSize: 14 }}>
            Create Room
          </button>
          <button
            onClick={() => setShowJoinInput((v) => !v)}
            className="btn"
            style={
              showJoinInput
                ? {
                    padding: '10px 22px',
                    fontSize: 14,
                    background: 'var(--color-bg-chip)',
                    borderColor: 'var(--color-accent-primary)',
                    color: 'var(--color-text-primary)',
                  }
                : {
                    padding: '10px 22px',
                    fontSize: 14,
                    background: 'transparent',
                    borderColor: 'var(--color-border-strong)',
                    color: 'var(--color-text-primary)',
                  }
            }
          >
            Join Room
          </button>
        </div>

        {showJoinInput && (
          <form onSubmit={handleJoinSubmit} className="flex flex-col items-center gap-2">
            <div className="flex gap-2" style={{ width: 340 }}>
              <input
                autoFocus
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="abc-123-xyz"
                className="input"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 14, letterSpacing: '1px' }}
              />
              <button
                type="submit"
                className="btn"
                style={{
                  padding: '0 18px',
                  fontSize: 14,
                  background: 'var(--color-bg-chip)',
                  borderColor: 'var(--color-border-strong)',
                  color: 'var(--color-text-primary)',
                }}
              >
                Join
              </button>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--color-text-muted)',
                marginTop: 10,
              }}
            >
              Enter the room code from your invite link
            </div>
          </form>
        )}
      </div>

      {/* footer link */}
      <div className="relative flex justify-center py-5">
        {user ? (
          <Link to="/dashboard" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none' }}>
            Go to Dashboard <span style={{ color: 'var(--color-text-accent)' }}>&rarr;</span>
          </Link>
        ) : (
          <Link to="/login" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none' }}>
            Login to save your projects and use AI assistance{' '}
            <span style={{ color: 'var(--color-text-accent)' }}>&rarr;</span>
          </Link>
        )}
      </div>
    </div>
  )
}

export default Home
