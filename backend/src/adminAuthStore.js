import fs from 'fs'
import path from 'path'
import { getDataRoot } from './dataPaths.js'

/**
 * Default admin email when `ADMIN_LOGIN_EMAIL` is unset (case-insensitive match at login).
 * Override on the server with `ADMIN_LOGIN_EMAIL` so hosting matches your panel without redeploying the admin UI.
 */
export const ADMIN_ALLOWED_EMAIL = 'renee@onyxdigitalspace.com'

/**
 * Fallback password when no env and no `admin_login_password.txt`.
 * Prefer `ADMIN_LOGIN_PASSWORD` on the host (quote values that contain `$`, e.g. Docker/Railway).
 */
const DEFAULT_ADMIN_PASSWORD = 'Jamaica28054$'

function passwordFilePath() {
  return path.join(getDataRoot(), 'admin_login_password.txt')
}

export function normalizeAdminEmail(input) {
  return String(input || '').trim().toLowerCase()
}

export function allowedAdminEmail() {
  const raw = String(process.env.ADMIN_LOGIN_EMAIL || '').trim()
  if (raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
    return normalizeAdminEmail(raw)
  }
  return ADMIN_ALLOWED_EMAIL
}

export function emailsMatchAllowed(input) {
  return normalizeAdminEmail(input) === allowedAdminEmail()
}

/**
 * Password resolution (deployment-friendly):
 * 1. `ADMIN_LOGIN_PASSWORD` when set and non-empty after trim — wins on Railway/Vercel APIs.
 * 2. Else `data/admin_login_password.txt` (after “Forgot password” reset on a persistent disk).
 * 3. Else built-in default.
 */
export function getAdminPassword() {
  const envKey = process.env.ADMIN_LOGIN_PASSWORD
  if (envKey !== undefined && envKey !== null) {
    const fromEnv = String(envKey).trim()
    if (fromEnv.length >= 8) return fromEnv
  }
  const fp = passwordFilePath()
  try {
    if (fs.existsSync(fp)) {
      const fromFile = fs.readFileSync(fp, 'utf8').trim()
      if (fromFile.length >= 8) return fromFile
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ADMIN_PASSWORD
}

/**
 * Persist new password (plaintext on disk — single-tenant / self-hosted; restrict file perms).
 * @param {string} plain
 */
export function setAdminPassword(plain) {
  const pw = String(plain || '').trim()
  if (pw.length < 8) throw new Error('Password must be at least 8 characters')
  const dir = getDataRoot()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(passwordFilePath(), pw, { encoding: 'utf8', mode: 0o600 })
}
