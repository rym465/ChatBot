import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 16
const SALT_LEN = 16

/** scrypt options — tuned for interactive use (not high-throughput) */
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

/**
 * @param {string} password
 * @param {string} utf8Payload JSON string to encrypt
 */
export function encryptWithPassword(password, utf8Payload) {
  const salt = crypto.randomBytes(SALT_LEN)
  const key = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT)
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(utf8Payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    v: 1,
    algo: 'aes-256-gcm+scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: enc.toString('base64'),
  }
}

/**
 * @param {string} password
 * @param {{ salt: string, iv: string, tag: string, ciphertext: string }} bundle
 * @returns {string} UTF-8 plaintext
 */
export function decryptWithPassword(password, bundle) {
  if (!bundle?.salt || !bundle?.iv || !bundle?.tag || !bundle?.ciphertext) {
    throw new Error('Invalid encrypted bundle')
  }
  const salt = Buffer.from(bundle.salt, 'base64')
  const key = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT)
  const iv = Buffer.from(bundle.iv, 'base64')
  const tag = Buffer.from(bundle.tag, 'base64')
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([
    decipher.update(Buffer.from(bundle.ciphertext, 'base64')),
    decipher.final(),
  ])
  return dec.toString('utf8')
}
