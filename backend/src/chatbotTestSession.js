import crypto from 'crypto'

const SESSION_TTL_MS = 2 * 60 * 60 * 1000
const MAX_HISTORY_MESSAGES = 24

/** @type {Map<string, { inner: object, history: { role: string, content: string }[], expiresAt: number }>} */
const sessions = new Map()

function cleanup() {
  const now = Date.now()
  for (const [id, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(id)
  }
}

/**
 * @param {object} inner Decrypted payload from stored bundle
 * @param {string} trialEndsAt ISO timestamp — chat blocked after this instant
 */
export function createTestSession(inner, trialEndsAt) {
  cleanup()
  const sessionId = crypto.randomBytes(32).toString('base64url')
  sessions.set(sessionId, {
    inner,
    history: [],
    expiresAt: Date.now() + SESSION_TTL_MS,
    trialEndsAt: typeof trialEndsAt === 'string' ? trialEndsAt : new Date(trialEndsAt).toISOString(),
  })
  return sessionId
}

export function getTestSession(sessionId) {
  cleanup()
  const s = sessions.get(sessionId)
  if (!s || s.expiresAt < Date.now()) {
    sessions.delete(sessionId)
    return null
  }
  s.expiresAt = Date.now() + SESSION_TTL_MS
  return s
}

/**
 * @param {{ history: { role: string, content: string }[] }} s
 * @param {string} userContent
 * @param {string} assistantContent
 */
export function pushExchange(s, userContent, assistantContent) {
  s.history.push({ role: 'user', content: userContent })
  s.history.push({ role: 'assistant', content: assistantContent })
  while (s.history.length > MAX_HISTORY_MESSAGES) {
    s.history.shift()
  }
}
