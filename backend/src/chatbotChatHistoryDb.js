import { getPool } from './dbPool.js'

let schemaReady = false
let schemaInitPromise = null

/** Ensures `chatbot_chat_messages` exists (idempotent). Safe to call before admin aggregate queries. */
export async function ensureHistorySchema(pool) {
  if (schemaReady) return
  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.chatbot_chat_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          chatbot_id TEXT NOT NULL,
          thread_id UUID NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT chatbot_chat_messages_chatbot_id_chk CHECK (chatbot_id ~ '^\\d{8}$')
        )
      `)
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_chatbot_chat_messages_bot_created
          ON public.chatbot_chat_messages (chatbot_id, created_at ASC)
      `)
      schemaReady = true
    })().catch((err) => {
      schemaInitPromise = null
      throw err
    })
  }
  await schemaInitPromise
}

/**
 * @param {string} chatbotId
 * @param {string} threadId UUID
 * @param {string} userContent
 * @param {string} assistantContent
 * @returns {Promise<{ user: { id: string, createdAt: string }, assistant: { id: string, createdAt: string } }>}
 */
export async function appendExchangeDb(chatbotId, threadId, userContent, assistantContent) {
  const pool = getPool()
  if (!pool) throw new Error('Database not configured')
  if (!/^\d{8}$/.test(String(chatbotId || ''))) throw new Error('Invalid chatbot id')
  const tid = String(threadId || '').trim()
  if (!tid) throw new Error('Invalid thread id')
  await ensureHistorySchema(pool)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const u = await client.query(
      `INSERT INTO chatbot_chat_messages (chatbot_id, thread_id, role, content)
       VALUES ($1, $2::uuid, 'user', $3)
       RETURNING id, created_at`,
      [chatbotId, tid, userContent],
    )
    const a = await client.query(
      `INSERT INTO chatbot_chat_messages (chatbot_id, thread_id, role, content)
       VALUES ($1, $2::uuid, 'assistant', $3)
       RETURNING id, created_at`,
      [chatbotId, tid, assistantContent],
    )
    await client.query('COMMIT')
    const ur = u.rows[0]
    const ar = a.rows[0]
    return {
      user: { id: String(ur.id), createdAt: new Date(ur.created_at).toISOString() },
      assistant: { id: String(ar.id), createdAt: new Date(ar.created_at).toISOString() },
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/**
 * @param {string} chatbotId
 * @returns {Promise<Array<{ id: string, threadId: string, role: string, content: string, createdAt: string }>>}
 */
export async function listMessagesDb(chatbotId) {
  const pool = getPool()
  if (!pool) return []
  if (!/^\d{8}$/.test(String(chatbotId || ''))) return []
  await ensureHistorySchema(pool)
  const r = await pool.query(
    `SELECT id, thread_id AS "threadId", role, content, created_at AS "createdAt"
     FROM chatbot_chat_messages
     WHERE chatbot_id = $1
     ORDER BY created_at ASC, id ASC`,
    [chatbotId],
  )
  return (r.rows || []).map((row) => ({
    id: String(row.id),
    threadId: String(row.threadId),
    role: String(row.role),
    content: String(row.content),
    createdAt: new Date(row.createdAt).toISOString(),
  }))
}
