import { config } from './config.js'
import { SignalConn } from './signal.js'
import { handleMessage } from './handler.js'
import { startScheduler } from './scheduler.js'

if (!config.signalAccount) {
  console.log('[WARN] SIGNAL_ACCOUNT fehlt. Kopiere .env.example nach .env und passe es an.')
}

const conn = new SignalConn()
let schedulerStarted = false

conn.start((msg) => handleMessage(conn, msg))

if (!schedulerStarted) {
  startScheduler(() => (chatId, text) => conn.sendText(chatId, text))
  schedulerStarted = true
}
