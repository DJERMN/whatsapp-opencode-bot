import { config } from './config.js'

const lastReplyAt = new Map()

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function isInReplyWindow(now = new Date()) {
  const cur = now.getHours() * 60 + now.getMinutes()
  const start = toMinutes(config.replyWindow.start)
  const end = toMinutes(config.replyWindow.end)
  return cur >= start && cur <= end
}

export function isAllowed(jid) {
  if (config.allowedNumbers.length === 0) return true
  const number = jid.split('@')[0].split(':')[0]
  return config.allowedNumbers.includes(number)
}

export function isIgnoredChat(jid) {
  return jid.endsWith('@g.us') && config.ignoreGroups
}

export function cooldownActive(jid) {
  const last = lastReplyAt.get(jid)
  if (!last) return false
  const diffMin = (Date.now() - last) / 60_000
  return diffMin < config.replyCooldownMinutes
}

export function markReplied(jid) {
  lastReplyAt.set(jid, Date.now())
}
