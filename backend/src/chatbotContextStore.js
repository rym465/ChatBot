import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data', 'chatbots')

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

/** 8-digit numeric ID, range [10000000, 99999999] */
export function randomEightDigitId() {
  const n = crypto.randomInt(10_000_000, 100_000_000)
  return String(n)
}

export function idExists(id) {
  return fs.existsSync(path.join(DATA_DIR, `${id}.json`))
}

export function allocateNewId() {
  ensureDataDir()
  for (let i = 0; i < 200; i++) {
    const id = randomEightDigitId()
    if (!idExists(id)) return id
  }
  throw new Error('Could not allocate a unique chatbot ID')
}

/**
 * @param {string} id
 * @param {object} record Serializable JSON (no secrets in plaintext beyond metadata)
 */
export function saveRecord(id, record) {
  ensureDataDir()
  const p = path.join(DATA_DIR, `${id}.json`)
  if (fs.existsSync(p)) {
    const err = new Error('CHATBOT_ID_TAKEN')
    /** @type {any} */ (err).code = 'CHATBOT_ID_TAKEN'
    throw err
  }
  fs.writeFileSync(p, JSON.stringify(record, null, 2), 'utf8')
}

/** @returns {object | null} */
export function readRecord(id) {
  if (!/^\d{8}$/.test(String(id || ''))) return null
  const p = path.join(DATA_DIR, `${String(id)}.json`)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

export function deleteRecord(id) {
  if (!/^\d{8}$/.test(String(id || ''))) return
  const p = path.join(DATA_DIR, `${String(id)}.json`)
  if (fs.existsSync(p)) fs.unlinkSync(p)
}
