import { config } from './config.js'
import { askOpencode } from './brain.js'
import { isAllowed, isIgnoredChat, cooldownActive, markReplied, isInReplyWindow } from './rules.js'

function extractText(message) {
  const m = message.message
  if (!m) return null
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    null
  )
}

export async function handleMessage(sock, message) {
  if (message.isFromMe) return
  if (message.id?.startsWith('BAE7')) return

  const chatId = message.key.remoteJid
  if (!chatId) return

  if (isIgnoredChat(chatId)) return
  if (!isAllowed(chatId)) return
  if (cooldownActive(chatId)) return
  if (!isInReplyWindow()) return

  const text = extractText(message)
  if (!text?.trim()) return

  const chatName = chatId.split('@')[0]

  console.log(`[MSG] ${chatName}: ${text}`)

  try {
    await sock.sendPresenceUpdate('composing', chatId)
    const reply = await askOpencode({ messageText: text, chatName })
    if (reply) {
      await sock.sendMessage(chatId, { text: reply })
      markReplied(chatId)
      console.log(`[REPLY] ${chatName}: ${reply}`)
    }
  } catch (err) {
    console.error(`[ERROR] Antwort fuer ${chatName} fehlgeschlagen:`, err.message)
  } finally {
    try {
      await sock.sendPresenceUpdate('paused', chatId)
    } catch {
      // Ignorieren
    }
  }
}
