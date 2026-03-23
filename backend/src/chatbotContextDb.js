import crypto from 'crypto'
import { getPool } from './dbPool.js'

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function idExistsDb(id) {
  const pool = getPool()
  if (!pool) return false
  const r = await pool.query('SELECT 1 FROM chatbot_contexts WHERE chatbot_id = $1 LIMIT 1', [id])
  return r.rowCount > 0
}

/** @returns {Promise<string>} 8-digit id */
export async function allocateNewChatbotIdDb() {
  const pool = getPool()
  if (!pool) throw new Error('Database not configured')
  for (let i = 0; i < 200; i++) {
    const n = crypto.randomInt(10_000_000, 100_000_000)
    const id = String(n)
    const exists = await idExistsDb(id)
    if (!exists) return id
  }
  throw new Error('Could not allocate a unique chatbot ID')
}

/**
 * @param {string} id
 * @param {object} record Full disk record shape { v, chatbotId, createdAt, trialEndsAt, encrypted, note }
 * @param {string} passwordLookupHash HMAC hex from hashPasswordForLookup
 */
export async function saveRecordDb(id, record, passwordLookupHash) {
  const pool = getPool()
  if (!pool) throw new Error('Database not configured')
  const trialEndsAt = record.trialEndsAt || new Date().toISOString()
  const createdAt = record.createdAt || new Date().toISOString()
  try {
    await pool.query(
      `INSERT INTO chatbot_contexts (chatbot_id, password_lookup_hash, record_json, trial_ends_at, created_at)
       VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)`,
      [id, passwordLookupHash, JSON.stringify(record), trialEndsAt, createdAt],
    )
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && e.code === '23505') {
      const detail = String(/** @type {{ detail?: string }} */ (e).detail || '')
      if (detail.includes('password_lookup_hash')) {
        const err = new Error('PASSWORD_LOOKUP_TAKEN')
        /** @type {any} */ (err).code = 'PASSWORD_LOOKUP_TAKEN'
        throw err
      }
      const err = new Error('CHATBOT_ID_TAKEN')
      /** @type {any} */ (err).code = 'CHATBOT_ID_TAKEN'
      throw err
    }
    throw e
  }
}

/** @returns {Promise<object | null>} */
export async function readRecordDb(id) {
  const pool = getPool()
  if (!pool) return null
  if (!/^\d{8}$/.test(String(id || ''))) return null
  const r = await pool.query('SELECT record_json FROM chatbot_contexts WHERE chatbot_id = $1', [String(id)])
  if (!r.rowCount) return null
  const j = r.rows[0].record_json
  return j && typeof j === 'object' ? j : null
}

export async function deleteRecordDb(id) {
  const pool = getPool()
  if (!pool) return
  if (!/^\d{8}$/.test(String(id || ''))) return
  await pool.query('DELETE FROM chatbot_contexts WHERE chatbot_id = $1', [String(id)])
}

/** @returns {Promise<string | null>} chatbot_id */
export async function resolveChatbotIdByPasswordHashDb(passwordLookupHash) {
  const pool = getPool()
  if (!pool) return null
  const r = await pool.query('SELECT chatbot_id FROM chatbot_contexts WHERE password_lookup_hash = $1 LIMIT 1', [
    passwordLookupHash,
  ])
  if (!r.rowCount) return null
  const cid = r.rows[0].chatbot_id
  return typeof cid === 'string' && /^\d{8}$/.test(cid) ? cid : null
}
