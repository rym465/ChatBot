import crypto from 'crypto'

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 256 * 16384 * 8 }
const KEY_LEN = 64

/**
 * Format: v1$<base64url salt>$<base64url derived>
 * @param {string} plain
 * @returns {string}
 */
export function hashAdminPassword(plain) {
  const pw = String(plain || '')
  if (pw.length < 8) throw new Error('Password must be at least 8 characters')
  const salt = crypto.randomBytes(16)
  const derived = crypto.scryptSync(pw, salt, KEY_LEN, SCRYPT_PARAMS)
  return `v1$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

/**
 * @param {string} plain
 * @param {string} stored
 * @returns {boolean}
 */
export function verifyAdminPasswordHash(plain, stored) {
  const s = String(stored || '')
  const pw = String(plain ?? '')
  if (!pw || !s.startsWith('v1$')) return false
  const parts = s.split('$')
  if (parts.length !== 3) return false
  const [, saltB64, hashB64] = parts
  try {
    const salt = Buffer.from(saltB64, 'base64url')
    const expected = Buffer.from(hashB64, 'base64url')
    const derived = crypto.scryptSync(pw, salt, expected.length, SCRYPT_PARAMS)
    if (derived.length !== expected.length) return false
    return crypto.timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}
