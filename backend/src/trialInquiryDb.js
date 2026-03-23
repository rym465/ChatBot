import { getPool, isDatabaseEnabled } from './dbPool.js'

async function ensureTrialInquiryTable(pool) {
  // Table should be created by SQL, but we keep this guard to avoid “endpoint shows nothing”.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.trial_inquiries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      name TEXT,
      email TEXT NOT NULL,
      phone TEXT,
      message TEXT,
      chatbot_id TEXT,
      CONSTRAINT trial_inquiries_chatbot_id_chk CHECK (
        chatbot_id IS NULL OR chatbot_id ~ '^\\d{8}$'
      )
    );
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_trial_inquiries_created_at ON public.trial_inquiries (created_at DESC);`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_trial_inquiries_email ON public.trial_inquiries (email);`)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_trial_inquiries_chatbot_id ON public.trial_inquiries (chatbot_id) WHERE chatbot_id IS NOT NULL;`,
  )
}

/**
 * @param {{ name: string, email: string, phone: string, message: string, chatbotId: string }} payload
 * @returns {Promise<string>} inserted row id
 */
export async function saveTrialInquiryDb(payload) {
  if (!isDatabaseEnabled()) throw new Error('Database not configured')
  const pool = getPool()
  if (!pool) throw new Error('Database not configured')

  await ensureTrialInquiryTable(pool)

  const name = typeof payload.name === 'string' ? payload.name : ''
  const email = typeof payload.email === 'string' ? payload.email : ''
  const phone = typeof payload.phone === 'string' ? payload.phone : ''
  const message = typeof payload.message === 'string' ? payload.message : ''
  const chatbotId = typeof payload.chatbotId === 'string' ? payload.chatbotId : ''

  const r = await pool.query(
    `INSERT INTO public.trial_inquiries (name, email, phone, message, chatbot_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [name, email, phone, message, chatbotId],
  )

  return String(r.rows[0]?.id || '')
}

