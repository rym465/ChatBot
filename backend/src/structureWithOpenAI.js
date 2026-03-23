/**
 * Turn noisy page text into a stable JSON "knowledge" object for chatbot / RAG context.
 * Requires OPENAI_API_KEY. Uses Chat Completions + json_object response format.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

/** ~30k tokens upper bound safety for input side with gpt-4o-mini class models */
const MAX_SCRAPE_CHARS = 100_000

const SYSTEM_PROMPT = `You are preparing structured knowledge for a customer-facing website chatbot.
Use ONLY facts from the scraped website text.
Do not include or invent owner personal details (name/email/phone). Only use contact details that are clearly visible in the scraped website text.
Do not invent other phone numbers, prices, guarantees, or locations.
If something is unclear or missing from the scrape, use null or empty arrays.

Return a single JSON object with exactly these keys (all required):
- businessSummary: string, 2-5 sentences in plain English
- inferredBusinessName: string or null
- servicesOrOfferings: array of short strings
- serviceAreasOrLocations: array of short strings
- hoursAndAvailability: string or null
- contact: { "phones": string[], "emails": string[], "addresses": string[], "otherLinks": string[] } (from site text; may include owner phone/email when the verified owner line lists them)
- websiteOwnerContact: { "name": string|null, "email": string|null, "phone": string|null } — always null (owner personal details must not be taken from non-scraped input)
- faqs: array of { "question": string, "answer": string } (only if clearly Q&A on page; else [])
- policiesGuaranteesOrWarranties: string[] (short bullets)
- emergencyOrUrgencyNotes: string or null (e.g. 24/7, after-hours)
- topicsCustomerMightAsk: string[] (likely user questions, grounded in text; do NOT include owner-contact questions)
- thingsTheBotShouldNotClaim: string[] (e.g. exact prices if not listed)
- confidenceNote: string, one sentence about how complete the scrape seems

Output must be valid JSON only, no markdown.`

function truncateForModel(text, max = MAX_SCRAPE_CHARS) {
  if (!text || text.length <= max) return text
  return (
    text.slice(0, max) +
    '\n\n[…truncated before sending to model; full raw text is still available separately…]'
  )
}

function extractJsonFromAssistantContent(content) {
  if (!content || typeof content !== 'string') throw new Error('Empty model response')
  let t = content.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t)
  if (fence) t = fence[1].trim()
  return JSON.parse(t)
}

/**
 * @param {{ url: string, title: string, scrapedText: string, owner?: { name?: string, email?: string, phone?: string } }} input
 * @returns {Promise<{ structured: object, model: string, inputCharsUsed: number }>}
 */
export async function structureWebsiteForChatbot(input) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || !apiKey.trim()) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  const model = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
  const bodyText = truncateForModel(input.scrapedText || '')

  const userContent = `Page URL: ${input.url}
Document title: ${input.title || '(none)'}

--- BEGIN SCRAPED VISIBLE TEXT ---
${bodyText}
--- END SCRAPED VISIBLE TEXT ---

Produce the JSON object as specified.`

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
    }),
  })

  const raw = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = raw?.error?.message || raw?.message || `OpenAI HTTP ${res.status}`
    throw new Error(msg)
  }

  const content = raw?.choices?.[0]?.message?.content
  let structured
  try {
    structured = extractJsonFromAssistantContent(content)
  } catch (e) {
    throw new Error(`Model did not return valid JSON: ${e.message}`)
  }

  return {
    structured,
    model,
    inputCharsUsed: bodyText.length,
  }
}
