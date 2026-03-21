import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getChatbotsDir } from './dataPaths.js'

function indexPath() {
  return path.join(getChatbotsDir(), '_password_index.json')
}

function loadIndex() {
  const INDEX_PATH = indexPath()
  if (!fs.existsSync(INDEX_PATH)) {
    return { v: 1, map: {} }
  }
  try {
    const j = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'))
    if (j && typeof j.map === 'object' && j.map !== null) {
      return { v: 1, map: { ...j.map } }
    }
  } catch {
    /* ignore */
  }
  return { v: 1, map: {} }
}

function writeIndex(data) {
  const INDEX_PATH = indexPath()
  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true })
  fs.writeFileSync(INDEX_PATH, JSON.stringify(data, null, 2), 'utf8')
}

function pepper() {
  return process.env.CONTEXT_PASSWORD_PEPPER || 'dev-insecure-pepper-set-CONTEXT_PASSWORD_PEPPER'
}

/**
 * Stable lookup key for a password (not stored; derived with server secret).
 * @param {string} password
 */
export function hashPasswordForLookup(password) {
  const p = typeof password === 'string' ? password : ''
  return crypto.createHmac('sha256', pepper()).update(p, 'utf8').digest('hex')
}

/**
 * @param {string} password
 * @returns {string | null} 8-digit chatbot id
 */
export function resolveChatbotIdByPassword(password) {
  const h = hashPasswordForLookup(password)
  const id = loadIndex().map[h]
  return typeof id === 'string' && /^\d{8}$/.test(id) ? id : null
}

/**
 * Links password → chatbotId so “test chat” needs only the password.
 * @param {string} password
 * @param {string} chatbotId
 * @throws {Error & { code: 'PASSWORD_LOOKUP_TAKEN' }}
 */
export function registerPasswordLookup(password, chatbotId) {
  if (!/^\d{8}$/.test(String(chatbotId))) {
    throw new Error('Invalid chatbot id for lookup')
  }
  const h = hashPasswordForLookup(password)
  const data = loadIndex()
  const existing = data.map[h]
  if (existing && existing !== chatbotId) {
    const err = new Error('PASSWORD_LOOKUP_TAKEN')
    /** @type {any} */ (err).code = 'PASSWORD_LOOKUP_TAKEN'
    throw err
  }
  data.map[h] = String(chatbotId)
  writeIndex(data)
}

export function usingDefaultPepper() {
  return !process.env.CONTEXT_PASSWORD_PEPPER?.trim()
}
