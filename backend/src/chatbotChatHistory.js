import { isDatabaseEnabled } from './dbPool.js'
import * as db from './chatbotChatHistoryDb.js'
import * as fsStore from './chatbotChatHistoryStore.js'

export async function appendChatExchange(chatbotId, threadId, userContent, assistantContent) {
  if (isDatabaseEnabled()) {
    return db.appendExchangeDb(chatbotId, threadId, userContent, assistantContent)
  }
  return fsStore.appendExchangeFs(chatbotId, threadId, userContent, assistantContent)
}

/** @param {string} chatbotId */
export async function listChatMessages(chatbotId) {
  if (isDatabaseEnabled()) return db.listMessagesDb(chatbotId)
  return fsStore.listMessagesFs(chatbotId)
}
