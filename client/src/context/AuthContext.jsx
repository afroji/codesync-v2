/*
 * AuthContext.jsx — Global auth state.
 * Provides user, token, login(), logout(), loading.
 * Validates existing token on app mount by calling /me.
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const storedToken = localStorage.getItem('codesync_token')
    if (!storedToken) {
      setLoading(false)
      return
    }

    api
      .get('/auth/me')
      .then((res) => {
        setUser(res.data.data.user)
        setToken(storedToken)
      })
      .catch(() => {
        localStorage.removeItem('codesync_token')
        localStorage.removeItem('codesync_user')
      })
      .finally(() => setLoading(false))
  }, [])

  const login = (newToken, newUser) => {
    localStorage.setItem('codesync_token', newToken)
    localStorage.setItem('codesync_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  const logout = () => {
    localStorage.removeItem('codesync_token')
    localStorage.removeItem('codesync_user')
    setToken(null)
    setUser(null)
    navigate('/login')
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
