import { load } from 'cheerio'
import { cleanWebsiteText } from './textUtils.js'

const FETCH_TIMEOUT_MS = Math.min(Math.max(Number(process.env.SCRAPE_FETCH_TIMEOUT_MS) || 45000, 5000), 120000)
const USER_AGENT =
  process.env.SCRAPE_USER_AGENT?.trim() ||
  'Mozilla/5.0 (compatible; WhiteLabelChatbotDemo/1.0; +https://github.com) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const DEFAULT_MAX_TOTAL_CHARS = Math.min(
  Number(process.env.SCRAPE_MAX_TOTAL_CHARS) || 450_000,
  900_000,
)
const DEFAULT_MAX_PAGES = Math.min(Math.max(Number(process.env.SCRAPE_MAX_PAGES) || 50, 1), 200)
const DEFAULT_MAX_DEPTH = Math.min(Math.max(Number(process.env.SCRAPE_MAX_DEPTH) || 5, 0), 12)

const SKIP_FILE_RE =
  /\.(pdf|jpe?g|png|gif|webp|svg|ico|zip|rar|7z|mp4|mp3|wav|css|js|mjs|map|json|xml|txt|woff2?|ttf|eot)(\?|$)/i

function adminNoisePath(pathname) {
  const p = pathname.toLowerCase()
  return (
    p.includes('/wp-admin') ||
    p.includes('/wp-login') ||
    p.includes('/wp-includes') ||
    p.includes('/wp-content/plugins') ||
    p.includes('/checkout') ||
    p.includes('/cart') ||
    p.includes('/my-account')
  )
}

function canonicalPageUrl(href) {
  let u
  try {
    u = new URL(href)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  u.hash = ''
  u.hostname = u.hostname.toLowerCase()
  let p = u.pathname
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  u.pathname = p || '/'
  return u.href
}

function sameOrigin(a, originStr) {
  try {
    return new URL(a).origin === originStr
  } catch {
    return false
  }
}

function shouldSkipUrl(urlObj) {
  const path = urlObj.pathname + urlObj.search
  if (SKIP_FILE_RE.test(path)) return true
  if (adminNoisePath(urlObj.pathname)) return true
  return false
}

function absUrl(href, baseHref) {
  try {
    return new URL(href, baseHref).href
  } catch {
    return null
  }
}

function extractTitle($) {
  const og = $('meta[property="og:title"]').attr('content')
  if (og && og.trim()) return og.trim()
  const t = $('title').first().text()
  return String(t || '').trim()
}

function extractText($) {
  $('script, style, noscript, svg, iframe, template').remove()
  const body = $('body')
  const raw = body.length ? body.text() : $.root().text()
  return cleanWebsiteText(String(raw || ''))
}

/** @param {*} $ cheerio root */
function extractBrandLogoUrl($, pageUrlForFallback) {
  const candidates = []
  const add = (u) => {
    if (u && typeof u === 'string' && /^https?:\/\//i.test(u) && !candidates.includes(u)) candidates.push(u)
  }

  const apple = $('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]').first()
  const appleH = apple.attr('href')
  if (appleH) add(absUrl(appleH, pageUrlForFallback))

  const og = $('meta[property="og:image"], meta[property="og:image:url"]').first().attr('content')
  if (og) add(absUrl(og, pageUrlForFallback))

  const tw = $('meta[name="twitter:image"], meta[name="twitter:image:src"]').first().attr('content')
  if (tw) add(absUrl(tw, pageUrlForFallback))

  $('link[rel~="icon" i], link[rel="shortcut icon" i]').each((_, el) => {
    const h = $(el).attr('href')
    if (h) add(absUrl(h, pageUrlForFallback))
  })

  if (candidates.length) return candidates[0]
  try {
    const base = new URL(pageUrlForFallback)
    return new URL('/favicon.ico', base.origin).href
  } catch {
    return null
  }
}

function extractSameOriginLinks($, baseUrl, pageOrigin) {
  const next = []
  const seen = new Set()
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return
    const abs = absUrl(href, baseUrl)
    if (!abs || !sameOrigin(abs, pageOrigin)) return
    const c = canonicalPageUrl(abs)
    if (!c) return
    let u
    try {
      u = new URL(c)
    } catch {
      return
    }
    if (shouldSkipUrl(u)) return
    if (seen.has(c)) return
    seen.add(c)
    next.push(c)
  })
  return next
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} fetching ${url}`)
    err.status = res.status
    throw err
  }
  const ct = (res.headers.get('content-type') || '').toLowerCase()
  if (!ct.includes('text/html') && !ct.includes('application/xhtml') && !ct.includes('application/xml')) {
    const err = new Error(`Not HTML (${ct || 'unknown type'}) at ${url}`)
    err.notHtml = true
    throw err
  }
  return res.text()
}

/**
 * Same-origin BFS without a browser (works on hosts without Chrome).
 * @param {string} seedUrlString
 * @param {{ maxPages?: number, maxDepth?: number, maxTotalChars?: number }} [opts]
 */
export async function crawlWebsiteHttp(seedUrlString, opts = {}) {
  const seed = canonicalPageUrl(seedUrlString)
  if (!seed) throw new Error('Invalid seed URL')

  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxTotalChars = opts.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS

  const origin = new URL(seed).origin
  const queue = [{ url: seed, depth: 0 }]
  const visited = new Set()
  const queued = new Set([seed])

  const parts = []
  const urlsVisited = []
  let totalLen = 0
  let truncated = false
  let firstTitle = ''
  /** @type {string | null} */
  let logoUrl = null
  let firstPageError = null

  while (queue.length > 0 && urlsVisited.length < maxPages && !truncated) {
    const { url: currentRaw, depth } = queue.shift()
    const current = canonicalPageUrl(currentRaw)
    if (!current || !sameOrigin(current, origin)) continue

    const key = current
    queued.delete(key)
    if (visited.has(key)) continue
    visited.add(key)

    let html
    try {
      html = await fetchHtml(current)
    } catch (err) {
      const detail =
        err instanceof Error
          ? err.cause instanceof Error
            ? `${err.message} (${err.cause.message})`
            : err.message
          : String(err)
      console.warn('[crawl-http] skip page', current, detail)
      if (urlsVisited.length === 0) firstPageError = err
      continue
    }

    const $ = load(html)
    const title = extractTitle($)
    if (!firstTitle) firstTitle = title

    if (logoUrl == null && urlsVisited.length === 0) {
      logoUrl = extractBrandLogoUrl($, current)
    }

    const text = extractText($)
    const block = `=== PAGE: ${current} ===\n${text}\n\n`
    urlsVisited.push(current)

    if (totalLen + block.length > maxTotalChars) {
      const room = maxTotalChars - totalLen
      if (room > 200) {
        parts.push(block.slice(0, room))
        totalLen += room
      }
      truncated = true
      break
    }

    parts.push(block)
    totalLen += block.length

    if (depth < maxDepth && urlsVisited.length < maxPages && !truncated) {
      const links = extractSameOriginLinks($, current, origin)
      for (const link of links) {
        const c = canonicalPageUrl(link)
        if (!c || visited.has(c) || queued.has(c)) continue
        let u
        try {
          u = new URL(c)
        } catch {
          continue
        }
        if (shouldSkipUrl(u)) continue
        queued.add(c)
        queue.push({ url: c, depth: depth + 1 })
      }
    }
  }

  if (urlsVisited.length === 0) {
    const hint =
      firstPageError instanceof Error
        ? firstPageError.message
        : 'Could not download the homepage (network or blocking).'
    throw new Error(`HTTP scrape failed: ${hint}`)
  }

  let combined = parts.join('')
  if (truncated) {
    combined +=
      '\n\n--- [Crawl truncated: hit SCRAPE_MAX_TOTAL_CHARS or internal cap; raise SCRAPE_MAX_TOTAL_CHARS if needed] ---'
  }

  const rawLengthApprox = parts.reduce((n, p) => n + p.length, 0)

  return {
    title: firstTitle || new URL(seed).hostname,
    text: combined,
    rawLength: rawLengthApprox,
    crawl: {
      engine: 'http',
      seedUrl: seed,
      pagesVisited: urlsVisited.length,
      urlsVisited,
      maxPages,
      maxDepth,
      truncated,
      sameOrigin: origin,
      logoUrl,
    },
  }
}
