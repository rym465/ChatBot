import fs from 'fs'
import path from 'path'
import { getDataRoot } from './dataPaths.js'

/** Only this account may sign in to the admin panel (case-insensitive). */
export const ADMIN_ALLOWED_EMAIL = 'renee@onyxdigitalspace.com'

/** Initial / fallback until overridden by env or `setAdminPassword` file. */
const DEFAULT_ADMIN_PASSWORD = 'Jamaica28054$'

function passwordFilePath() {
  return path.join(getDataRoot(), 'admin_login_password.txt')
}

export function allowedAdminEmail() {
  return ADMIN_ALLOWED_EMAIL
}

export function normalizeAdminEmail(input) {
  return String(input || '').trim().toLowerCase()
}

export function emailsMatchAllowed(input) {
  return normalizeAdminEmail(input) === ADMIN_ALLOWED_EMAIL
}

/**
 * Active password: optional file (after reset) wins, then env, then default.
 * @returns {string}
 */
export function getAdminPassword() {
  const fp = passwordFilePath()
  try {
    if (fs.existsSync(fp)) {
      const fromFile = fs.readFileSync(fp, 'utf8').trim()
      if (fromFile.length >= 8) return fromFile
    }
  } catch {
    /* ignore */
  }
  const fromEnv = String(process.env.ADMIN_LOGIN_PASSWORD || '').trim()
  if (fromEnv.length >= 8) return fromEnv
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
