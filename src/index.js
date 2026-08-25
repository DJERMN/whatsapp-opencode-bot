import pino from 'pino'
import qrcode from 'qrcode-terminal'
import {
  makeWASocket,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  DisconnectReason,
} from 'baileys'
import { handleMessage } from './handler.js'

const logger = pino({ level: 'info' })

async function startSocket() {
  const { state, saveCreds } = await useMultiFileAuthState('sessions')
  const { version, isLatest } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      console.log('\n[OK] Angemeldet! Warte auf Nachrichten...')
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const willReconnect =
        code === undefined ||
        code === DisconnectReason.restartRequired ||
        code === DisconnectReason.connectionClosed ||
        code === DisconnectReason.timedOut

      if (code === DisconnectReason.loggedOut) {
        console.log('[LOGOUT] Ausgeloggt - QR-Code erneut noetig. Starte neu...')
        return startSocket()
      }
      if (code === DisconnectReason.badSession) {
        console.log('[ERROR] Session beschadigt. Loesche den Ordner "sessions/" und starte neu.')
        return
      }
      if (willReconnect) {
        console.log('[RECONNECT] Verbindung verloren, reconnecte...')
        setTimeout(startSocket, 3000)
      } else {
        console.log('[ERROR] Nicht wiederhergestellter Disconnect-Code:', code)
      }
    }
  })

  sock.ev.on('qr', (qr) => {
    console.log('\n[SCAN] QR-Code mit WhatsApp scannen (Einstellungen > Verknuepfte Geraete):\n')
    qrcode.generate(qr, { small: true })
  })

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return
    for (const message of messages) {
      handleMessage(sock, message)
    }
  })
}

if (!process.env.PERSONA) {
  console.log('[WARN] Keine .env gefunden: Kopiere .env.example nach .env und passe es an.')
}

startSocket().catch((err) => {
  console.error('Fehler beim Start:', err)
  process.exit(1)
})
