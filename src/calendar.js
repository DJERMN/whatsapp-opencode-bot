import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'
import { config } from './config.js'

let cachedToken = { value: null, expiresAt: 0 }

function loadCredentials() {
  const raw = readFileSync(config.calendarCredentialsPath, 'utf8')
  return JSON.parse(raw)
}

function makeJwt(creds) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const unsigned = `${b64(header)}.${b64(claims)}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  const signature = signer.sign(creds.private_key, 'base64')
  return `${unsigned}.${signature}`
}

async function getAccessToken() {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value
  }
  const creds = loadCredentials()

  if (creds.refresh_token) {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
    })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`Token-Fehler ${res.status}: ${err.slice(0, 200)}`)
    }
    const data = await res.json()
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    }
    return cachedToken.value
  }

  const grantType = 'urn:ietf:params:oauth:grant-type:jwt-bearer'
  const body = new URLSearchParams({
    grant_type: grantType,
    assertion: makeJwt(creds),
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Token-Fehler ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.value
}

async function api(path, opts = {}) {
  const token = await getAccessToken()
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Calendar API ${res.status}: ${err.slice(0, 200)}`)
  }
  const text = await res.text().catch(() => '')
  return text ? JSON.parse(text) : null
}

function parseWhen(at) {
  const m = String(at).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  return { y, mo, d, h, mi }
}

export async function calendarTest() {
  const res = await api('/users/me/calendarList')
  return (res.items ?? []).map((c) => ({
    id: c.id,
    summary: c.summary,
    primary: c.primary === true,
  }))
}

export async function createCalendarEvent({ text, at, durationMinutes = 60, calendarId = config.calendarId, attendees = [], sendInvites = false }) {
  const w = parseWhen(at)
  if (!w) return null
  const start = `${w.y}-${w.mo}-${w.d}T${w.h}:${w.mi}:00`
  const endDate = new Date(`${start}.000Z`)
  endDate.setUTCMinutes(endDate.getUTCMinutes() + durationMinutes)
  const end = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z').slice(0, 19) + 'Z'

  const event = {
    summary: text,
    start: { dateTime: start, timeZone: config.calendarTimezone },
    end: { dateTime: end, timeZone: config.calendarTimezone },
  }
  if (attendees.length) {
    event.attendees = attendees.map((email) => ({ email }))
  }
  const query = sendInvites && attendees.length ? '?sendUpdates=all' : ''
  const created = await api(`/calendars/${encodeURIComponent(calendarId)}/events${query}`, {
    method: 'POST',
    body: event,
  })
  return created
}

export async function listCalendarEvents(calendarId = config.calendarId, days = 14) {
  const now = new Date()
  const timeMin = now.toISOString()
  const timeMax = new Date(now.getTime() + days * 86400_000).toISOString()
  const q = `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=30`
  const res = await api(`/calendars/${encodeURIComponent(calendarId)}/events?${q}`)
  return (res.items ?? []).map((e) => ({
    id: e.id,
    summary: e.summary,
    start: e.start?.dateTime ?? e.start?.date,
  }))
}

export async function deleteCalendarEvent(id, calendarId = config.calendarId) {
  await api(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export function formatUpcoming(items) {
  if (!items.length) return 'Keine kommenden Kalendereintraege.'
  return items
    .map((e) => {
      const d = new Date(e.start)
      const label = d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
      return `- ${label}: ${e.summary}`
    })
    .join('\n')
}