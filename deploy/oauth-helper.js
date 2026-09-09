// Einmaliger OAuth-Helper: Holt User-Zustimmung fuer Google Calendar
// Aufruf: node oauth-helper.js <client_id> <client_secret> <output.json>
// Oeffnet Browser, user klickt erlauben, speichert refresh_token JSON.

import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'

const [clientId, clientSecret, outFile] = process.argv.slice(2)
if (!clientId || !clientSecret || !outFile) {
  console.error('Benutzung: node oauth-helper.js <client_id> <client_secret> <output.json>')
  process.exit(1)
}

const port = 8123
const redirectUri = `http://localhost:${port}/`

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar',
    access_type: 'offline',
    prompt: 'consent',
  }).toString()

console.log('Oeffne Browser mit dieser URL – erlaube den Zugriff:\n')
console.log(authUrl)
console.log()

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  if (error) {
    res.end(`<h3>Fehler: ${error}</h3><p>Fenster kann geschlossen werden.</p>`)
    console.error('OAuth-Fehler:', error)
    server.close()
    return
  }
  if (!code) {
    res.end('<h3>Kein Code erhalten.</h3>')
    return
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.refresh_token) {
    console.error('Kein refresh_token in Antwort:', JSON.stringify(tokenData).slice(0, 300))
    res.end('<h3>Token-Fehler – Details im Terminal.</h3>')
    return
  }
  const payload = {
    type: 'authorized_user',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokenData.refresh_token,
  }
  writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n')
  res.end('<h3>Fertig! Zugriff gespeichert. Fenster kann geschlossen werden.</h3>')
  console.log(`Gespeichert nach ${outFile}`)
  setTimeout(() => server.close(), 500)
})

server.listen(port, () => {
  console.log(`Warte auf OAuth-Callback auf http://localhost:${port}/ ...`)
})