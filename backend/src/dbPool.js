import pg from 'pg'

const { Pool } = pg

/**
 * PostgreSQL connection string.
 * Supports DATABASE_URL (preferred), plus common aliases from Supabase/Vercel/Neon.
 */
export function getDatabaseUrl() {
  return (
    String(
      process.env.DATABASE_URL ||
        process.env.POSTGRES_URL ||
        process.env.SUPABASE_DB_URL ||
        process.env.DATABASE_PUBLIC_URL ||
        '',
    )
      .trim()
      .replace(/^["']|["']$/g, '') || ''
  )
}

export function isDatabaseEnabled() {
  return getDatabaseUrl().length > 0
}

/** Safe subset of DATABASE_URL for logs (never includes password). */
export function describeDatabaseUrlForLog() {
  const raw = getDatabaseUrl()
  if (!raw) return { configured: false }
  try {
    const u = new URL(raw.replace(/^postgres(ql)?:/i, 'http:'))
    const user = decodeURIComponent(u.username || '')
    return {
      configured: true,
      host: u.hostname || '(missing)',
      port: u.port || '(default)',
      user,
      database: (u.pathname || '').replace(/^\//, '') || '(default)',
      userLooksLikeSessionPooler: /^postgres\.[a-z0-9]+$/i.test(user),
    }
  } catch {
    return { configured: true, parseError: true }
  }
}

let pool = null

export function getPool() {
  if (!isDatabaseEnabled()) return null
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      // Shorter idle eviction so we do not hand out TCP sockets the host DB already closed
      // (common after long Puppeteer work between queries, e.g. integration-bootstrap re-crawl).
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 25_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
    })
    pool.on('error', (err) => {
      console.error('[db] unexpected pool error', err)
    })
  }
  return pool
}

export async function dbHealthCheck() {
  const p = getPool()
  if (!p) return { ok: false, reason: 'no DATABASE_URL' }
  try {
    const r = await p.query('SELECT 1 AS ok')
    return { ok: r.rows[0]?.ok === 1 }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
