import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { config } from './config.js'

export class SignalConn {
  constructor() {
    this.child = null
    this.onMessage = null
    this.seenKeys = new Set()
    this.seenQueue = []
    this.selfEchoKeys = new Set()
    this.pendingRequests = new Map()
    this.requestId = 0
    this.connected = false
  }

  start(onMessage) {
    this.onMessage = onMessage
    this.launch()
  }

  launch() {
    const args = [
      '-a', config.signalAccount,
      'jsonRpc',
      '--receive-mode', 'on-connection',
    ]
    this.child = spawn(config.signalCliPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.child.on('error', (err) => {
      console.error('[SIGNAL] Startfehler:', err.message)
    })

    this.child.on('close', (code) => {
      this.connected = false
      for (const resolve of this.pendingRequests.values()) {
        resolve({ jsonrpc: '2.0', error: { message: 'Signal jsonRpc getrennt' } })
      }
      this.pendingRequests.clear()
      console.warn(`[SIGNAL] jsonRpc beendet (code ${code}), Neustart in 5s...`)
      setTimeout(() => this.launch(), 5000)
    })

    this.child.on('spawn', () => {
      this.connected = true
      console.log('[SIGNAL] jsonRpc verbunden')
    })

    const rl = createInterface({ input: this.child.stdout, terminal: false })
    rl.on('line', (line) => {
      if (!line.trim()) return
      try {
        const msg = JSON.parse(line)
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
          this.pendingRequests.get(msg.id)(msg)
          this.pendingRequests.delete(msg.id)
        } else if (msg.method === 'receive') {
          this.dispatch(msg.params)
        }
      } catch {
        // ignore malformed lines
      }
    })

    this.child.stderr.on('data', (d) => process.stderr.write(`[signal-cli] ${d}`))
  }

  dispatch(params) {
    const env = params?.envelope
    if (!env) return

    const debug = process.env.DEBUG_SIGNAL === '1'

    if (debug) {
      const type = env.syncMessage ? 'SYNC' : env.dataMessage ? 'DATA' : '???'
      const preview = env.dataMessage?.message ?? env.syncMessage?.sentMessage?.message ?? '(leer)'
      console.log(`[SIGNAL-DEBUG] ${type} von ${env.sourceNumber}: ${preview.slice(0, 80)}`)
    }

    if (env.syncMessage) {
      this.dispatchSync(env)
      return
    }

    const dm = env.dataMessage
    if (!dm) return

    const sender = env.sourceNumber ?? env.source ?? ''
    if (!sender) return

    const isGroup = Boolean(dm.groupId || dm.groupV2)
    if (isGroup && config.ignoreGroups) return

    this.route({ sender, isGroup, text: dm.message, timestamp: dm.timestamp ?? env.timestamp })
  }

  dispatchSync(env) {
    const sm = env.syncMessage
    const sent = sm?.sentMessage
    if (!sent?.message) return

    const dest = sent.destinationNumber ?? sent.destination ?? ''
    if (dest.replace(/[^0-9]/g, '') !== config.signalAccount.replace(/[^0-9]/g, '')) return

    if (this.selfEchoKeys.has(String(sent.timestamp))) return

    const sender = env.sourceNumber ?? env.source ?? ''
    if (!sender) return

    this.route({ sender, isGroup: false, text: sent.message, timestamp: sent.timestamp ?? env.timestamp })
  }

  route(msg) {
    const key = `${msg.sender}:${msg.timestamp}`
    if (this.seenKeys.has(key)) return
    this.seenKeys.add(key)
    this.seenQueue.push(key)
    if (this.seenQueue.length > 500) this.seenKeys.delete(this.seenQueue.shift())

    const text = msg.text
    if (!text?.trim()) return

    console.log(`[MSG] ${msg.sender.replace('+', '')}: ${text}`)
    if (this.onMessage) {
      Promise.resolve(this.onMessage(msg)).catch((e) => console.error('[HANDLER]', e.message))
    }
  }

  command(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.child?.stdin.writable) {
        reject(new Error('Signal jsonRpc nicht verbunden'))
        return
      }
      const id = ++this.requestId
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Signal RPC-Timeout fuer ${method}`))
      }, 90_000)
      this.pendingRequests.set(id, (res) => {
        clearTimeout(timer)
        if (res.error) reject(new Error(`Signal RPC-Fehler: ${res.error.message}`))
        else resolve(res.result)
      })
      const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
      this.child.stdin.write(req)
    })
  }

  async sendText(recipient, text) {
    const result = await this.command('send', {
      account: config.signalAccount,
      recipient,
      message: text,
    })
    const ts = result?.timestamp
    if (ts) {
      this.selfEchoKeys.add(String(ts))
      if (this.selfEchoKeys.size > 2000) this.selfEchoKeys.clear()
    }
    return result
  }
}
