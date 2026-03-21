import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function useEphemeralDefault() {
  const v = process.env.VERCEL
  if (v === '1' || String(v).toLowerCase() === 'true') return true
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true
  return false
}

/**
 * Root folder for `chatbots/` and `inquiries/` JSON files.
 * Set CONTEXT_DATA_DIR (absolute path) on read-only images (Docker) or to attach a volume.
 * On Vercel / Lambda defaults to os.tmpdir() (ephemeral).
 */
let cachedDataRoot = null

export function getDataRoot() {
  if (cachedDataRoot !== null) return cachedDataRoot

  const fromEnv = process.env.CONTEXT_DATA_DIR || process.env.DATA_ROOT
  if (fromEnv && String(fromEnv).trim()) {
    cachedDataRoot = path.resolve(String(fromEnv).trim())
    return cachedDataRoot
  }
  if (useEphemeralDefault()) {
    cachedDataRoot = path.join(os.tmpdir(), 'wl-chatbot-data')
    return cachedDataRoot
  }
  const local = path.join(__dirname, '..', 'data')
  try {
    fs.mkdirSync(path.join(local, 'chatbots'), { recursive: true })
    fs.accessSync(local, fs.constants.W_OK)
    cachedDataRoot = local
  } catch {
    cachedDataRoot = path.join(os.tmpdir(), 'wl-chatbot-data')
  }
  return cachedDataRoot
}

export function getChatbotsDir() {
  return path.join(getDataRoot(), 'chatbots')
}

export function getInquiriesDir() {
  return path.join(getDataRoot(), 'inquiries')
}
