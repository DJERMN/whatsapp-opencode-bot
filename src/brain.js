import { spawn } from 'node:child_process'
import { config } from './config.js'

function runOpenCode(prompt) {
  return new Promise((resolve, reject) => {
    const child = spawn(config.opencodeBinary, ['run', prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

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
        resolve(stdout.trim())
      } else {
        reject(new Error(`opencode exit ${code}: ${stderr.trim()}`))
      }
    })
  })
}

export async function askOpencode({ messageText, chatName }) {
  const prompt = [
    'Du antwortest fuer mich in WhatsApp. Eigene Instruktionen:',
    config.persona,
    '',
    `[Nachricht von: ${chatName}]`,
    messageText,
    '',
    'Gib jetzt ausschliesslich den Text aus, den ich als Antwort senden soll.',
    'Nur den Antworttext, ohne Anfuehrungszeichen, ohne Erklaerungen.',
  ].join('\n')

  const reply = await runOpenCode(prompt)
  if (!reply) throw new Error('opencode hat leere Antwort geliefert')
  return reply
}
