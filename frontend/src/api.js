/**
 * Single place for your Node API origin (like backend config in one module).
 *
 * - Set `API_BASE_URL` to your deployed backend: `https://your-api.up.railway.app` (no trailing slash).
 * - Local dev: leave `''` so Vite proxies `/api/*` → http://127.0.0.1:3000 (see vite.config.js).
 * - Optional override: `VITE_API_BASE` in `.env` at build time — used only if `API_BASE_URL` here is empty.
 */
export const API_BASE_URL = 'https://white-label-ai-chatbot-generator-ty.vercel.app'

const fromFile = String(API_BASE_URL || '').trim().replace(/\/$/, '')
const fromEnv = String(import.meta.env.VITE_API_BASE || '').trim().replace(/\/$/, '')

/** Resolved origin for all API calls (no trailing slash). Empty → same-origin `/api/*` (Vite proxy in dev). */
export const API_ROOT = fromFile || fromEnv || ''

function api(path) {
  const p = path.startsWith('/') ? path.slice(1) : path
  return `${API_ROOT}/api/${p}`
}

export const SCRAPE_API = api('scrape')
export const CONTEXT_API_BASE = api('chatbot-context')
export const CHAT_TEST_BASE = api('chatbot-test')
export const TRIAL_INQUIRY_API = api('trial-inquiry')
export const CONTACT_DEMO_API = api('contact-demo')
