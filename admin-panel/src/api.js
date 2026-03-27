/**
 * Admin API origin — same idea as `frontend/src/api.js`, with a production default so Vercel works without extra env.
 *
 * - Local dev: leave `API_BASE_URL` empty → `/api/*` via Vite proxy → `vite.config.js`.
 * - Production build: if unset, uses `DEFAULT_PUBLIC_API_ORIGIN` (Express on your main deploy) so admin data loads.
 * - Overrides: `API_BASE_URL` here, or `VITE_API_BASE` / `VITE_PUBLIC_API_ORIGIN` (no trailing slash).
 * - Dev + remote API: `VITE_FORCE_ENV_API=true` and `VITE_API_BASE=https://...`.
 */
export const API_BASE_URL = ''

/** Change this if your Node API is hosted on another hostname. */
export const DEFAULT_PUBLIC_API_ORIGIN = 'https://white-label-ai-chatbot-generator-ty.vercel.app'

const fromFile = String(API_BASE_URL || '').trim().replace(/\/$/, '')
const fromEnv = String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '')
const fromPublic = String(import.meta.env.VITE_PUBLIC_API_ORIGIN || '').trim().replace(/\/$/, '')
const forceEnvInDev = String(import.meta.env.VITE_FORCE_ENV_API || '').toLowerCase() === 'true'
const fromEnvAllowed = !import.meta.env.DEV || forceEnvInDev ? fromEnv : ''

const productionFallback =
  import.meta.env.PROD && !fromFile && !fromEnvAllowed
    ? (fromPublic || DEFAULT_PUBLIC_API_ORIGIN).trim().replace(/\/$/, '')
    : ''

/** Dev: empty → same-origin `/api/*` (Vite proxy). Prod: defaults to deployed API origin. */
export const API_ROOT = fromFile || fromEnvAllowed || productionFallback

export function api(path) {
  const p = path.startsWith('/') ? path.slice(1) : path
  return `${API_ROOT}/api/${p}`
}

export const ADMIN_API = {
  login: api('admin/login'),
  metrics: api('admin/metrics'),
  analytics: (days = 14) => api(`admin/analytics?days=${encodeURIComponent(String(days))}`),
  chatbots: (limit = 25) => api(`admin/chatbots?limit=${encodeURIComponent(String(limit))}`),
  trials: (status = 'active', limit = 25) =>
    api(`admin/trials?status=${encodeURIComponent(String(status))}&limit=${encodeURIComponent(String(limit))}`),
  leads: ({ source = '', limit = 100 } = {}) => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (String(source).trim()) params.set('source', String(source).trim())
    return api(`admin/leads?${params.toString()}`)
  },
  conversations: ({ chatbotId = '', limit = 50 } = {}) => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (String(chatbotId).trim()) params.set('chatbotId', String(chatbotId).trim())
    return api(`admin/conversations?${params.toString()}`)
  },
  messages: ({ chatbotId = '', threadId = '', limit = 200 } = {}) => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (String(chatbotId).trim()) params.set('chatbotId', String(chatbotId).trim())
    if (String(threadId).trim()) params.set('threadId', String(threadId).trim())
    return api(`admin/messages?${params.toString()}`)
  },
  settings: api('admin/settings'),
  deleteChatbot: (chatbotId) => api(`admin/chatbot/${encodeURIComponent(String(chatbotId))}`),
  integration: (chatbotId) =>
    api(`admin/chatbot/${encodeURIComponent(String(chatbotId))}/integration`),
  integrationBootstrap: (chatbotId) =>
    api(`admin/chatbot/${encodeURIComponent(String(chatbotId))}/integration-bootstrap`),
  updateChatbotConfig: (chatbotId) =>
    api(`admin/chatbot/${encodeURIComponent(String(chatbotId))}/config`),
}
