// Central configuration for the client
let backendUrl = import.meta.env.VITE_API_URL || ''
if (backendUrl && !/^https?:\/\//i.test(backendUrl)) {
  const isLocal = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1')
  backendUrl = `${isLocal ? 'http' : 'https'}://${backendUrl}`
}
if (backendUrl.endsWith('/')) {
  backendUrl = backendUrl.slice(0, -1)
}

export const BACKEND_URL = backendUrl

