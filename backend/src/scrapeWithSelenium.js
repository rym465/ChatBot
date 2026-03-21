import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Builder, Browser } from 'selenium-webdriver'
import chrome from 'selenium-webdriver/chrome.js'
import { cleanWebsiteText } from './textUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.join(__dirname, '..')

const PAGE_LOAD_MS = 60000
const EXTRA_SPA_WAIT_MS = 3500

/** Combined text from all crawled pages (cap) */
const DEFAULT_MAX_TOTAL_CHARS = Math.min(
  Number(process.env.SCRAPE_MAX_TOTAL_CHARS) || 450_000,
  900_000,
)
const DEFAULT_MAX_PAGES = Math.min(Math.max(Number(process.env.SCRAPE_MAX_PAGES) || 50, 1), 200)
const DEFAULT_MAX_DEPTH = Math.min(Math.max(Number(process.env.SCRAPE_MAX_DEPTH) || 5, 0), 12)

/** Skip obvious non-HTML assets and noisy admin paths */
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

/**
 * Chrome and ChromeDriver major versions must match.
 */
function resolveChromeDriverPath() {
  const envPath = process.env.CHROMEDRIVER_PATH
  if (envPath && fs.existsSync(envPath)) return envPath

  const useBundled =
    process.env.USE_BUNDLED_CHROMEDRIVER === '1' ||
    process.env.USE_BUNDLED_CHROMEDRIVER === 'true'
  if (!useBundled) return null

  const candidates = [
    path.join(BACKEND_ROOT, 'chromedriver.exe'),
    path.join(BACKEND_ROOT, 'chromedriver'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
}

function resolveChromeBinaryPath() {
  const env = process.env.CHROME_BIN || process.env.GOOGLE_CHROME_BIN
  if (env && fs.existsSync(env)) return env

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      local ? path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
    ].filter(Boolean)
    for (const p of candidates) {
      if (fs.existsSync(p)) return p
    }
  } else if (process.platform === 'darwin') {
    const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    if (fs.existsSync(p)) return p
  } else {
    for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium']) {
      if (fs.existsSync(p)) return p
    }
  }
  return null
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

async function waitForDocumentReady(driver) {
  await driver
    .executeAsyncScript(`
    const done = arguments[arguments.length - 1];
    const deadline = Date.now() + 55000;
    (function wait() {
      if (document.readyState === 'complete') {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { done(); });
        });
        return;
      }
      if (Date.now() > deadline) {
        done();
        return;
      }
      setTimeout(wait, 50);
    })();
  `)
    .catch(() => {})
}

async function scrollForLazyContent(driver) {
  await driver
    .executeScript(`
    return new Promise(function (resolve) {
      try {
        var y = 0;
        var step = Math.max(400, Math.floor(window.innerHeight * 0.85));
        var max = Math.min((document.documentElement.scrollHeight || 0) + 2000, 25000);
        var id = setInterval(function () {
          y += step;
          window.scrollTo(0, y);
          if (y >= max) {
            clearInterval(id);
            window.scrollTo(0, 0);
            setTimeout(resolve, 400);
          }
        }, 150);
      } catch (e) {
        resolve();
      }
    });
  `)
    .catch(() => {})
}

async function extractVisibleText(driver) {
  const rawText = await driver.executeScript(`
    var root = document.body;
    if (!root) return '';
    return (root.innerText != null ? root.innerText : root.textContent) || '';
  `)
  return cleanWebsiteText(String(rawText || ''))
}

/**
 * Best-effort brand logo from the live page (first page / home only).
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {string} pageUrlForFallback — page URL for /favicon.ico fallback
 * @returns {Promise<string | null>} absolute https? URL
 */
async function extractBrandLogoUrl(driver, pageUrlForFallback) {
  const candidates = await driver
    .executeScript(`
    function abs(u) {
      try { return new URL(u, document.baseURI).href; } catch (e) { return null; }
    }
    var out = [];
    function add(u) {
      if (!u || typeof u !== 'string') return;
      u = u.trim();
      if (!u || out.indexOf(u) !== -1) return;
      out.push(u);
    }
    var apple = document.querySelector('link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]');
    if (apple) add(abs(apple.getAttribute('href')));
    var og = document.querySelector('meta[property="og:image"], meta[property="og:image:url"]');
    if (og) add(abs(og.getAttribute('content')));
    var tw = document.querySelector('meta[name="twitter:image"], meta[name="twitter:image:src"]');
    if (tw) add(abs(tw.getAttribute('content')));
    var icons = document.querySelectorAll('link[rel~="icon" i], link[rel="shortcut icon" i]');
    for (var i = 0; i < icons.length; i++) add(abs(icons[i].getAttribute('href')));
    return out;
  `)
    .catch(() => [])

  const list = Array.isArray(candidates)
    ? candidates.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
    : []
  if (list.length > 0) return list[0]

  try {
    const base = new URL(pageUrlForFallback)
    return new URL('/favicon.ico', base.origin).href
  } catch {
    return null
  }
}

async function extractSameOriginLinks(driver, pageOrigin) {
  const hrefs = await driver.executeScript(`
    var out = [];
    var seen = {};
    var nodes = document.querySelectorAll('a[href]');
    for (var i = 0; i < nodes.length; i++) {
      var h = nodes[i].href;
      if (h && !seen[h]) {
        seen[h] = 1;
        out.push(h);
      }
    }
    return out;
  `)
  if (!Array.isArray(hrefs)) return []
  const next = []
  for (const h of hrefs) {
    if (typeof h !== 'string') continue
    if (!sameOrigin(h, pageOrigin)) continue
    const c = canonicalPageUrl(h)
    if (!c) continue
    let u
    try {
      u = new URL(c)
    } catch {
      continue
    }
    if (shouldSkipUrl(u)) continue
    next.push(c)
  }
  return next
}

async function buildDriver() {
  const options = new chrome.Options()
  const chromePath = resolveChromeBinaryPath()
  if (chromePath) {
    options.setChromeBinaryPath(chromePath)
  }
  options.addArguments(
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--window-size=1920,1080',
    '--disable-blink-features=AutomationControlled',
    '--lang=en-US,en',
    '--ignore-certificate-errors',
  )

  const driverPath = resolveChromeDriverPath()
  let builder = new Builder().forBrowser(Browser.CHROME).setChromeOptions(options)

  if (driverPath) {
    const service = new chrome.ServiceBuilder(driverPath)
    builder = builder.setChromeService(service)
  }

  const driver = await builder.build()
  await driver.manage().setTimeouts({
    pageLoad: PAGE_LOAD_MS,
    script: PAGE_LOAD_MS,
    implicit: 0,
  })
  return driver
}

/**
 * Crawl same-origin pages (BFS), starting from seed URL. One Chrome session.
 * @param {string} seedUrlString
 * @param {{ maxPages?: number, maxDepth?: number, maxTotalChars?: number }} [opts]
 */
export async function crawlWebsite(seedUrlString, opts = {}) {
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

  const driver = await buildDriver()

  try {
    while (queue.length > 0 && urlsVisited.length < maxPages && !truncated) {
      const { url: currentRaw, depth } = queue.shift()
      const current = canonicalPageUrl(currentRaw)
      if (!current || !sameOrigin(current, origin)) continue

      const key = current
      queued.delete(key)
      if (visited.has(key)) continue
      visited.add(key)

      try {
        await driver.get(current)
        await waitForDocumentReady(driver)
        await driver.sleep(EXTRA_SPA_WAIT_MS)
        await scrollForLazyContent(driver)
        await driver.sleep(500)

        const title = String((await driver.getTitle().catch(() => '')) || '').trim()
        if (!firstTitle) firstTitle = title

        if (logoUrl == null && urlsVisited.length === 0) {
          logoUrl = await extractBrandLogoUrl(driver, current).catch(() => null)
        }

        const text = await extractVisibleText(driver)
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
          const links = await extractSameOriginLinks(driver, origin)
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
      } catch (err) {
        console.warn('[crawl] skip page', current, err && err.message)
      }
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
        engine: 'selenium',
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
  } finally {
    await driver.quit().catch(() => {})
  }
}

/**
 * @deprecated Use crawlWebsite — kept for tests/tools that need one URL only.
 */
export async function scrapeVisibleText(urlString) {
  return crawlWebsite(urlString, { maxPages: 1, maxDepth: 0 })
}
