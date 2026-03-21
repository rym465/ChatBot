const MAX_SCRAPE_IN_PROMPT = 72_000

function hashString(s) {
  let h = 2166136261
  const str = String(s || '')
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Deterministic “brand” colors from site URL + name so each client’s widget feels unique.
 * @param {object} inner
 */
export function deriveChatTheme(inner) {
  const structured = inner.structuredContext && typeof inner.structuredContext === 'object' ? inner.structuredContext : null
  const nameRaw =
    (structured && structured.inferredBusinessName) ||
    inner.pageTitle ||
    (() => {
      try {
        return new URL(inner.websiteUrl || 'https://example.com').hostname.replace(/^www\./, '')
      } catch {
        return 'Assistant'
      }
    })()
  const chatbotName = String(nameRaw || 'Assistant').trim().slice(0, 72) || 'Assistant'

  const logoRaw = inner.crawl && typeof inner.crawl.logoUrl === 'string' ? inner.crawl.logoUrl.trim() : ''
  const logoUrl = logoRaw && /^https?:\/\//i.test(logoRaw) ? logoRaw : null

  const displayHost = inner.websiteUrl
    ? String(inner.websiteUrl).replace(/^https?:\/\//, '').split('/')[0].slice(0, 64)
    : ''

  const seed = hashString(`${inner.websiteUrl || ''}|${chatbotName}`)
  const h1 = seed % 360
  const h2 = (seed * 31 + 107) % 360

  return {
    chatbotName,
    logoUrl,
    displayHost: displayHost || null,
    colors: {
      headerBg: `hsl(${h1} 58% 38%)`,
      headerText: '#ffffff',
      accent: `hsl(${h2} 65% 48%)`,
      accentSoft: `hsl(${h2} 45% 94%)`,
      surface: `hsl(${h1} 28% 97%)`,
      surfaceBorder: `hsl(${h1} 18% 88%)`,
      userBubble: `hsl(${h2} 42% 92%)`,
      botBubble: '#ffffff',
      text: `hsl(${h1} 28% 16%)`,
      textMuted: `hsl(${h1} 14% 42%)`,
      inputBorder: `hsl(${h1} 20% 82%)`,
      sendBg: `hsl(${h2} 58% 44%)`,
      sendText: '#ffffff',
    },
  }
}

/**
 * @param {object} inner
 * @param {object | null} platformContact — support / provider contact when users ask about the chat platform
 */
export function buildChatSystemPrompt(inner, platformContact = null) {
  const parts = []
  parts.push(
    `You are the customer-facing chat assistant for this business. Answer clearly and helpfully using ONLY the knowledge below (structured summary, private operator notes if any, and website text).`,
  )
  parts.push(
    `If something is not covered, say you are not sure and suggest how the customer can reach the business (use contact details from the knowledge when present). Do not invent prices, guarantees, or service areas.`,
  )
  parts.push(
    `Write answers with enough detail that a first-time visitor understands the context: prefer a short opening sentence, then **bold** labels and bullet or numbered lists when listing skills, services, or multiple facts. Use ### for a section title only when the answer is long. Separate ideas with blank lines. Avoid one-line replies except for simple yes/no. Do not wrap the entire message in a code fence; use normal Markdown only.`,
  )

  if (platformContact && typeof platformContact === 'object') {
    const pc = platformContact
    const bits = []
    if (pc.name) bits.push(`**Company:** ${pc.name}`)
    if (pc.phone) bits.push(`**Phone:** ${pc.phone}`)
    if (pc.email) bits.push(`**Email:** ${pc.email}`)
    if (pc.address) bits.push(`**Address:** ${pc.address}`)
    if (pc.hours) bits.push(`**Hours:** ${pc.hours}`)
    if (bits.length) {
      parts.push(
        `\n--- Platform / provider contact (when users ask who provides this chat, support, trials, or billing — answer with a tidy Markdown bullet list) ---\n${bits.join('\n')}`,
      )
    }
  }

  parts.push(`\n--- Website URL ---\n${inner.websiteUrl || '(unknown)'}`)
  parts.push(`\n--- Page title ---\n${inner.pageTitle || '(none)'}`)

  if (inner.confidentialPrompts && String(inner.confidentialPrompts).trim()) {
    parts.push(`\n--- Private operator instructions (follow these carefully) ---\n${String(inner.confidentialPrompts).trim()}`)
  }

  if (inner.structuredContext && typeof inner.structuredContext === 'object') {
    parts.push(
      `\n--- Structured business knowledge (JSON) ---\n${JSON.stringify(inner.structuredContext, null, 2)}`,
    )
  }

  const raw = String(inner.scrapedText || '')
  const clipped = raw.length > MAX_SCRAPE_IN_PROMPT ? raw.slice(0, MAX_SCRAPE_IN_PROMPT) + '\n\n[…website text truncated for model context…]' : raw
  parts.push(`\n--- Website visible text (reference) ---\n${clipped}`)

  return parts.join('\n')
}
