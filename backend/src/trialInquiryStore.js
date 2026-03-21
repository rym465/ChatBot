import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const INQUIRY_DIR = path.join(__dirname, '..', 'data', 'inquiries')

export function saveTrialInquiry(payload) {
  fs.mkdirSync(INQUIRY_DIR, { recursive: true })
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const file = path.join(INQUIRY_DIR, `${id}.json`)
  const doc = {
    savedAt: new Date().toISOString(),
    ...payload,
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2), 'utf8')
  return id
}
