// Axios instance with auth interceptor
import axios from 'axios'
import { BACKEND_URL } from '../config'

const client = axios.create({ baseURL: `${BACKEND_URL}/api` })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('codesync_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('codesync_token')
      localStorage.removeItem('codesync_user')
      const path = window.location.pathname
      if (path !== '/login' && path !== '/register') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default client
