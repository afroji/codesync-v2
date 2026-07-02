// Central configuration for the client
let backendUrl = import.meta.env.VITE_API_URL || ''
if (backendUrl.endsWith('/')) {
  backendUrl = backendUrl.slice(0, -1)
}

export const BACKEND_URL = backendUrl
