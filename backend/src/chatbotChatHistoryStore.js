import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getDataRoot } from './dataPaths.js'

function historyDir() {
  const d = path.join(getDataRoot(), 'chat-history')
  fs.mkdirSync(d, { recursive: true })
  return d
}

function filePath(chatbotId) {
  return path.join(historyDir(), `${chatbotId}.json`)
}

function readFile(chatbotId) {
  const p = filePath(chatbotId)
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const j = JSON.parse(raw)
    if (j && Array.isArray(j.messages)) return j.messages
  } catch {
    /* missing or corrupt */
  }
  return []
}

function writeFile(chatbotId, messages) {
  const p = filePath(chatbotId)
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ messages }, null, 0), 'utf8')
  fs.renameSync(tmp, p)
}

/**
 * @param {string} chatbotId
 * @param {string} threadId
 * @param {string} userContent
 * @param {string} assistantContent
 */
export function appendExchangeFs(chatbotId, threadId, userContent, assistantContent) {
  if (!/^\d{8}$/.test(String(chatbotId || ''))) throw new Error('Invalid chatbot id')
  const tid = String(threadId || '').trim()
  if (!tid) throw new Error('Invalid thread id')
  const now = () => new Date().toISOString()
  const messages = readFile(chatbotId)
  const user = { id: crypto.randomUUID(), threadId: tid, role: 'user', content: userContent, createdAt: now() }
  const assistant = {
    id: crypto.randomUUID(),
    threadId: tid,
    role: 'assistant',
    content: assistantContent,
    createdAt: now(),
  }
  messages.push(user, assistant)
  const max = 5000
  while (messages.length > max) messages.shift()
  writeFile(chatbotId, messages)
  return {
    user: { id: user.id, createdAt: user.createdAt },
    assistant: { id: assistant.id, createdAt: assistant.createdAt },
  }
}

/** @param {string} chatbotId */
export function listMessagesFs(chatbotId) {
  if (!/^\d{8}$/.test(String(chatbotId || ''))) return []
  return readFile(chatbotId).map((m) => ({
    id: String(m.id),
    threadId: String(m.threadId),
    role: String(m.role),
    content: String(m.content),
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date(m.createdAt).toISOString(),
  }))
}
