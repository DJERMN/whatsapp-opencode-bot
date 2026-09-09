const histories = new Map()
const MAX_MESSAGES = 30

export function addMessage(chatId, role, content) {
  if (!chatId || !content?.trim()) return
  if (!histories.has(chatId)) histories.set(chatId, [])
  const h = histories.get(chatId)
  h.push({ role, content })
  if (h.length > MAX_MESSAGES) h.splice(0, h.length - MAX_MESSAGES)
}

export function getHistory(chatId) {
  return histories.get(chatId) ?? []
}

export function clearHistory(chatId) {
  histories.delete(chatId)
}