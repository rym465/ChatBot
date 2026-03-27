/**
 * Single place for your Node API origin (like backend config in one module).
 *
 * - Set `API_BASE_URL` to your deployed backend: `https://your-api.up.railway.app` (no trailing slash).
 * - Local dev: leave `''` so Vite proxies `/api/*` → http://127.0.0.1:3000 (see vite.config.js).
 * - Optional override: `VITE_API_BASE` in `.env` at build time — used only if `API_BASE_URL` here is empty.
 */
/** Production on Vercel: leave empty and set BACKEND_URL in Vercel so /api/* is proxied (see frontend/api/proxy.js). */
export const API_BASE_URL = ''

const fromFile = String(API_BASE_URL || '').trim().replace(/\/$/, '')
const fromEnv = String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '')
const forceEnvInDev = String(import.meta.env.VITE_FORCE_ENV_API || '').toLowerCase() === 'true'

/**
 * In local dev, default to Vite proxy (/api -> 127.0.0.1:3000) to keep frontend+backend in sync.
 * Set VITE_FORCE_ENV_API=true only when you intentionally want to hit a remote backend during dev.
 */
const fromEnvAllowed = !import.meta.env.DEV || forceEnvInDev ? fromEnv : ''

/** Resolved origin for all API calls (no trailing slash). Empty → same-origin `/api/*` (Vite proxy in dev). */
export const API_ROOT = fromFile || fromEnvAllowed || ''

function api(path) {
  const p = path.startsWith('/') ? path.slice(1) : path
  return `${API_ROOT}/api/${p}`
}

export const SCRAPE_API = api('scrape')
export const CONTEXT_API_BASE = api('chatbot-context')
export const CHAT_TEST_BASE = api('chatbot-test')
export const TRIAL_INQUIRY_API = api('trial-inquiry')
export const CONTACT_DEMO_API = api('contact-demo')

// Public configuration used to synchronize theme colors and pricing.
export const PUBLIC_SETTINGS_API = api('public-settings')
