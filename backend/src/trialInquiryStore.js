import fs from 'fs'
import path from 'path'
import { getInquiriesDir } from './dataPaths.js'
import { isDatabaseEnabled } from './dbPool.js'
import { saveTrialInquiryDb } from './trialInquiryDb.js'

export async function saveTrialInquiry(payload) {
  if (isDatabaseEnabled()) {
    return saveTrialInquiryDb(payload)
  }
  const dir = getInquiriesDir()
  fs.mkdirSync(dir, { recursive: true })
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const file = path.join(dir, `${id}.json`)
  const doc = {
    savedAt: new Date().toISOString(),
    ...payload,
  }
  fs.writeFileSync(file, JSON.stringify(doc, null, 2), 'utf8')
  return id
}
