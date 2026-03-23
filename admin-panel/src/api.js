const API_ROOT = ''

export function api(path) {
  const p = path.startsWith('/') ? path.slice(1) : path
  return `${API_ROOT}/api/${p}`
}

export const ADMIN_API = {
  metrics: api('admin/metrics'),
  analytics: (days = 14) => api(`admin/analytics?days=${encodeURIComponent(String(days))}`),
  chatbots: (limit = 25) => api(`admin/chatbots?limit=${encodeURIComponent(String(limit))}`),
  trials: (status = 'active', limit = 25) =>
    api(`admin/trials?status=${encodeURIComponent(String(status))}&limit=${encodeURIComponent(String(limit))}`),
  conversations: ({ chatbotId = '', limit = 50 } = {}) => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (String(chatbotId).trim()) params.set('chatbotId', String(chatbotId).trim())
    return api(`admin/conversations?${params.toString()}`)
  },
  messages: ({ chatbotId = '', threadId = '', limit = 200 } = {}) => {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    if (String(chatbotId).trim()) params.set('chatbotId', String(chatbotId).trim())
    if (String(threadId).trim()) params.set('threadId', String(threadId).trim())
    return api(`admin/messages?${params.toString()}`)
  },
  settings: api('admin/settings'),
  deleteChatbot: (chatbotId) => api(`admin/chatbot/${encodeURIComponent(String(chatbotId))}`),
}

