import { config } from './config.js'
import { askOpencode } from './brain.js'
import { addMessage } from './memory.js'
import {
  addAppointment,
  deleteAppointment,
  listAppointments,
  formatList,
  formatWhen,
} from './scheduler.js'
import {
  createCalendarEvent,
  listCalendarEvents,
  deleteCalendarEvent,
  formatUpcoming,
} from './calendar.js'
import { isAllowed, markReplied, isInReplyWindow } from './rules.js'

export async function handleMessage(conn, msg) {
  const chatId = msg.sender
  if (!chatId) return

  if (msg.isGroup && config.ignoreGroups) return
  if (!isAllowed(chatId)) return
  if (config.replyWindow.enabled && !isInReplyWindow()) return

  const text = msg.text
  if (!text?.trim()) return

  const chatName = chatId.replace('+', '')
  addMessage(chatId, 'user', text)

  try {
    const { reply, action } = await askOpencode({ messageText: text, chatName, chatId })
    let finalText = reply || ''

    if (action?.action === 'cal_add') {
      const wantsSync = /#sync/i.test(text) || String(action.sync ?? '').toLowerCase() === 'true'
      try {
        const evt = await createCalendarEvent({
          text: action.text,
          at: action.at,
          durationMinutes: config.calendarDurationMinutes,
          attendees: wantsSync ? config.syncAttendees : [],
          sendInvites: wantsSync,
        })
        finalText = evt
          ? wantsSync
            ? `Im Kalender eingetragen und ${config.syncAttendees.join(', ')} eingeladen: "${evt.summary}"`
            : `Im Kalender eingetragen: "${evt.summary}"`
          : 'Ich habe die Zeit nicht richtig verstanden. Schreib z. B.: "Trag morgen um 15 Uhr Zahnarzt in den Kalender ein"'
      } catch (err) {
        finalText = `Kalender-Fehler: ${err.message}`
      }
    } else if (action?.action === 'cal_list') {
      try {
        const items = await listCalendarEvents()
        finalText = formatUpcoming(items)
      } catch (err) {
        finalText = `Kalender-Fehler: ${err.message}`
      }
    } else if (action?.action === 'cal_delete') {
      try {
        await deleteCalendarEvent(action.id)
        finalText = 'Kalender-Eintrag geloescht.'
      } catch (err) {
        finalText = `Kalender-Fehler: ${err.message}`
      }
    } else if (action?.action === 'add') {
      const appt = addAppointment({ text: action.text, at: action.at, chatId, repeat: action.repeat })
      finalText = appt
        ? `Gespeichert: ${formatWhen(appt)} - ${appt.text}`
        : 'Ich habe die Zeit nicht richtig verstanden. Schreib z. B.: "Erinnere mich morgen um 15 Uhr an Zahnarzt"'
    } else if (action?.action === 'delete') {
      const removed = deleteAppointment(action.id)
      finalText = removed > 0
        ? 'Erinnerung geloescht.'
        : 'Erinnerung nicht gefunden. Schreib "Erinnerungen" fuer die Liste.'
    } else if (action?.action === 'list') {
      const items = listAppointments()
      finalText = items.length
        ? `Deine Erinnerungen:\n${formatList(items)}`
        : 'Keine Erinnerungen gespeichert.'
    }

    if (finalText) {
      try {
        await conn.sendText(chatId, finalText)
      } catch (err) {
        console.warn(`[WARN] Senden fehlgeschlagen, 1 Retry: ${err.message}`)
        await new Promise((r) => setTimeout(r, 3000))
        await conn.sendText(chatId, finalText)
      }
      addMessage(chatId, 'assistant', finalText)
      markReplied(chatId)
      console.log(`[REPLY] ${chatName}: ${finalText}`)
    }
  } catch (err) {
    console.error(`[ERROR] Antwort fuer ${chatName} fehlgeschlagen:`, err.message)
  }
}
