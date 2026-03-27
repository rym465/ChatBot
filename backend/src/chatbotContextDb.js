import crypto from 'crypto'
import { getPool } from './dbPool.js'

/**
 * Hosted Postgres often closes idle connections; long work (e.g. scrapes) between queries
 * can leave pool slots stale. Retry a few times with backoff on transient disconnects.
 * @param {import('pg').Pool} pool
 * @param {string} text
 * @param {any[] | undefined} params
 */
async function queryWithRetry(pool, text, params, attempts = 4) {
  let last
  for (let i = 0; i < attempts; i++) {
    try {
      return params === undefined ? await pool.query(text) : await pool.query(text, params)
    } catch (e) {
      last = e
      const msg = e instanceof Error ? e.message : String(e)
      const code = e && typeof e === 'object' && 'code' in e ? String(/** @type {any} */ (e).code) : ''
      const transient =
        /connection terminated|connection timeout|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg) ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT'
      if (transient && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 250 * (i + 1)))
        continue
      }
      throw e
    }
  }
  throw last
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function idExistsDb(id) {
  const pool = getPool()
  if (!pool) return false
  const r = await queryWithRetry(pool, 'SELECT 1 FROM chatbot_contexts WHERE chatbot_id = $1 LIMIT 1', [id])
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
    await queryWithRetry(
      pool,
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
  const r = await queryWithRetry(pool, 'SELECT record_json FROM chatbot_contexts WHERE chatbot_id = $1', [String(id)])
  if (!r.rowCount) return null
  const j = r.rows[0].record_json
  return j && typeof j === 'object' ? j : null
}

export async function deleteRecordDb(id) {
  const pool = getPool()
  if (!pool) return
  if (!/^\d{8}$/.test(String(id || ''))) return
  await queryWithRetry(pool, 'DELETE FROM chatbot_contexts WHERE chatbot_id = $1', [String(id)])
}

/**
 * @param {string} id
 * @param {object} record
 */
export async function updateRecordJsonDb(id, record) {
  const pool = getPool()
  if (!pool) throw new Error('Database not configured')
  if (!/^\d{8}$/.test(String(id || ''))) throw new Error('Invalid chatbot id')
  const r = await queryWithRetry(
    pool,
    `UPDATE chatbot_contexts SET record_json = $2::jsonb, updated_at = now() WHERE chatbot_id = $1`,
    [String(id), JSON.stringify(record)],
  )
  if (r.rowCount === 0) throw new Error('CHATBOT_NOT_FOUND')
}

/** @returns {Promise<string | null>} chatbot_id */
export async function resolveChatbotIdByPasswordHashDb(passwordLookupHash) {
  const pool = getPool()
  if (!pool) return null
  const r = await queryWithRetry(pool, 'SELECT chatbot_id FROM chatbot_contexts WHERE password_lookup_hash = $1 LIMIT 1', [
    passwordLookupHash,
  ])
  if (!r.rowCount) return null
  const cid = r.rows[0].chatbot_id
  return typeof cid === 'string' && /^\d{8}$/.test(cid) ? cid : null
}
