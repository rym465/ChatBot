import { getPool, isDatabaseEnabled } from './dbPool.js'
import { hashAdminPassword, verifyAdminPasswordHash } from './adminPasswordHash.js'

/**
 * Run in Vercel Postgres / Supabase SQL editor if you prefer not to rely on auto-DDL.
 * @see ../sql/admin_users.sql
 */
export async function ensureAdminUsersTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.admin_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL
    );
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email_lower ON public.admin_users (LOWER(email));
  `)
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} emailNorm lowercased trimmed
 */
export async function getAdminUserByEmail(pool, emailNorm) {
  const email = String(emailNorm || '').trim().toLowerCase()
  if (!email) return null
  const r = await pool.query(
    `SELECT id, email, password_hash, created_at, updated_at
     FROM public.admin_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email],
  )
  return r.rows[0] || null
}

export async function adminUserExists(pool, emailNorm) {
  const row = await getAdminUserByEmail(pool, emailNorm)
  return !!row
}

/**
 * First account (for auth-info hint when multiple exist).
 */
export async function getFirstAdminEmail(pool) {
  const r = await pool.query(
    `SELECT email FROM public.admin_users ORDER BY created_at ASC LIMIT 1`,
  )
  const em = r.rows[0]?.email
  return typeof em === 'string' && em.includes('@') ? em.trim().toLowerCase() : null
}

export async function countAdminUsers(pool) {
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM public.admin_users`)
  return Number(r.rows[0]?.n || 0)
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} email
 * @param {string} plainPassword
 */
export async function insertAdminUser(pool, email, plainPassword) {
  const em = String(email || '').trim().toLowerCase()
  if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw new Error('Invalid email')
  const hash = hashAdminPassword(plainPassword)
  const r = await pool.query(
    `INSERT INTO public.admin_users (email, password_hash) VALUES ($1, $2)
     RETURNING id, email, created_at`,
    [em, hash],
  )
  return r.rows[0]
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} emailNorm
 * @param {string} plainPassword
 */
export async function updateAdminUserPassword(pool, emailNorm, plainPassword) {
  const em = String(emailNorm || '').trim().toLowerCase()
  if (!em) throw new Error('Invalid email')
  const hash = hashAdminPassword(plainPassword)
  const r = await pool.query(
    `UPDATE public.admin_users SET password_hash = $2, updated_at = now() WHERE LOWER(email) = LOWER($1)`,
    [em, hash],
  )
  if (r.rowCount < 1) throw new Error('Admin user not found')
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} email
 * @param {string} plainPassword
 */
export async function verifyAdminLogin(pool, email, plainPassword) {
  const row = await getAdminUserByEmail(pool, email)
  if (!row) return { ok: false }
  const ok = verifyAdminPasswordHash(plainPassword, row.password_hash)
  if (!ok) return { ok: false }
  return { ok: true, email: String(row.email).trim().toLowerCase() }
}

/**
 * When table is empty, insert one admin from env / legacy defaults (migration from file-based auth).
 * @param {import('pg').Pool} pool
 * @param {{ email: string, plainPassword: string }} seed
 */
export async function seedAdminUserIfEmpty(pool, seed) {
  const n = await countAdminUsers(pool)
  if (n > 0) return { seeded: false }
  const email = String(seed?.email || '').trim().toLowerCase()
  const pw = String(seed?.plainPassword || '')
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || pw.length < 8) {
    return { seeded: false, skipReason: 'invalid_seed' }
  }
  try {
    await insertAdminUser(pool, email, pw)
    return { seeded: true, email }
  } catch (e) {
    if (e && e.code === '23505') return { seeded: false }
    throw e
  }
}

export function isAdminDbAuthAvailable() {
  return isDatabaseEnabled() && !!getPool()
}
