import crypto from 'crypto'

const SERVER_SECRET = String(
  process.env.CONTEXT_INTEGRATION_AT_REST_SECRET || process.env.ADMIN_LOGIN_TOKEN_SECRET || '',
).trim()

function getKey() {
  // Derive a fixed-length key from a server-only secret.
  // If the secret is missing, we still return a deterministic key so the app works in dev.
  // For production, set CONTEXT_INTEGRATION_AT_REST_SECRET to a long random string.
  const s = SERVER_SECRET || 'dev-insecure-context-integration-at-rest-secret'
  return crypto.createHash('sha256').update(s, 'utf8').digest()
}

export function encryptWithServerSecret(plaintext) {
  const iv = crypto.randomBytes(12) // recommended size for GCM
  const key = getKey()
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const text = String(plaintext ?? '')
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    v: 1,
    algo: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

export function decryptWithServerSecret(bundle) {
  if (!bundle || typeof bundle !== 'object') throw new Error('Invalid encrypted bundle')
  const iv = Buffer.from(String(bundle.iv || ''), 'base64')
  const tag = Buffer.from(String(bundle.tag || ''), 'base64')
  const ciphertext = Buffer.from(String(bundle.ciphertext || ''), 'base64')
  if (!iv.length || !tag.length || !ciphertext.length) throw new Error('Invalid encrypted bundle')

  const key = getKey()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  return plaintext
}

