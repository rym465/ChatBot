/**
 * Vercel serverless: proxies /api/* → your Node backend (BACKEND_URL in Vercel env).
 * vercel.json: /api/:path* → /api/proxy?fwd=:path*
 */

export const config = {
  maxDuration: 300,
}

const HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
])

function forwardHeaders(req) {
  const out = {}
  for (const [k, v] of Object.entries(req.headers)) {
    if (!v) continue
    const key = k.toLowerCase()
    if (HOP.has(key)) continue
    out[key] = Array.isArray(v) ? v.join(', ') : v
  }
  return out
}

export default async function handler(req, res) {
  const raw = process.env.BACKEND_URL || process.env.VITE_API_BASE || ''
  const backend = String(raw).trim().replace(/\/$/, '')
  if (!backend) {
    return res.status(503).json({
      ok: false,
      error:
        'Vercel proxy: set BACKEND_URL (or VITE_API_BASE) to your Node API origin, e.g. https://your-app.onrender.com',
    })
  }

  let fwd = req.query.fwd
  if (Array.isArray(fwd)) fwd = fwd[0]
  fwd = typeof fwd === 'string' ? fwd.trim() : ''
  if (!fwd) {
    return res.status(400).json({ ok: false, error: 'Missing proxy path (fwd)' })
  }

  const pathSeg = fwd.startsWith('/') ? fwd.slice(1) : fwd
  const targetPath = `/api/${pathSeg}`
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k === 'fwd') continue
    if (v === undefined) continue
    const val = Array.isArray(v) ? v[0] : v
    if (val != null && String(val) !== '') q.set(k, String(val))
  }
  const qs = q.toString() ? `?${q.toString()}` : ''
  const target = `${backend}${targetPath}${qs}`

  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (typeof req.body === 'string') body = req.body
    else if (Buffer.isBuffer(req.body)) body = req.body
    else if (req.body !== undefined && req.body !== null) body = JSON.stringify(req.body)
  }

  try {
    const r = await fetch(target, {
      method: req.method,
      headers: forwardHeaders(req),
      body: body === undefined ? undefined : body,
      redirect: 'manual',
    })

    const ct = r.headers.get('content-type') || 'application/json; charset=utf-8'
    res.status(r.status).setHeader('content-type', ct)

    const buf = Buffer.from(await r.arrayBuffer())
    res.send(buf)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[api proxy]', target, msg)
    res.status(502).json({ ok: false, error: `Proxy to backend failed: ${msg}` })
  }
}
