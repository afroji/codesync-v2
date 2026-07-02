/*
 * Login.jsx — Email/password login + Google OAuth button.
 * Matches the design file's login screen.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.22V7.04H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.04l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  )
}

function EyeIcon({ off }) {
  return off ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.9 18.9 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.9 18.9 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [searchParams] = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam === 'oauth_failed') {
      setError('Google login failed. Please try again or use email/password.')
    } else if (errorParam === 'account_exists') {
      setError('An account with this email already exists. Please sign in with email/password.')
    }
  }, [searchParams])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Email and password are required')
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/auth/login', { email, password })
      const { user, token } = res.data.data
      login(token, user)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center"
      style={{ background: 'var(--color-bg-room)', color: 'var(--color-text-primary)' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          opacity: 0.35,
        }}
      />

      <Link
        to="/"
        className="absolute flex items-center gap-2"
        style={{ top: 20, left: 20, textDecoration: 'none', color: 'var(--color-text-primary)' }}
      >
        <div
          className="flex items-center justify-center"
          style={{ width: 16, height: 16, background: 'var(--color-accent-primary)', borderRadius: 4 }}
        >
          <div style={{ width: 6, height: 6, background: 'var(--color-bg-room)', borderRadius: 1 }} />
        </div>
        <span className="font-semibold" style={{ fontSize: 14, letterSpacing: '-0.01em' }}>
          CodeSync
        </span>
      </Link>

      <div className="relative flex flex-col items-center" style={{ gap: 18 }}>
        <div
          style={{
            width: 380,
            background: 'var(--color-bg-login-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 10,
            padding: 28,
          }}
        >
          <h2 className="font-semibold" style={{ fontSize: 20, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
            Sign in to CodeSync
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '0 0 24px', lineHeight: 1.5 }}>
            Save your projects, access version history, and use AI assistance.
          </p>

          <a
            href="/api/auth/google"
            className="font-medium"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              background: '#ffffff',
              color: '#1a1a1a',
              fontSize: 14,
              padding: 11,
              borderRadius: 6,
              textDecoration: 'none',
            }}
          >
            <GoogleIcon />
            Continue with Google
          </a>

          <div className="flex items-center" style={{ gap: 12, margin: '20px 0' }}>
            <div className="divider-h" />
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>or</span>
            <div className="divider-h" />
          </div>

          {error && (
            <div
              style={{
                fontSize: 13,
                color: 'var(--color-accent-danger)',
                background: 'rgba(248, 81, 73, 0.1)',
                border: '1px solid rgba(248, 81, 73, 0.25)',
                borderRadius: 6,
                padding: '8px 10px',
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: 10 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="input"
            />

            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="input"
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon off={showPassword} />
              </button>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="text-center" style={{ marginTop: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              No account?{' '}
              <Link to="/register" style={{ color: 'var(--color-text-accent)', textDecoration: 'none' }}>
                Register
              </Link>
            </span>
          </div>
        </div>

        <Link to="/" style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none' }}>
          Continue anonymously <span style={{ color: 'var(--color-text-accent)' }}>&rarr;</span>
        </Link>
      </div>
    </div>
  )
}

export default Login
