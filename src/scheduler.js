import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { config } from './config.js'

const DATA_DIR = 'data'
const FILE = `${DATA_DIR}/appointments.json`
const TICK_MS = 30_000
const RETRY_AFTER_MS = 60_000

let appointments = load()

function load() {
  mkdirSync(DATA_DIR, { recursive: true })
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'))
  } catch {
    return []
  }
}

function save() {
  writeFileSync(FILE, JSON.stringify(appointments, null, 2))
}

export function listAppointments() {
  return [...appointments].sort((a, b) => new Date(a.at) - new Date(b.at))
}

export function addAppointment({ text, at, chatId, repeat = null }) {
  const date = parseDate(at)
  if (!date || !text?.trim()) return null
  const appt = {
    id: randomUUID(),
    text: text.trim(),
    chatId,
    at: date.toISOString(),
    repeat: repeat === 'daily' ? 'daily' : null,
    createdAt: new Date().toISOString(),
  }
  appointments.push(appt)
  save()
  return appt
}

function parseDate(input) {
  if (typeof input !== 'string') return null
  const date = new Date(input.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

export function deleteAppointment(idOrIndex) {
  const before = appointments.length
  appointments = appointments.filter((a) => a.id !== String(idOrIndex))
  if (appointments.length === before) {
    const idx = Number(idOrIndex) - 1
    if (Number.isInteger(idx) && idx >= 0 && idx < appointments.length) {
      appointments.splice(idx, 1)
    }
  }
  save()
  return before - appointments.length
}

export function formatWhen(appt) {
  const d = new Date(appt.at)
  const date = d.toLocaleDateString('de-DE')
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

export function formatList(items, withId = false) {
  return items
    .map((a, i) => `${i + 1}. ${formatWhen(a)} – ${a.text}${withId ? ` (id: ${a.id})` : ''}`)
    .join('\n')
}

export function startScheduler(getSend) {
  if (!config.schedulerEnabled) {
    console.log('[SCHEDULER] Deaktiviert (SCHEDULER_ENABLED=false)')
    return
  }

  const check = async () => {
    const now = Date.now()
    const due = appointments.filter((a) => new Date(a.at).getTime() <= now)
    if (due.length === 0) return

    const send = getSend()
    for (const appt of due) {
      if (!send) continue
      try {
        await send(appt.chatId, `\u23F0 Erinnerung: ${appt.text}`)
        appointments = appointments.filter((a) => a.id !== appt.id)
        if (appt.repeat === 'daily') {
          const next = new Date(appt.at)
          next.setDate(next.getDate() + 1)
          appointments.push({ ...appt, at: next.toISOString() })
        }
        save()
        console.log(`[SCHEDULER] Erinnerung gesendet an ${appt.chatId}: ${appt.text}`)
      } catch (err) {
        console.error(`[SCHEDULER] Senden fehlgeschlagen (${appt.text}), Retry in 1 min:`, err.message)
        appt.at = new Date(now + RETRY_AFTER_MS).toISOString()
      }
    }
  }

  setInterval(() => {
    check().catch((err) => console.error('[SCHEDULER]', err.message))
  }, TICK_MS)

  console.log('[SCHEDULER] Gestartet - prueft alle 30s auf faellige Erinnerungen')
}
