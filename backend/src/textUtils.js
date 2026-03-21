/**
 * Collapse noisy whitespace from DOM innerText while keeping paragraphs readable.
 * innerText already skips <script>/<style> in modern browsers; this is layout text only.
 */
export function cleanWebsiteText(raw) {
  if (!raw || typeof raw !== 'string') return ''
  return raw
    .replace(/\r/g, '')
    .replace(/[\u00a0\u200b\u200c\u200d\ufeff]/g, ' ')
    .replace(/\u2028|\u2029/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
