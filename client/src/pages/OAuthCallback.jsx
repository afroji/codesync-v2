/*
 * OAuthCallback.jsx — Handles Google OAuth redirect.
 * Google → server callback → server redirects here
 * with token + user in URL params.
 * Stores in localStorage via AuthContext, then redirects.
 */
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function OAuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login } = useAuth()

  useEffect(() => {
    const errorParam = searchParams.get('error')
    if (errorParam) {
      navigate(`/login?error=${errorParam}`, { replace: true })
      return
    }

    const token = searchParams.get('token')
    const userParam = searchParams.get('user')

    if (token && userParam) {
      // useSearchParams (URLSearchParams) already decodes percent-escapes,
      // so userParam is plain JSON here — decoding again would throw a
      // URIError if a name/email ever contains a literal "%" character.
      const parsedUser = JSON.parse(userParam)
      login(token, parsedUser)
      navigate('/dashboard', { replace: true })
      return
    }

    navigate('/login?error=oauth_failed', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: 'var(--color-bg-room)', color: 'var(--color-text-secondary)' }}
    >
      <p style={{ fontSize: 14 }}>Signing you in...</p>
    </div>
  )
}

export default OAuthCallback
