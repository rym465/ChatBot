/**
 * Chatbot secured context: Postgres (Supabase) when DATABASE_URL is set, else local JSON files + password index.
 * API routes stay the same; demo + test chat hit the same endpoints.
 */
import { isDatabaseEnabled } from './dbPool.js'
import * as db from './chatbotContextDb.js'
import * as fsStore from './chatbotContextStore.js'
import { hashPasswordForLookup, registerPasswordLookup, resolveChatbotIdByPassword } from './passwordLookup.js'

export async function allocateNewChatbotId() {
  if (isDatabaseEnabled()) return db.allocateNewChatbotIdDb()
  return fsStore.allocateNewId()
}

/**
 * @param {string} chatbotId
 * @param {string} password
 * @param {object} record
 */
export async function persistChatbotRecord(chatbotId, password, record) {
  const h = hashPasswordForLookup(password)
  if (isDatabaseEnabled()) {
    await db.saveRecordDb(chatbotId, record, h)
    return
  }
  fsStore.saveRecord(chatbotId, record)
  registerPasswordLookup(password, chatbotId)
}

/** @returns {Promise<object | null>} */
export async function readChatbotRecord(chatbotId) {
  if (isDatabaseEnabled()) return db.readRecordDb(chatbotId)
  return fsStore.readRecord(chatbotId)
}

export async function deleteChatbotRecord(chatbotId) {
  if (isDatabaseEnabled()) return db.deleteRecordDb(chatbotId)
  return fsStore.deleteRecord(chatbotId)
}

/** @returns {Promise<string | null>} */
export async function resolveChatbotIdByPasswordAsync(password) {
  if (isDatabaseEnabled()) {
    return db.resolveChatbotIdByPasswordHashDb(hashPasswordForLookup(password))
  }
  return resolveChatbotIdByPassword(password)
}

export { isDatabaseEnabled }
