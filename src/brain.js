import { spawn } from 'node:child_process'
import { config } from './config.js'
import { listAppointments, formatList } from './scheduler.js'
import { getHistory } from './memory.js'

const ACTION_RE = /ACTION:\s*(?:```(?:json)?\s*)?(\{[\s\S]*?\})\s*(?:```)?/

function parseAction(reply) {
  const match = reply.match(ACTION_RE)
  if (!match) return { reply, action: { action: 'none' } }
  try {
    const action = JSON.parse(match[1])
    return { reply: reply.replace(ACTION_RE, '').trim(), action }
  } catch {
    return { reply, action: { action: 'none' } }
  }
}

async function callApi(messages) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.brainTimeoutMs)

  try {
    const res = await fetch(config.aiApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.aiAuth === 'bearer'
          ? { Authorization: `Bearer ${config.aiApiKey}` }
          : { 'api-key': config.aiApiKey }),
      },
      body: JSON.stringify({
        model: config.aiModel,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`LLM-API ${res.status}: ${body.slice(0, 200)}`)
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) throw new Error('LLM-API lieferte leere Antwort')
    return content.trim()
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`LLM-API hat ${config.brainTimeoutMs}ms ueberschritten`)
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

function cleanOutput(raw) {
  return raw
    .replace(/\x1b\[[0-9;]*m/g, '')
    .split('\n')
    .filter((line) => !/^>\s*build\b/i.test(line.trim()))
    .join('\n')
    .trim()
}

function runOpenCode(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.opencodeBinary, ['run', prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdin?.on('error', () => {})
    child.stdin?.end()

    let stdout = ''
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGKILL')
        reject(new Error(`opencode hat ${config.brainTimeoutMs}ms ueberschritten`))
      }
    }, config.brainTimeoutMs)

    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))

    child.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        reject(err)
      }
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (code === 0) {
        resolve(cleanOutput(stdout))
      } else {
        reject(new Error(`opencode exit ${code}: ${stderr.trim()}`))
      }
    })
  })
}

async function generate(messages, chatName) {
  if (config.aiApiUrl && config.aiApiKey) {
    return callApi(messages)
  }
  const flat = messages
    .map((m) => (m.role === 'system' ? m.content : `[${m.role}] ${m.content}`))
    .join('\n\n')
  return runOpenCode(flat)
}

export async function askOpencode({ messageText, chatName, chatId }) {
  const now = new Date()
  const currentTime = now.toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' })
  const appts = listAppointments()
  const apptBlock = appts.length
    ? `Gespeicherte Erinnerungen (id muss unveraendert bleiben):\n${formatList(appts, true)}`
    : 'Gespeicherte Erinnerungen: keine'

  const systemPrompt = [
    'Du bist mein persoenlicher Assistent ueber Signal. Eigene Instruktionen:',
    config.persona,
    '',
    `Aktuelle Zeit: ${currentTime}`,
    apptBlock,
    '',
    'Regeln:',
    '1. Kalender (Google Kalender eintragen): ACTION: {"action":"cal_add","text":"<was>","at":"YYYY-MM-DD HH:MM"}',
    '   Wenn der Nutzer #sync erwaehnt, wird automatisch eingeladen - das handled der Handler, keine extra Action noetig.',
    '2. Kalender anzeigen: ACTION: {"action":"cal_list"}',
    '3. Kalender-Eintrag loeschen: ACTION: {"action":"cal_delete","id":"<id>"}',
    '4. Erinnerung (Signal-Erinnerung): ACTION: {"action":"add","text":"<was>","at":"YYYY-MM-DD HH:MM","repeat":"daily"}',
    '   repeat ist "daily" fuer taegliche Erinnerung, sonst null.',
    '5. Erinnerungen anzeigen: ACTION: {"action":"list"}',
    '6. Erinnerung loeschen: ACTION: {"action":"delete","id":"<id>"}',
    '7. Wenn nichts davon zutrifft: ACTION: {"action":"none"}',
    '8. at immer in Ortszeit als volle Uhrzeit (z. B. "2026-09-10 15:00"). "morgen" = Datum von morgen.',
    '9. Wenn nach Termin/Kalender/aufschreiben gefragt wird -> Kalender-Action nutzen.',
    '10. Nach der ACTION-Zeile gibst du Text aus, den ich als Antwort sehen soll.',
    '11. Wenn Nutzer fragt, was du bist: verrate nie, dass du KI/LLM bist; bleib eine natuerliche Person.',
  ].join('\n')

  const history = getHistory(chatId)
  const messages = [{ role: 'system', content: systemPrompt }]
  for (const m of history.slice(-20)) {
    messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: 'user', content: `[Nachricht von: ${chatName}]\n${messageText}` })

  const raw = await generate(messages, chatName)
  return parseAction(raw)
}
